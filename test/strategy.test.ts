import assert from "node:assert/strict";
import test from "node:test";

import { parseAdjustedCloseCsv } from "../src/adapters/csv.ts";
import { runBacktest } from "../src/domain/backtest.ts";
import { parseStrategyConfig, type PriceBar } from "../src/domain/model.ts";
import { createSignalProposal } from "../src/domain/proposal.ts";
import { buildExecutionDecisions } from "../src/domain/strategy.ts";

type UnlabeledPriceBar = Omit<PriceBar, "symbol">;

function spyBars(bars: readonly UnlabeledPriceBar[]): PriceBar[] {
  return bars.map((bar) => ({ symbol: "SPY", ...bar }));
}

const TREND_WARMUP = spyBars([
  { date: "2025-06-30", close: 90, adjustedClose: 90, isMonthEnd: true, isFirstSessionOfMonth: false },
  { date: "2025-07-31", close: 90, adjustedClose: 90, isMonthEnd: true, isFirstSessionOfMonth: false },
  { date: "2025-08-29", close: 90, adjustedClose: 90, isMonthEnd: true, isFirstSessionOfMonth: false },
  { date: "2025-09-30", close: 90, adjustedClose: 90, isMonthEnd: true, isFirstSessionOfMonth: false },
  { date: "2025-10-31", close: 90, adjustedClose: 90, isMonthEnd: true, isFirstSessionOfMonth: false },
  { date: "2025-11-28", close: 90, adjustedClose: 90, isMonthEnd: true, isFirstSessionOfMonth: false },
  { date: "2025-12-31", close: 90, adjustedClose: 90, isMonthEnd: true, isFirstSessionOfMonth: false },
]);

function withTrendWarmup(bars: readonly UnlabeledPriceBar[]): PriceBar[] {
  return [...TREND_WARMUP, ...spyBars(bars)];
}

const config = parseStrategyConfig({
  symbol: "SPY",
  movingAverageMonths: 10,
  startingCashUsd: 100,
  slippageBpsPerSide: 10,
  fixedFeeUsdPerOrder: 0,
  paperOnly: true,
});

test("CSV adapter accepts common adjusted-close headers and rejects unordered data", () => {
  assert.deepEqual(
    parseAdjustedCloseCsv(
      "Symbol,Date,Close,Adj Close,is_month_end,is_first_session_of_month\nSPY,2026-01-02,100,99,false,true\nSPY,2026-01-05,101,100,true,false\n",
    ),
    [
      {
        symbol: "SPY",
        date: "2026-01-02",
        close: 100,
        adjustedClose: 99,
        isMonthEnd: false,
        isFirstSessionOfMonth: true,
      },
      {
        symbol: "SPY",
        date: "2026-01-05",
        close: 101,
        adjustedClose: 100,
        isMonthEnd: true,
        isFirstSessionOfMonth: false,
      },
    ],
  );

  assert.throws(
    () =>
      parseAdjustedCloseCsv(
        "symbol,date,close,adjusted_close,is_month_end,is_first_session_of_month\nSPY,2026-01-05,101,101,true,false\nSPY,2026-01-02,100,100,false,true\n",
      ),
    /strictly increasing/,
  );
});

test("CSV input must identify every row by symbol", () => {
  assert.throws(
    () =>
      parseAdjustedCloseCsv(
        "date,close,adjusted_close,is_month_end,is_first_session_of_month\n2026-01-30,100,100,true,false\n",
      ),
    /must contain symbol/,
  );
  assert.throws(
    () =>
      parseAdjustedCloseCsv(
        "symbol,date,close,adjusted_close,is_month_end,is_first_session_of_month\nspy,2026-01-30,100,100,true,false\n",
      ),
    /invalid uppercase symbol/,
  );
});

test("signal uses the latest completed month and exposes no order path", () => {
  const bars = withTrendWarmup([
    { date: "2026-01-30", close: 90, adjustedClose: 90, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-02-27", close: 100, adjustedClose: 100, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-03-31", close: 120, adjustedClose: 120, isMonthEnd: true, isFirstSessionOfMonth: false },
  ]);

  const proposal = createSignalProposal(bars, config, "2026-03-31");
  assert.equal(proposal.movingAverage, 94);
  assert.equal(proposal.targetAllocationPct, 100);
  assert.equal(proposal.safety.placesBrokerOrders, false);
  assert.equal(proposal.safety.humanApprovalRequired, true);
  assert.throws(
    () => createSignalProposal(bars, config, "2026-03-30"),
    /does not match confirmed month-end/,
  );
});

test("trend candidate rejects data labeled as another security", () => {
  const bars = withTrendWarmup([
    { date: "2026-01-30", close: 90, adjustedClose: 90, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-02-27", close: 100, adjustedClose: 100, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-03-31", close: 120, adjustedClose: 120, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-04-01", close: 121, adjustedClose: 121, isMonthEnd: false, isFirstSessionOfMonth: true },
  ]).map((bar) => ({ ...bar, symbol: "QQQ" }));

  assert.throws(() => runBacktest(bars, config), /explicitly labeled SPY/);
  assert.throws(
    () => createSignalProposal(bars.slice(0, -1), config, "2026-03-31"),
    /explicitly labeled SPY/,
  );
});

test("domain entry points reject malformed non-CSV price rows", () => {
  const bars = withTrendWarmup([
    { date: "2026-01-30", close: 90, adjustedClose: Number.NaN, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-02-27", close: 100, adjustedClose: 100, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-03-31", close: 120, adjustedClose: 120, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-04-01", close: 121, adjustedClose: 121, isMonthEnd: false, isFirstSessionOfMonth: true },
  ]);

  assert.throws(() => runBacktest(bars, config), /invalid adjusted close/);
});

test("backtest executes a month-end signal on the following trading day", () => {
  const recentBars: UnlabeledPriceBar[] = [
    { date: "2026-01-30", close: 90, adjustedClose: 90, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-02-27", close: 100, adjustedClose: 100, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-03-30", close: 110, adjustedClose: 110, isMonthEnd: false, isFirstSessionOfMonth: false },
    { date: "2026-03-31", close: 120, adjustedClose: 120, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-04-01", close: 121, adjustedClose: 121, isMonthEnd: false, isFirstSessionOfMonth: true },
    { date: "2026-04-30", close: 130, adjustedClose: 130, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-05-01", close: 131, adjustedClose: 131, isMonthEnd: false, isFirstSessionOfMonth: true },
  ];
  const bars = withTrendWarmup(recentBars);

  const decisions = buildExecutionDecisions(spyBars(recentBars), 3);
  assert.equal(decisions[0]?.signalDate, "2026-03-31");
  assert.equal(decisions[0]?.executionDate, "2026-04-01");

  const result = runBacktest(bars, config);
  assert.equal(result.candidate, "SPY_TREND_10_MONTH_V1");
  assert.deepEqual(result.configuration, config);
  assert.equal(result.trades[0]?.executionDate, "2026-04-01");
  assert.equal(result.trades[0]?.side, "BUY");
  assert.ok(result.strategy.finalEquityUsd > 100);
});

test("configured slippage reduces equity immediately after a buy", () => {
  const bars = withTrendWarmup([
    { date: "2026-01-30", close: 90, adjustedClose: 90, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-02-27", close: 100, adjustedClose: 100, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-03-31", close: 120, adjustedClose: 120, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-04-01", close: 120, adjustedClose: 120, isMonthEnd: false, isFirstSessionOfMonth: true },
  ]);

  const result = runBacktest(bars, config);
  assert.ok(result.strategy.finalEquityUsd < 100);
  assert.ok(result.strategy.maxDrawdownPct < 0);
  assert.equal(result.strategy.annualizedReturnPct, null);
  assert.equal(result.strategy.tradeCount, 1);
});

test("raw closes anchor trade references and fixed fees apply on both sides", () => {
  const feeConfig = parseStrategyConfig({
    symbol: "SPY",
    movingAverageMonths: 10,
    startingCashUsd: 100,
    slippageBpsPerSide: 0,
    fixedFeeUsdPerOrder: 1,
    paperOnly: true,
  });
  const bars = withTrendWarmup([
    { date: "2026-01-30", close: 100, adjustedClose: 100, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-02-27", close: 110, adjustedClose: 110, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-03-31", close: 120, adjustedClose: 120, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-04-01", close: 240, adjustedClose: 120, isMonthEnd: false, isFirstSessionOfMonth: true },
    { date: "2026-04-30", close: 50, adjustedClose: 50, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-05-01", close: 55, adjustedClose: 50, isMonthEnd: false, isFirstSessionOfMonth: true },
  ]);

  const result = runBacktest(bars, feeConfig);
  const buy = result.trades[0];
  const sell = result.trades[1];
  assert.equal(buy?.side, "BUY");
  assert.equal(buy?.referencePrice, 240);
  assert.equal(buy?.referenceNotionalUsd, 100);
  assert.equal(buy?.netNotionalUsd, 99);
  assert.equal(sell?.side, "SELL");
  assert.equal(sell?.referencePrice, 55);
  assert.ok(Math.abs((sell?.referenceNotionalUsd ?? 0) - 41.25) < 1e-9);
  assert.ok(Math.abs((sell?.netNotionalUsd ?? 0) - 40.25) < 1e-9);
  assert.equal(result.comparison.benchmark, "SPY_BUY_AND_HOLD_TOTAL_RETURN");
  assert.equal(
    result.comparison.excessTotalReturnPct,
    result.strategy.totalReturnPct - result.buyAndHold.totalReturnPct,
  );
  assert.equal(
    result.comparison.maxDrawdownAdvantagePct,
    result.strategy.maxDrawdownPct - result.buyAndHold.maxDrawdownPct,
  );
  assert.equal(result.comparison.beatBenchmarkOnTotalReturn, false);
  assert.equal(result.comparison.excessAnnualizedReturnPct, null);
  assert.equal(result.comparison.beatBenchmarkOnAnnualizedReturn, null);
});

test("benchmark comparison identifies after-cost total-return outperformance", () => {
  const bars = withTrendWarmup([
    { date: "2026-01-30", close: 100, adjustedClose: 100, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-02-27", close: 110, adjustedClose: 110, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-03-31", close: 120, adjustedClose: 120, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-04-01", close: 120, adjustedClose: 120, isMonthEnd: false, isFirstSessionOfMonth: true },
    { date: "2026-04-30", close: 50, adjustedClose: 50, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-05-01", close: 50, adjustedClose: 50, isMonthEnd: false, isFirstSessionOfMonth: true },
    { date: "2026-05-29", close: 10, adjustedClose: 10, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-06-01", close: 10, adjustedClose: 10, isMonthEnd: false, isFirstSessionOfMonth: true },
  ]);

  const result = runBacktest(bars, config);
  assert.ok(result.comparison.excessTotalReturnPct > 0);
  assert.equal(result.comparison.beatBenchmarkOnTotalReturn, true);
  assert.ok(result.comparison.maxDrawdownAdvantagePct > 0);
});

test("missing calendar months are rejected instead of compressed", () => {
  const bars = spyBars([
    { date: "2026-01-30", close: 90, adjustedClose: 90, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-03-31", close: 120, adjustedClose: 120, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-04-30", close: 130, adjustedClose: 130, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-05-01", close: 131, adjustedClose: 131, isMonthEnd: false, isFirstSessionOfMonth: true },
  ]);
  assert.throws(() => buildExecutionDecisions(bars, 3), /missing or nonconsecutive month/);
});

test("a month-end marker followed by another same-month row is rejected", () => {
  const bars = spyBars([
    { date: "2026-01-15", close: 90, adjustedClose: 90, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-01-30", close: 95, adjustedClose: 95, isMonthEnd: false, isFirstSessionOfMonth: false },
    { date: "2026-02-27", close: 100, adjustedClose: 100, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-03-31", close: 120, adjustedClose: 120, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-04-01", close: 125, adjustedClose: 125, isMonthEnd: false, isFirstSessionOfMonth: true },
  ]);
  assert.throws(() => buildExecutionDecisions(bars, 3), /marked as month end/);
});

test("an unlabeled completed month transition is rejected", () => {
  const bars = spyBars([
    { date: "2026-01-30", close: 90, adjustedClose: 90, isMonthEnd: false, isFirstSessionOfMonth: false },
    { date: "2026-02-02", close: 91, adjustedClose: 91, isMonthEnd: false, isFirstSessionOfMonth: true },
  ]);

  assert.throws(() => buildExecutionDecisions(bars, 3), /not marked as month end/);
});

test("monthly-only rows cannot masquerade as next-session execution data", () => {
  const bars = spyBars([
    { date: "2026-01-30", close: 90, adjustedClose: 90, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-02-27", close: 100, adjustedClose: 100, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-03-31", close: 120, adjustedClose: 120, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-04-30", close: 130, adjustedClose: 130, isMonthEnd: true, isFirstSessionOfMonth: false },
  ]);
  assert.throws(() => buildExecutionDecisions(bars, 3), /not marked as the first trading session/);
});

test("a re-entry fails closed when remaining cash cannot cover its fee", () => {
  const highFeeConfig = parseStrategyConfig({
    symbol: "SPY",
    movingAverageMonths: 10,
    startingCashUsd: 100,
    slippageBpsPerSide: 0,
    fixedFeeUsdPerOrder: 10,
    paperOnly: true,
  });
  const bars = withTrendWarmup([
    { date: "2026-01-30", close: 100, adjustedClose: 100, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-02-27", close: 110, adjustedClose: 110, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-03-31", close: 120, adjustedClose: 120, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-04-01", close: 120, adjustedClose: 120, isMonthEnd: false, isFirstSessionOfMonth: true },
    { date: "2026-04-30", close: 5, adjustedClose: 5, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-05-01", close: 5, adjustedClose: 5, isMonthEnd: false, isFirstSessionOfMonth: true },
    { date: "2026-05-29", close: 200, adjustedClose: 200, isMonthEnd: true, isFirstSessionOfMonth: false },
    { date: "2026-06-01", close: 200, adjustedClose: 200, isMonthEnd: false, isFirstSessionOfMonth: true },
  ]);
  assert.throws(() => runBacktest(bars, highFeeConfig), /Insufficient cash/);
});

test("configuration cannot enable live orders or exceed the research cap", () => {
  assert.throws(
    () =>
      parseStrategyConfig({
        symbol: "SPY",
        movingAverageMonths: 10,
        startingCashUsd: 101,
        slippageBpsPerSide: 10,
        fixedFeeUsdPerOrder: 0,
        paperOnly: true,
      }),
    /research cap/,
  );
  assert.throws(
    () =>
      parseStrategyConfig({
        symbol: "SPY",
        movingAverageMonths: 10,
        startingCashUsd: 100,
        slippageBpsPerSide: 10,
        fixedFeeUsdPerOrder: 0,
        paperOnly: false,
      }),
    /no live-order mode/,
  );
  assert.throws(
    () =>
      parseStrategyConfig({
        symbol: "QQQ",
        movingAverageMonths: 10,
        startingCashUsd: 100,
        slippageBpsPerSide: 10,
        fixedFeeUsdPerOrder: 0,
        paperOnly: true,
      }),
    /restricted to SPY/,
  );
  assert.throws(
    () =>
      parseStrategyConfig({
        symbol: "SPY",
        movingAverageMonths: 9,
        startingCashUsd: 100,
        slippageBpsPerSide: 10,
        fixedFeeUsdPerOrder: 0,
        paperOnly: true,
      }),
    /frozen at a 10-month moving average/,
  );

  const mutatedConfig = {
    ...config,
    movingAverageMonths: 9,
  } as unknown as typeof config;
  assert.throws(
    () => runBacktest(withTrendWarmup([]), mutatedConfig),
    /frozen at a 10-month moving average/,
  );
});
