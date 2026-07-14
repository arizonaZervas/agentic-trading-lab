import {
  assertPriceBars,
  parseStrategyConfig,
  type PriceBar,
  type StrategyConfig,
  type TargetAllocation,
} from "./model.ts";
import {
  calculateMetrics,
  compareWithBuyAndHold,
  type BacktestMetrics,
  type BenchmarkComparison,
  type EquityPoint,
} from "./performance.ts";
import { buildExecutionDecisions } from "./strategy.ts";

export type { BacktestMetrics, BenchmarkComparison } from "./performance.ts";

export interface SimulatedTrade {
  readonly signalDate: string;
  readonly executionDate: string;
  readonly side: "BUY" | "SELL";
  readonly referenceNotionalUsd: number;
  readonly netNotionalUsd: number;
  readonly referencePrice: number;
  readonly effectivePrice: number;
}

export interface BacktestResult {
  readonly candidate: "SPY_TREND_10_MONTH_V1";
  readonly configuration: StrategyConfig;
  readonly strategy: BacktestMetrics;
  readonly buyAndHold: BacktestMetrics;
  readonly comparison: BenchmarkComparison;
  readonly trades: readonly SimulatedTrade[];
  readonly assumptions: readonly string[];
}

export function runBacktest(
  bars: readonly PriceBar[],
  config: StrategyConfig,
): BacktestResult {
  config = parseStrategyConfig(config);
  assertPriceBars(bars, config.symbol);
  const decisions = buildExecutionDecisions(bars, config.movingAverageMonths);
  const firstDecision = decisions[0];
  if (firstDecision === undefined) {
    throw new Error("Price history does not contain a complete signal plus a following execution day");
  }

  const decisionByIndex = new Map(
    decisions.map((decision) => [decision.executionIndex, decision] as const),
  );
  const slippageRate = config.slippageBpsPerSide / 10_000;
  let cash: number = config.startingCashUsd;
  let positionValue: number = 0;
  let target: TargetAllocation = 0;
  const points: EquityPoint[] = [
    {
      date: firstDecision.signalDate,
      equity: config.startingCashUsd,
      invested: false,
    },
  ];
  const trades: SimulatedTrade[] = [];

  for (let index = firstDecision.executionIndex; index < bars.length; index += 1) {
    const bar = bars[index];
    if (bar === undefined) {
      continue;
    }

    const previousBar = bars[index - 1];
    if (positionValue > 0 && previousBar !== undefined) {
      positionValue *= bar.adjustedClose / previousBar.adjustedClose;
    }

    const decision = decisionByIndex.get(index);
    if (decision !== undefined && decision.targetAllocation !== target) {
      if (decision.targetAllocation === 1 && positionValue === 0) {
        if (cash <= config.fixedFeeUsdPerOrder) {
          throw new Error(
            `Insufficient cash (${cash}) to cover the configured order fee (${config.fixedFeeUsdPerOrder})`,
          );
        }
        const referenceNotionalUsd = cash;
        const effectivePrice = bar.close * (1 + slippageRate);
        positionValue = (cash - config.fixedFeeUsdPerOrder) / (1 + slippageRate);
        cash = 0;
        trades.push({
          signalDate: decision.signalDate,
          executionDate: bar.date,
          side: "BUY",
          referenceNotionalUsd,
          netNotionalUsd: positionValue,
          referencePrice: bar.close,
          effectivePrice,
        });
      } else if (decision.targetAllocation === 0 && positionValue > 0) {
        const referenceNotionalUsd = positionValue;
        const effectivePrice = bar.close * (1 - slippageRate);
        cash = Math.max(
          0,
          positionValue * (1 - slippageRate) - config.fixedFeeUsdPerOrder,
        );
        trades.push({
          signalDate: decision.signalDate,
          executionDate: bar.date,
          side: "SELL",
          referenceNotionalUsd,
          netNotionalUsd: cash,
          referencePrice: bar.close,
          effectivePrice,
        });
        positionValue = 0;
      }
      target = decision.targetAllocation;
    }

    points.push({
      date: bar.date,
      equity: cash + positionValue,
      invested: positionValue > 0,
    });
  }

  const evaluationBars = bars.slice(firstDecision.executionIndex);
  const benchmarkStart = evaluationBars[0];
  if (benchmarkStart === undefined) {
    throw new Error("Benchmark start bar is missing");
  }
  let benchmarkValue =
    (config.startingCashUsd - config.fixedFeeUsdPerOrder) / (1 + slippageRate);
  const benchmarkPoints = [
    {
      date: firstDecision.signalDate,
      equity: config.startingCashUsd,
      invested: false,
    },
    ...evaluationBars.map((bar, index) => {
      const previous = evaluationBars[index - 1];
      if (previous !== undefined) {
        benchmarkValue *= bar.adjustedClose / previous.adjustedClose;
      }
      return { date: bar.date, equity: benchmarkValue, invested: true };
    }),
  ];

  const strategyMetrics = calculateMetrics(points, config.startingCashUsd, trades.length);
  const benchmarkMetrics = calculateMetrics(benchmarkPoints, config.startingCashUsd, 1);

  return {
    candidate: "SPY_TREND_10_MONTH_V1",
    configuration: config,
    strategy: strategyMetrics,
    buyAndHold: benchmarkMetrics,
    comparison: compareWithBuyAndHold(strategyMetrics, benchmarkMetrics, config.symbol),
    trades,
    assumptions: [
      "Signals use month-end adjusted closes and a fixed simple moving average.",
      "A signal uses the following trading day's raw close as its execution reference, never the signal close.",
      "Portfolio total-return changes use adjusted closes after entry.",
      "Each buy or sell pays configured proportional slippage and a fixed per-order fee.",
      "Share quantities are not modeled because corporate-action handling is not implemented.",
      "Cash earns no interest; taxes, market impact, regulatory fee formulas, and partial fills are not modeled.",
      "Annualized return is suppressed for evaluation periods shorter than 365 days.",
      "Success is measured relative to the same-period buy-and-hold total-return benchmark, not a fixed annual-return assumption.",
      "Results are research evidence, not a forecast or promise of profit.",
    ],
  };
}
