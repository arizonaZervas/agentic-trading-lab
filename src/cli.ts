import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadAdjustedCloseCsv } from "./adapters/csv.ts";
import { runBacktest } from "./domain/backtest.ts";
import { parseCoreDipConfig, runCoreDipBacktest } from "./domain/core-dip.ts";
import { parseStrategyConfig } from "./domain/model.ts";
import { createSignalProposal } from "./domain/proposal.ts";

interface ParsedArguments {
  readonly command: string | undefined;
  readonly values: ReadonlyMap<string, string>;
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const command = argv[0];
  const values = new Map<string, string>();

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined || !token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token ?? "<missing>"}`);
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`Argument ${token} requires a value`);
    }
    values.set(token, next);
    index += 1;
  }

  return { command, values };
}

function requireValue(args: ParsedArguments, name: string): string {
  const value = args.values.get(name);
  if (value === undefined) {
    throw new Error(`Missing required argument ${name}`);
  }
  return value;
}

function rejectUnknownArguments(args: ParsedArguments): void {
  const allowedValues = new Set(["--csv", "--config"]);
  if (args.command === "signal") {
    allowedValues.add("--confirmed-month-end");
  }

  for (const name of args.values.keys()) {
    if (!allowedValues.has(name)) {
      throw new Error(`Unknown argument ${name}`);
    }
  }
}

async function loadStrategyConfig(path: string) {
  const raw: unknown = JSON.parse(await readFile(path, "utf8"));
  return parseStrategyConfig(raw);
}

async function loadCoreDipConfig(path: string) {
  const raw: unknown = JSON.parse(await readFile(path, "utf8"));
  return parseCoreDipConfig(raw);
}

function usage(): string {
  return [
    "Usage:",
    "  npm run backtest -- --csv /path/to/prices.csv [--config strategy.config.json]",
    "  npm run backtest:core-dip -- --csv /path/to/prices.csv [--config core-dip.config.json]",
    "  npm run signal -- --csv /path/to/prices.csv --confirmed-month-end YYYY-MM-DD [--config strategy.config.json]",
    "",
    "CSV requires symbol=SPY, date, close, adjusted_close, is_month_end, and is_first_session_of_month columns.",
    "The core-plus-dip backtest additionally requires open; it evaluates Tuesday/Friday closes and simulates the next observed open.",
    "The signal command never places an order and binds confirmation to the latest month-end date.",
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (
    args.command !== "backtest" &&
    args.command !== "core-dip-backtest" &&
    args.command !== "signal"
  ) {
    throw new Error(usage());
  }
  rejectUnknownArguments(args);

  const csvPath = resolve(requireValue(args, "--csv"));
  const barsPromise = loadAdjustedCloseCsv(csvPath);

  if (args.command === "core-dip-backtest") {
    const configPath = resolve(
      args.values.get("--config") ?? "core-dip.config.json",
    );
    const [bars, config] = await Promise.all([
      barsPromise,
      loadCoreDipConfig(configPath),
    ]);
    console.log(JSON.stringify(runCoreDipBacktest(bars, config), null, 2));
    return;
  }

  const configPath = resolve(args.values.get("--config") ?? "strategy.config.json");
  const [bars, config] = await Promise.all([
    barsPromise,
    loadStrategyConfig(configPath),
  ]);

  if (args.command === "backtest") {
    console.log(JSON.stringify(runBacktest(bars, config), null, 2));
    return;
  }

  const confirmedMonthEndDate = requireValue(args, "--confirmed-month-end");
  console.log(
    JSON.stringify(createSignalProposal(bars, config, confirmedMonthEndDate), null, 2),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
