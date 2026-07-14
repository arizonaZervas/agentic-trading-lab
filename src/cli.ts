import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadAdjustedCloseCsv } from "./adapters/csv.ts";
import {
  parseCoreDipMorningSnapshot,
  parseCoreDipSnapshot,
} from "./adapters/core-dip-snapshot.ts";
import { runBacktest } from "./domain/backtest.ts";
import {
  createCoreDipMorningShadowReport,
  createCoreDipShadowReport,
} from "./domain/core-dip-report.ts";
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
  const allowedValues = new Set(
    args.command === "core-dip-report" || args.command === "core-dip-morning-report"
      ? ["--snapshot", "--config", "--experiment-start"]
      : ["--csv", "--config"],
  );
  if (args.command === "signal") allowedValues.add("--confirmed-month-end");

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

async function loadCoreDipSnapshot(path: string) {
  const raw: unknown = JSON.parse(await readFile(path, "utf8"));
  return parseCoreDipSnapshot(raw);
}

async function loadCoreDipMorningSnapshot(path: string) {
  const raw: unknown = JSON.parse(await readFile(path, "utf8"));
  return parseCoreDipMorningSnapshot(raw);
}

function usage(): string {
  return [
    "Usage:",
    "  npm run backtest -- --csv /path/to/prices.csv [--config strategy.config.json]",
    "  npm run backtest:core-dip -- --csv /path/to/prices.csv [--config core-dip.config.json]",
    "  npm run report:core-dip -- --snapshot /path/to/spy-snapshot.json --experiment-start YYYY-MM-DD [--config core-dip.config.json]",
    "  npm run report:core-dip:morning -- --snapshot /path/to/spy-morning-snapshot.json --experiment-start YYYY-MM-DD [--config core-dip-morning.config.json]",
    "  npm run signal -- --csv /path/to/prices.csv --confirmed-month-end YYYY-MM-DD [--config strategy.config.json]",
    "",
    "CSV requires symbol=SPY, date, close, adjusted_close, is_month_end, and is_first_session_of_month columns.",
    "The core-plus-dip backtest additionally requires open; it evaluates Tuesday/Friday closes and simulates the next observed open.",
    "The core-plus-dip report validates a final official SPY close, replays shadow state from the pinned experiment start, and never places an order.",
    "The morning report uses the prior completed session for its signal; the 6:30 AM opening print is reference-only and never a promised fill.",
    "The signal command never places an order and binds confirmation to the latest month-end date.",
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (
    args.command !== "backtest" &&
    args.command !== "core-dip-backtest" &&
    args.command !== "core-dip-report" &&
    args.command !== "core-dip-morning-report" &&
    args.command !== "signal"
  ) {
    throw new Error(usage());
  }
  rejectUnknownArguments(args);

  if (args.command === "core-dip-morning-report") {
    const snapshotPath = resolve(requireValue(args, "--snapshot"));
    const configPath = resolve(
      args.values.get("--config") ?? "core-dip-morning.config.json",
    );
    const experimentStartDate = requireValue(args, "--experiment-start");
    const [snapshot, config] = await Promise.all([
      loadCoreDipMorningSnapshot(snapshotPath),
      loadCoreDipConfig(configPath),
    ]);
    const report = createCoreDipMorningShadowReport(
      snapshot.bars,
      config,
      snapshot.reportDate,
      experimentStartDate,
      snapshot.openingReference,
    );
    console.log(
      JSON.stringify(
        {
          sourceData: {
            schemaVersion: snapshot.schemaVersion,
            symbol: snapshot.symbol,
            reportDate: snapshot.reportDate,
            fetchedAt: snapshot.fetchedAt,
            priorOfficialClose: snapshot.priorOfficialClose,
            adjustedHistoryProvenance: snapshot.adjustedHistoryProvenance,
            openingReference: snapshot.openingReference,
            dataFingerprint: snapshot.dataFingerprint,
          },
          report,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (args.command === "core-dip-report") {
    const snapshotPath = resolve(requireValue(args, "--snapshot"));
    const configPath = resolve(
      args.values.get("--config") ?? "core-dip.config.json",
    );
    const experimentStartDate = requireValue(args, "--experiment-start");
    const [snapshot, config] = await Promise.all([
      loadCoreDipSnapshot(snapshotPath),
      loadCoreDipConfig(configPath),
    ]);
    const report = createCoreDipShadowReport(
      snapshot.bars,
      config,
      snapshot.officialClose.date,
      experimentStartDate,
    );
    console.log(
      JSON.stringify(
        {
          sourceData: {
            symbol: snapshot.symbol,
            fetchedAt: snapshot.fetchedAt,
            officialClose: snapshot.officialClose,
            dataFingerprint: snapshot.dataFingerprint,
          },
          report,
        },
        null,
        2,
      ),
    );
    return;
  }

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
