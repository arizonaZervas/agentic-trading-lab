export interface BacktestMetrics {
  readonly startDate: string;
  readonly endDate: string;
  readonly startingCashUsd: number;
  readonly finalEquityUsd: number;
  readonly totalReturnPct: number;
  readonly annualizedReturnPct: number | null;
  readonly maxDrawdownPct: number;
  readonly investedObservationPct: number;
  readonly tradeCount: number;
}

export interface BenchmarkComparison {
  readonly benchmark: string;
  readonly excessTotalReturnPct: number;
  readonly excessAnnualizedReturnPct: number | null;
  readonly maxDrawdownAdvantagePct: number;
  readonly beatBenchmarkOnTotalReturn: boolean;
  readonly beatBenchmarkOnAnnualizedReturn: boolean | null;
}

export interface EquityPoint {
  readonly date: string;
  readonly equity: number;
  readonly invested: boolean;
}

function percentage(value: number): number {
  return value * 100;
}

function maxDrawdown(points: readonly EquityPoint[]): number {
  let peak = 0;
  let worst = 0;
  for (const point of points) {
    peak = Math.max(peak, point.equity);
    if (peak > 0) {
      worst = Math.min(worst, point.equity / peak - 1);
    }
  }
  return percentage(worst);
}

export function calculateMetrics(
  points: readonly EquityPoint[],
  startingCashUsd: number,
  tradeCount: number,
): BacktestMetrics {
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined) {
    throw new Error("Cannot compute metrics for an empty equity curve");
  }

  const elapsedDays = Math.max(
    1,
    (Date.parse(`${last.date}T00:00:00Z`) - Date.parse(`${first.date}T00:00:00Z`)) /
      86_400_000,
  );
  const totalReturn = last.equity / startingCashUsd - 1;
  const annualizedReturn =
    elapsedDays >= 365
      ? Math.pow(last.equity / startingCashUsd, 365.25 / elapsedDays) - 1
      : null;
  const investedObservations = points.filter((point) => point.invested).length;

  return {
    startDate: first.date,
    endDate: last.date,
    startingCashUsd,
    finalEquityUsd: last.equity,
    totalReturnPct: percentage(totalReturn),
    annualizedReturnPct: annualizedReturn === null ? null : percentage(annualizedReturn),
    maxDrawdownPct: maxDrawdown(points),
    investedObservationPct: percentage(investedObservations / points.length),
    tradeCount,
  };
}

export function compareWithBuyAndHold(
  strategy: BacktestMetrics,
  buyAndHold: BacktestMetrics,
  symbol: string,
): BenchmarkComparison {
  const excessAnnualizedReturnPct =
    strategy.annualizedReturnPct === null || buyAndHold.annualizedReturnPct === null
      ? null
      : strategy.annualizedReturnPct - buyAndHold.annualizedReturnPct;

  return {
    benchmark: `${symbol}_BUY_AND_HOLD_TOTAL_RETURN`,
    excessTotalReturnPct: strategy.totalReturnPct - buyAndHold.totalReturnPct,
    excessAnnualizedReturnPct,
    maxDrawdownAdvantagePct:
      strategy.maxDrawdownPct - buyAndHold.maxDrawdownPct,
    beatBenchmarkOnTotalReturn:
      strategy.totalReturnPct > buyAndHold.totalReturnPct,
    beatBenchmarkOnAnnualizedReturn:
      excessAnnualizedReturnPct === null ? null : excessAnnualizedReturnPct > 0,
  };
}
