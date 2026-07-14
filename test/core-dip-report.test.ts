import assert from "node:assert/strict";
import test from "node:test";

import { createCoreDipShadowReport } from "../src/domain/core-dip-report.ts";
import {
  parseCoreDipConfig,
  runCoreDipBacktest,
  type CoreDipConfig,
  type CoreDipEvaluation,
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

function withoutExecutionPrices(bars: readonly PriceBar[]): PriceBar[] {
  return bars.map((priceBar) => ({
    symbol: priceBar.symbol,
    date: priceBar.date,
    close: priceBar.close,
    adjustedClose: priceBar.adjustedClose,
    isMonthEnd: priceBar.isMonthEnd,
    isFirstSessionOfMonth: priceBar.isFirstSessionOfMonth,
  }));
}

function config(): CoreDipConfig {
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
  });
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

const FULL_SERIES = [
  ...WARMUP_DATES.map((date) => bar(date, 100)),
  bar("2026-01-05", 100),
  bar("2026-01-06", 100),
  bar("2026-01-07", 100),
  bar("2026-01-08", 100),
  bar("2026-01-09", 98),
  bar("2026-01-12", 98, 97),
  bar("2026-01-13", 95),
  bar("2026-01-14", 95, 94),
  bar("2026-01-15", 96),
  bar("2026-01-16", 96),
] as const;

function through(date: string): PriceBar[] {
  const index = FULL_SERIES.findIndex((priceBar) => priceBar.date === date);
  assert.notEqual(index, -1);
  return withoutExecutionPrices(FULL_SERIES.slice(0, index + 1));
}

function assertMatchesBacktestEvaluation(
  asOfDate: string,
  evaluation: CoreDipEvaluation,
): void {
  const report = createCoreDipShadowReport(
    through(asOfDate),
    config(),
    asOfDate,
    "2026-01-09",
  );

  assert.equal(report.observation.rollingHighAdjustedClose, evaluation.rollingHighAdjustedClose);
  assert.equal(report.observation.adjustedClose, evaluation.adjustedClose);
  assert.equal(report.observation.drawdownPct, evaluation.drawdownPct);
  assert.equal(report.observation.coreProposedThisRun, evaluation.coreScheduled);
  assert.deepEqual(
    report.observation.newlyTriggeredTiersPct,
    evaluation.newlyTriggeredTiersPct,
  );
  assert.equal(
    report.shadowOrders.reduce((total, order) => total + order.notionalUsd, 0),
    evaluation.scheduledNotionalUsd,
  );
  assert.equal(
    report.observation.remainingReserveUsdAfter,
    evaluation.remainingReserveUsd,
  );
}

test("a truncated eligible as-of series matches backtest evaluations with a future bar", () => {
  const backtest = runCoreDipBacktest(FULL_SERIES, config());
  const first = backtest.evaluations.find(
    (evaluation) => evaluation.signalDate === "2026-01-09",
  );
  const second = backtest.evaluations.find(
    (evaluation) => evaluation.signalDate === "2026-01-13",
  );
  assert.ok(first);
  assert.ok(second);

  assertMatchesBacktestEvaluation("2026-01-09", first);
  assertMatchesBacktestEvaluation("2026-01-13", second);

  const firstReport = createCoreDipShadowReport(
    through("2026-01-09"),
    config(),
    "2026-01-09",
    "2026-01-09",
  );
  assert.equal(firstReport.status, "PROPOSAL");
  assert.deepEqual(
    firstReport.shadowOrders.map((order) => [
      order.reason,
      order.notionalUsd,
      order.triggeredTiersPct,
    ]),
    [
      ["CORE_ENTRY", 60, []],
      ["DIP_TRANCHES", 10, [2]],
    ],
  );
  assert.equal(firstReport.shadowOrders[0]?.shadowOnly, true);
  assert.match(firstReport.dataFingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    firstReport,
    createCoreDipShadowReport(
      through("2026-01-09"),
      config(),
      "2026-01-09",
      "2026-01-09",
    ),
  );
});

test("replay uses the pinned start, records used tiers, and emits deterministic no-trade reports", () => {
  const tierReport = createCoreDipShadowReport(
    through("2026-01-13"),
    config(),
    "2026-01-13",
    "2026-01-09",
  );
  assert.equal(tierReport.status, "PROPOSAL");
  assert.equal(tierReport.replayedEvaluationCount, 2);
  assert.deepEqual(tierReport.observation.previouslyUsedTiersPct, [2]);
  assert.deepEqual(tierReport.observation.newlyTriggeredTiersPct, [5]);
  assert.deepEqual(tierReport.usedTiersPct, [2, 5]);
  assert.deepEqual(
    tierReport.shadowOrders.map((order) => order.reason),
    ["DIP_TRANCHES"],
  );
  assert.equal(tierReport.shadowOrders[0]?.notionalUsd, 10);

  const noTrade = createCoreDipShadowReport(
    through("2026-01-16"),
    config(),
    "2026-01-16",
    "2026-01-09",
  );
  assert.equal(noTrade.status, "NO_TRADE");
  assert.equal(noTrade.noTradeReason, "NO_NEW_CORE_OR_DIP_TIER");
  assert.deepEqual(noTrade.shadowOrders, []);
  assert.deepEqual(noTrade.usedTiersPct, [2, 5]);
  assert.equal(noTrade.safety.mode, "SHADOW_ONLY");
  assert.equal(noTrade.safety.paperOnly, true);
  assert.equal(noTrade.safety.brokerOrdersCreated, false);
  assert.equal(noTrade.safety.liveOrderIntent, false);
  assert.match(noTrade.safety.statement, /no broker order.*no live-order intent/i);

  const lateStart = createCoreDipShadowReport(
    through("2026-01-13"),
    config(),
    "2026-01-13",
    "2026-01-13",
  );
  assert.equal(lateStart.replayedEvaluationCount, 1);
  assert.equal(lateStart.observation.coreProposedThisRun, true);
  assert.deepEqual(lateStart.observation.previouslyUsedTiersPct, []);
  assert.deepEqual(lateStart.observation.newlyTriggeredTiersPct, [2, 5]);
  assert.deepEqual(
    lateStart.shadowOrders.map((order) => order.notionalUsd),
    [60, 20],
  );
});

test("a latest non-evaluation close reports why no shadow trade is proposed", () => {
  const report = createCoreDipShadowReport(
    through("2026-01-15"),
    config(),
    "2026-01-15",
    "2026-01-09",
  );

  assert.equal(report.status, "NO_TRADE");
  assert.equal(report.noTradeReason, "AS_OF_DATE_NOT_TUESDAY_OR_FRIDAY");
  assert.equal(report.observation.evaluationWeekday, null);
  assert.equal(report.replayedEvaluationCount, 2);
  assert.deepEqual(report.shadowOrders, []);
});

test("shadow reports fail closed on stale, missing, short, or malformed inputs", () => {
  const bars = through("2026-01-14");

  assert.throws(
    () =>
      createCoreDipShadowReport(
        bars,
        config(),
        "2026-01-14",
        "2026-01-10",
      ),
    /experimentStartDate 2026-01-10 is missing/,
  );
  assert.throws(
    () =>
      createCoreDipShadowReport(
        withoutExecutionPrices(FULL_SERIES.slice(15, 23)),
        config(),
        "2026-01-14",
        "2026-01-09",
      ),
    /must include 19 sessions before experimentStartDate/,
  );
  assert.throws(
    () =>
      createCoreDipShadowReport(
        bars,
        config(),
        "2026-01-13",
        "2026-01-09",
      ),
    /must be the latest price row/,
  );
  assert.throws(
    () =>
      createCoreDipShadowReport(
        bars,
        config(),
        "2026-01-10",
        "2026-01-09",
      ),
    /missing from price history/,
  );
  assert.throws(
    () =>
      createCoreDipShadowReport(
        withoutExecutionPrices(FULL_SERIES.slice(0, 19)),
        config(),
        "2026-01-08",
        "2026-01-08",
      ),
    /must include 19 sessions before experimentStartDate/,
  );
  assert.throws(
    () =>
      createCoreDipShadowReport(
        bars,
        { ...config(), paperOnly: false } as unknown as CoreDipConfig,
        "2026-01-14",
        "2026-01-09",
      ),
    /no live-order mode/,
  );
  assert.throws(
    () =>
      createCoreDipShadowReport(
        bars.map((priceBar, index) =>
          index === 0 ? { ...priceBar, symbol: "QQQ" } : priceBar,
        ),
        config(),
        "2026-01-14",
        "2026-01-09",
      ),
    /explicitly labeled SPY/,
  );
});
