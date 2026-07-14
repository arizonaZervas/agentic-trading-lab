import assert from "node:assert/strict";
import test from "node:test";

import { parseAdjustedCloseCsv } from "../src/adapters/csv.ts";
import {
  parseCoreDipConfig,
  runCoreDipBacktest,
  type CoreDipConfig,
} from "../src/domain/core-dip.ts";
import type { PriceBar } from "../src/domain/model.ts";

function bar(date: string, close: number, open = close): PriceBar {
  return {
    symbol: "SPY",
    date,
    open,
    close,
    adjustedOpen: open,
    adjustedClose: close,
    isMonthEnd: false,
    isFirstSessionOfMonth: false,
  };
}

const WARMUP_DATES = [
  "2025-12-11",
  "2025-12-12",
  "2025-12-15",
  "2025-12-16",
  "2025-12-17",
  "2025-12-18",
  "2025-12-19",
  "2025-12-22",
  "2025-12-23",
  "2025-12-24",
  "2025-12-26",
  "2025-12-29",
  "2025-12-30",
  "2025-12-31",
  "2026-01-02",
] as const;

function config(
  overrides: Partial<
    Pick<CoreDipConfig, "slippageBpsPerSide" | "fixedFeeUsdPerOrder">
  > = {},
): CoreDipConfig {
  return parseCoreDipConfig({
    symbol: "SPY",
    startingCashUsd: 100,
    coreAllocationPct: 60,
    drawdownLookbackTradingDays: 20,
    drawdownTiersPct: [2, 5, 8, 12],
    trancheUsd: 10,
    evaluationWeekdays: ["TUESDAY", "FRIDAY"],
    slippageBpsPerSide: 0,
    fixedFeeUsdPerOrder: 0,
    paperOnly: true,
    ...overrides,
  });
}

function withWarmup(bars: readonly PriceBar[]): PriceBar[] {
  return [
    ...WARMUP_DATES.map((date) => bar(date, 100)),
    ...bars,
  ];
}

function run(
  bars: readonly PriceBar[],
  strategyConfig = config(),
) {
  return runCoreDipBacktest(withWarmup(bars), strategyConfig);
}

test("CSV open is optional for the old strategy and derives a split-safe adjusted open", () => {
  assert.deepEqual(
    parseAdjustedCloseCsv(
      "Symbol,Date,Open,Close,Adj Close,is_month_end,is_first_session_of_month\nSPY,2026-01-05,200,220,110,false,false\n",
    ),
    [
      {
        symbol: "SPY",
        date: "2026-01-05",
        open: 200,
        close: 220,
        adjustedOpen: 100,
        adjustedClose: 110,
        isMonthEnd: false,
        isFirstSessionOfMonth: false,
      },
    ],
  );

  const withoutOpen = parseAdjustedCloseCsv(
    "Symbol,Date,Close,Adj Close,is_month_end,is_first_session_of_month\nSPY,2026-01-05,100,100,false,false\n",
  );
  assert.equal(withoutOpen[0]?.open, undefined);
  assert.throws(
    () => runCoreDipBacktest(withoutOpen, config()),
    /require a valid open price/,
  );

  assert.throws(
    () =>
      runCoreDipBacktest(
        [
          { ...bar("2026-01-05", 100), symbol: "QQQ" },
          { ...bar("2026-01-06", 100), symbol: "QQQ" },
          { ...bar("2026-01-07", 100), symbol: "QQQ" },
        ],
        config(),
      ),
    /explicitly labeled SPY/,
  );
});

test("core-plus-dip configuration fails closed on scope, budget, tier, fee, and live-mode violations", () => {
  const valid = {
    symbol: "SPY",
    startingCashUsd: 100,
    coreAllocationPct: 60,
    drawdownLookbackTradingDays: 20,
    drawdownTiersPct: [2, 5, 8, 12],
    trancheUsd: 10,
    evaluationWeekdays: ["TUESDAY", "FRIDAY"],
    slippageBpsPerSide: 10,
    fixedFeeUsdPerOrder: 0,
    paperOnly: true,
  };

  assert.throws(
    () => parseCoreDipConfig({ ...valid, symbol: "QQQ" }),
    /restricted to SPY/,
  );
  assert.throws(
    () => parseCoreDipConfig({ ...valid, coreAllocationPct: 70 }),
    /exceed the cash left/,
  );
  assert.throws(
    () => parseCoreDipConfig({ ...valid, drawdownTiersPct: [2, 8, 5, 12] }),
    /strictly increasing/,
  );
  assert.throws(
    () => parseCoreDipConfig({ ...valid, fixedFeeUsdPerOrder: 10 }),
    /less than both/,
  );
  assert.throws(
    () => parseCoreDipConfig({ ...valid, paperOnly: false }),
    /no live-order mode/,
  );
  assert.throws(
    () => parseCoreDipConfig({ ...valid, drawdownLookbackTradingDays: 19 }),
    /rules are frozen/,
  );
  assert.throws(
    () => parseCoreDipConfig({ ...valid, evaluationWeekdays: ["TUESDAY"] }),
    /rules are frozen/,
  );
  assert.throws(
    () =>
      runCoreDipBacktest(
        withWarmup([
          bar("2026-01-05", 100),
          bar("2026-01-06", 100),
          bar("2026-01-07", 100),
          bar("2026-01-08", 100),
          bar("2026-01-09", 100),
          bar("2026-01-12", 100),
        ]),
        { ...config(), drawdownLookbackTradingDays: 19 } as CoreDipConfig,
      ),
    /rules are frozen/,
  );
});

test("only Tuesday and Friday closes signal, with Friday orders filled at Monday open", () => {
  const bars = [
    bar("2026-01-05", 100),
    bar("2026-01-06", 100),
    bar("2026-01-07", 100),
    bar("2026-01-08", 90),
    bar("2026-01-09", 98),
    bar("2026-01-12", 96, 95),
  ];

  const result = run(bars);
  assert.equal(result.evaluations[0]?.signalDate, "2026-01-09");
  assert.equal(result.evaluations[0]?.executionDate, "2026-01-12");
  assert.deepEqual(result.evaluations[0]?.newlyTriggeredTiersPct, [2]);
  assert.equal(result.trades[0]?.reason, "CORE_ENTRY");
  assert.equal(result.trades[0]?.referenceNotionalUsd, 60);
  assert.equal(result.trades[0]?.referencePrice, 95);
  assert.equal(result.trades[1]?.reason, "DIP_TRANCHES");
  assert.equal(result.trades[1]?.referenceNotionalUsd, 10);
  assert.equal(result.trades[1]?.referencePrice, 95);
  assert.equal(result.endingCashUsd, 30);
});

test("an exact multi-tier drawdown aggregates tranches without exceeding the reserve", () => {
  const bars = [
    bar("2026-01-05", 100),
    bar("2026-01-06", 100),
    bar("2026-01-07", 100),
    bar("2026-01-08", 100),
    bar("2026-01-09", 88),
    bar("2026-01-12", 88),
    bar("2026-01-13", 70),
    bar("2026-01-14", 70),
  ];

  const result = run(bars);
  const dipTrades = result.trades.filter((trade) => trade.reason === "DIP_TRANCHES");
  assert.equal(result.evaluations[0]?.drawdownPct, 12);
  assert.deepEqual(dipTrades[0]?.triggeredTiersPct, [2, 5, 8, 12]);
  assert.equal(dipTrades[0]?.referenceNotionalUsd, 40);
  assert.equal(result.endingCashUsd, 0);
  assert.equal(dipTrades.length, 1);

  const justBelow = run(
    [
      bar("2026-01-05", 100),
      bar("2026-01-06", 100),
      bar("2026-01-07", 100),
      bar("2026-01-08", 100),
      bar("2026-01-09", 88.000001),
      bar("2026-01-12", 88),
    ],
  );
  assert.deepEqual(justBelow.trades[1]?.triggeredTiersPct, [2, 5, 8]);
  assert.equal(justBelow.endingCashUsd, 10);
});

test("each tier is available once, so repeated shallow dips cannot consume deeper-tier envelopes", () => {
  const bars = [
    bar("2026-01-05", 100),
    bar("2026-01-06", 100),
    bar("2026-01-07", 100),
    bar("2026-01-08", 100),
    bar("2026-01-09", 98),
    bar("2026-01-12", 100),
    bar("2026-01-13", 98),
    bar("2026-01-14", 100),
    bar("2026-01-15", 100),
    bar("2026-01-16", 95),
    bar("2026-01-19", 95),
  ];

  const result = run(bars);
  const dipTrades = result.trades.filter((trade) => trade.reason === "DIP_TRANCHES");
  assert.deepEqual(
    dipTrades.map((trade) => trade.triggeredTiersPct),
    [[2], [5]],
  );
  assert.equal(result.endingCashUsd, 20);
});

test("slippage and one fee apply to each actual order while buy-and-hold enters once", () => {
  const bars = [
    bar("2026-01-05", 100),
    bar("2026-01-06", 100),
    bar("2026-01-07", 100),
    bar("2026-01-08", 100),
    bar("2026-01-09", 98),
    bar("2026-01-12", 95, 95),
  ];
  const result = run(
    bars,
    config({ slippageBpsPerSide: 100, fixedFeeUsdPerOrder: 1 }),
  );

  assert.ok(Math.abs((result.trades[0]?.netNotionalUsd ?? 0) - 59 / 1.01) < 1e-9);
  assert.ok(Math.abs((result.trades[1]?.netNotionalUsd ?? 0) - 9 / 1.01) < 1e-9);
  assert.equal(result.strategy.tradeCount, 2);
  assert.equal(result.buyAndHold.tradeCount, 1);
  assert.equal(result.buyAndHoldTrades[0]?.referenceNotionalUsd, 100);
  assert.equal(result.buyAndHoldTrades[0]?.referencePrice, 95);
  assert.ok(
    Math.abs((result.buyAndHoldTrades[0]?.netNotionalUsd ?? 0) - 99 / 1.01) < 1e-9,
  );
  assert.equal(result.strategy.startingCashUsd, result.buyAndHold.startingCashUsd);
  assert.equal(result.strategy.startDate, result.buyAndHold.startDate);
  assert.equal(result.strategy.endDate, result.buyAndHold.endDate);
});

test("benchmark comparison can select either candidate from the price evidence", () => {
  const commonPrefix = [
    bar("2026-01-05", 100),
    bar("2026-01-06", 100),
    bar("2026-01-07", 100),
    bar("2026-01-08", 100),
    bar("2026-01-09", 100),
    bar("2026-01-12", 100),
  ];
  const crashAndRecover = [
    ...commonPrefix,
    bar("2026-01-13", 80),
    bar("2026-01-14", 80),
    bar("2026-01-15", 100),
  ];
  const uninterruptedRise = [
    ...commonPrefix,
    bar("2026-01-13", 110),
    bar("2026-01-14", 110),
    bar("2026-01-15", 120),
  ];

  const dipWins = run(crashAndRecover);
  const benchmarkWins = run(uninterruptedRise);
  const flat = run(commonPrefix);

  assert.equal(dipWins.comparison.beatBenchmarkOnTotalReturn, true);
  assert.ok(dipWins.comparison.excessTotalReturnPct > 0);
  assert.equal(benchmarkWins.comparison.beatBenchmarkOnTotalReturn, false);
  assert.ok(benchmarkWins.comparison.excessTotalReturnPct < 0);
  assert.equal(dipWins.comparison.benchmark, "SPY_BUY_AND_HOLD_TOTAL_RETURN");
  assert.equal(flat.strategy.finalEquityUsd, 100);
  assert.equal(flat.buyAndHold.finalEquityUsd, 100);
});

test("a later dip entry accounts for the old position's overnight gap before buying", () => {
  const bars = [
    bar("2026-01-05", 100),
    bar("2026-01-06", 100),
    bar("2026-01-07", 100),
    bar("2026-01-08", 100),
    bar("2026-01-09", 100),
    bar("2026-01-12", 100),
    bar("2026-01-13", 95),
    bar("2026-01-14", 100, 90),
  ];

  const result = run(bars);
  const expectedOldPositionAtOpen = 60 * (90 / 100);
  const expectedCloseEquity =
    20 + (expectedOldPositionAtOpen + 20) * (100 / 90);
  assert.deepEqual(result.trades[1]?.triggeredTiersPct, [2, 5]);
  assert.ok(Math.abs(result.strategy.finalEquityUsd - expectedCloseEquity) < 1e-9);
});
