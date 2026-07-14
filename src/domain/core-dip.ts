import { assertPriceBars, type PriceBar } from "./model.ts";
import {
  calculateMetrics,
  compareWithBuyAndHold,
  type BacktestMetrics,
  type BenchmarkComparison,
  type EquityPoint,
} from "./performance.ts";

export type EvaluationWeekday = "TUESDAY" | "FRIDAY";

export interface CoreDipConfig {
  readonly symbol: "SPY";
  readonly startingCashUsd: number;
  readonly coreAllocationPct: number;
  readonly drawdownLookbackTradingDays: number;
  readonly drawdownTiersPct: readonly number[];
  readonly trancheUsd: number;
  readonly evaluationWeekdays: readonly EvaluationWeekday[];
  readonly slippageBpsPerSide: number;
  readonly fixedFeeUsdPerOrder: number;
  readonly paperOnly: true;
}

export interface CoreDipEvaluation {
  readonly signalDate: string;
  readonly executionDate: string;
  readonly rollingHighAdjustedClose: number;
  readonly adjustedClose: number;
  readonly drawdownPct: number;
  readonly coreScheduled: boolean;
  readonly newlyTriggeredTiersPct: readonly number[];
  readonly scheduledNotionalUsd: number;
  readonly remainingReserveUsd: number;
}

export interface CoreDipTrade {
  readonly signalDate: string;
  readonly executionDate: string;
  readonly side: "BUY";
  readonly reason: "CORE_ENTRY" | "DIP_TRANCHES";
  readonly triggeredTiersPct: readonly number[];
  readonly referenceNotionalUsd: number;
  readonly netNotionalUsd: number;
  readonly referencePrice: number;
  readonly effectivePrice: number;
}

export interface BuyAndHoldTrade {
  readonly signalDate: string;
  readonly executionDate: string;
  readonly side: "BUY";
  readonly referenceNotionalUsd: number;
  readonly netNotionalUsd: number;
  readonly referencePrice: number;
  readonly effectivePrice: number;
}

export interface CoreDipBacktestResult {
  readonly candidate: "SPY_CORE_PLUS_DIP_V1";
  readonly configuration: CoreDipConfig;
  readonly strategy: BacktestMetrics;
  readonly buyAndHold: BacktestMetrics;
  readonly comparison: BenchmarkComparison;
  readonly endingCashUsd: number;
  readonly trades: readonly CoreDipTrade[];
  readonly buyAndHoldTrades: readonly BuyAndHoldTrade[];
  readonly evaluations: readonly CoreDipEvaluation[];
  readonly assumptions: readonly string[];
}

interface ExecutionPriceBar extends PriceBar {
  readonly open: number;
  readonly adjustedOpen: number;
}

interface ScheduledOrder {
  readonly signalDate: string;
  readonly reason: CoreDipTrade["reason"];
  readonly triggeredTiersPct: readonly number[];
  readonly referenceNotionalUsd: number;
}

const WEEKDAY_NUMBER: Readonly<Record<EvaluationWeekday, number>> = {
  TUESDAY: 2,
  FRIDAY: 5,
};

const COMPARISON_EPSILON = 1e-9;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireFiniteNumber(
  source: Record<string, unknown>,
  key: string,
): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Configuration field ${key} must be a finite number`);
  }
  return value;
}

function requireNumberArray(
  source: Record<string, unknown>,
  key: string,
): readonly number[] {
  const value = source[key];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    throw new Error(`Configuration field ${key} must be a non-empty array of finite numbers`);
  }
  return value as number[];
}

function requireEvaluationWeekdays(
  source: Record<string, unknown>,
): readonly EvaluationWeekday[] {
  const value = source.evaluationWeekdays;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("evaluationWeekdays must be a non-empty array");
  }

  const weekdays: EvaluationWeekday[] = [];
  for (const entry of value) {
    if (entry !== "TUESDAY" && entry !== "FRIDAY") {
      throw new Error("evaluationWeekdays may contain only TUESDAY and FRIDAY");
    }
    if (weekdays.includes(entry)) {
      throw new Error(`evaluationWeekdays contains duplicate value ${entry}`);
    }
    weekdays.push(entry);
  }
  return weekdays;
}

export function parseCoreDipConfig(raw: unknown): CoreDipConfig {
  if (!isRecord(raw)) {
    throw new Error("Core-plus-dip configuration must be a JSON object");
  }

  if (raw.symbol !== "SPY") {
    throw new Error("The core-plus-dip v1 candidate is restricted to SPY");
  }

  const startingCashUsd = requireFiniteNumber(raw, "startingCashUsd");
  if (startingCashUsd <= 0 || startingCashUsd > 100) {
    throw new Error("startingCashUsd must be greater than 0 and no more than the $100 research cap");
  }

  const coreAllocationPct = requireFiniteNumber(raw, "coreAllocationPct");
  if (coreAllocationPct <= 0 || coreAllocationPct >= 100) {
    throw new Error("coreAllocationPct must be greater than 0 and less than 100");
  }

  const drawdownLookbackTradingDays = requireFiniteNumber(
    raw,
    "drawdownLookbackTradingDays",
  );
  if (
    !Number.isInteger(drawdownLookbackTradingDays) ||
    drawdownLookbackTradingDays < 2 ||
    drawdownLookbackTradingDays > 252
  ) {
    throw new Error("drawdownLookbackTradingDays must be an integer from 2 through 252");
  }

  const drawdownTiersPct = requireNumberArray(raw, "drawdownTiersPct");
  if (
    drawdownTiersPct.some((tier) => tier <= 0 || tier >= 100) ||
    drawdownTiersPct.some((tier, index) => index > 0 && tier <= (drawdownTiersPct[index - 1] ?? 0))
  ) {
    throw new Error("drawdownTiersPct must be strictly increasing values between 0 and 100");
  }

  const trancheUsd = requireFiniteNumber(raw, "trancheUsd");
  if (trancheUsd <= 0 || trancheUsd > startingCashUsd) {
    throw new Error("trancheUsd must be greater than 0 and no more than startingCashUsd");
  }

  const evaluationWeekdays = requireEvaluationWeekdays(raw);
  const slippageBpsPerSide = requireFiniteNumber(raw, "slippageBpsPerSide");
  if (slippageBpsPerSide < 0 || slippageBpsPerSide > 100) {
    throw new Error("slippageBpsPerSide must be between 0 and 100 basis points");
  }

  const fixedFeeUsdPerOrder = requireFiniteNumber(raw, "fixedFeeUsdPerOrder");
  if (fixedFeeUsdPerOrder < 0 || fixedFeeUsdPerOrder > 10) {
    throw new Error("fixedFeeUsdPerOrder must be between $0 and $10");
  }

  const coreNotionalUsd = startingCashUsd * (coreAllocationPct / 100);
  const reserveUsd = startingCashUsd - coreNotionalUsd;
  const maximumDipNotionalUsd = drawdownTiersPct.length * trancheUsd;
  if (maximumDipNotionalUsd > reserveUsd + COMPARISON_EPSILON) {
    throw new Error("Dip tranches exceed the cash left after the core allocation");
  }
  if (
    fixedFeeUsdPerOrder >= coreNotionalUsd ||
    fixedFeeUsdPerOrder >= trancheUsd
  ) {
    throw new Error("fixedFeeUsdPerOrder must be less than both the core order and one tranche");
  }

  if (raw.paperOnly !== true) {
    throw new Error("paperOnly must remain true; this candidate has no live-order mode");
  }

  const isFrozenTierSet =
    drawdownTiersPct.length === 4 &&
    [2, 5, 8, 12].every((tier, index) => drawdownTiersPct[index] === tier);
  const isFrozenWeekdaySet =
    evaluationWeekdays.length === 2 &&
    evaluationWeekdays.includes("TUESDAY") &&
    evaluationWeekdays.includes("FRIDAY");
  if (
    startingCashUsd !== 100 ||
    coreAllocationPct !== 60 ||
    drawdownLookbackTradingDays !== 20 ||
    !isFrozenTierSet ||
    trancheUsd !== 10 ||
    !isFrozenWeekdaySet
  ) {
    throw new Error(
      "SPY_CORE_PLUS_DIP_V1 rules are frozen at $100, 60% core, 20 sessions, tiers 2/5/8/12, $10 tranches, and Tuesday/Friday evaluation",
    );
  }

  return {
    symbol: "SPY",
    startingCashUsd,
    coreAllocationPct,
    drawdownLookbackTradingDays,
    drawdownTiersPct: [...drawdownTiersPct],
    trancheUsd,
    evaluationWeekdays: [...evaluationWeekdays],
    slippageBpsPerSide,
    fixedFeeUsdPerOrder,
    paperOnly: true,
  };
}

function assertExecutionPriceBars(
  bars: readonly PriceBar[],
): asserts bars is readonly ExecutionPriceBar[] {
  if (bars.length === 0) {
    throw new Error("Price history is empty");
  }

  for (const [index, bar] of bars.entries()) {
    if (
      bar.open === undefined ||
      !Number.isFinite(bar.open) ||
      bar.open <= 0 ||
      !Number.isFinite(bar.close) ||
      bar.close <= 0 ||
      bar.adjustedOpen === undefined ||
      !Number.isFinite(bar.adjustedOpen) ||
      bar.adjustedOpen <= 0 ||
      !Number.isFinite(bar.adjustedClose) ||
      bar.adjustedClose <= 0
    ) {
      throw new Error(
        `Core-plus-dip backtests require a valid open price on every row (row ${index + 1}, ${bar.date})`,
      );
    }
    const expectedAdjustedOpen = bar.open * (bar.adjustedClose / bar.close);
    if (
      Math.abs(bar.adjustedOpen - expectedAdjustedOpen) /
        Math.max(1, expectedAdjustedOpen) >
      COMPARISON_EPSILON
    ) {
      throw new Error(
        `Adjusted open is inconsistent with the close adjustment factor (row ${index + 1}, ${bar.date})`,
      );
    }
    const previous = bars[index - 1];
    if (previous !== undefined && bar.date <= previous.date) {
      throw new Error("Price-bar dates must be unique and strictly increasing");
    }
  }
}

function utcWeekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function drawdownPct(current: number, high: number): number {
  const rawDrawdownPct = Math.max(0, (1 - current / high) * 100);
  return Math.round(rawDrawdownPct * 1e10) / 1e10;
}

function scheduleOrder(
  scheduledOrders: Map<number, ScheduledOrder[]>,
  executionIndex: number,
  order: ScheduledOrder,
): void {
  const existing = scheduledOrders.get(executionIndex) ?? [];
  existing.push(order);
  scheduledOrders.set(executionIndex, existing);
}

export function runCoreDipBacktest(
  bars: readonly PriceBar[],
  config: CoreDipConfig,
): CoreDipBacktestResult {
  config = parseCoreDipConfig(config);
  assertPriceBars(bars, config.symbol);
  assertExecutionPriceBars(bars);

  const eligibleWeekdays = new Set(
    config.evaluationWeekdays.map((weekday) => WEEKDAY_NUMBER[weekday]),
  );
  const coreNotionalUsd = config.startingCashUsd * (config.coreAllocationPct / 100);
  let remainingPlannedReserveUsd = config.startingCashUsd - coreNotionalUsd;
  let coreScheduled = false;
  const triggeredTiers = new Set<number>();
  const scheduledOrders = new Map<number, ScheduledOrder[]>();
  const evaluations: CoreDipEvaluation[] = [];

  for (
    let index = config.drawdownLookbackTradingDays - 1;
    index < bars.length - 1;
    index += 1
  ) {
    const bar = bars[index];
    const executionBar = bars[index + 1];
    if (
      bar === undefined ||
      executionBar === undefined ||
      !eligibleWeekdays.has(utcWeekday(bar.date))
    ) {
      continue;
    }

    const window = bars.slice(
      index - config.drawdownLookbackTradingDays + 1,
      index + 1,
    );
    const rollingHighAdjustedClose = Math.max(
      ...window.map((candidate) => candidate.adjustedClose),
    );
    const observedDrawdownPct = drawdownPct(
      bar.adjustedClose,
      rollingHighAdjustedClose,
    );
    const newlyTriggeredTiersPct = config.drawdownTiersPct.filter(
      (tier) =>
        !triggeredTiers.has(tier) &&
        observedDrawdownPct + COMPARISON_EPSILON >= tier,
    );
    const isCoreEvaluation = !coreScheduled;
    let scheduledNotionalUsd = 0;

    if (isCoreEvaluation) {
      scheduleOrder(scheduledOrders, index + 1, {
        signalDate: bar.date,
        reason: "CORE_ENTRY",
        triggeredTiersPct: [],
        referenceNotionalUsd: coreNotionalUsd,
      });
      scheduledNotionalUsd += coreNotionalUsd;
      coreScheduled = true;
    }

    const affordableTiers = newlyTriggeredTiersPct.filter(
      (_, tierIndex) =>
        remainingPlannedReserveUsd + COMPARISON_EPSILON >=
        (tierIndex + 1) * config.trancheUsd,
    );
    if (affordableTiers.length > 0) {
      for (const tier of affordableTiers) {
        triggeredTiers.add(tier);
      }
      const dipNotionalUsd = affordableTiers.length * config.trancheUsd;
      scheduleOrder(scheduledOrders, index + 1, {
        signalDate: bar.date,
        reason: "DIP_TRANCHES",
        triggeredTiersPct: affordableTiers,
        referenceNotionalUsd: dipNotionalUsd,
      });
      remainingPlannedReserveUsd -= dipNotionalUsd;
      scheduledNotionalUsd += dipNotionalUsd;
    }

    evaluations.push({
      signalDate: bar.date,
      executionDate: executionBar.date,
      rollingHighAdjustedClose,
      adjustedClose: bar.adjustedClose,
      drawdownPct: observedDrawdownPct,
      coreScheduled: isCoreEvaluation,
      newlyTriggeredTiersPct: affordableTiers,
      scheduledNotionalUsd,
      remainingReserveUsd: Math.max(0, remainingPlannedReserveUsd),
    });
  }

  const firstEvaluation = evaluations[0];
  if (firstEvaluation === undefined) {
    throw new Error(
      "Price history does not contain an eligible Tuesday/Friday evaluation plus a following execution day",
    );
  }

  const firstExecutionIndex = bars.findIndex(
    (bar) => bar.date === firstEvaluation.executionDate,
  );
  if (firstExecutionIndex < 1) {
    throw new Error("The first core-plus-dip execution bar is missing");
  }

  const slippageRate = config.slippageBpsPerSide / 10_000;
  let cash = config.startingCashUsd;
  let positionValue = 0;
  const trades: CoreDipTrade[] = [];
  const strategyPoints: EquityPoint[] = [
    {
      date: firstEvaluation.signalDate,
      equity: config.startingCashUsd,
      invested: false,
    },
  ];

  for (let index = firstExecutionIndex; index < bars.length; index += 1) {
    const bar = bars[index];
    if (bar === undefined) {
      continue;
    }
    const previousBar = bars[index - 1];
    const orders = scheduledOrders.get(index) ?? [];

    if (positionValue > 0 && previousBar !== undefined) {
      positionValue *=
        orders.length > 0
          ? bar.adjustedOpen / previousBar.adjustedClose
          : bar.adjustedClose / previousBar.adjustedClose;
    }

    for (const order of orders) {
      if (cash + COMPARISON_EPSILON < order.referenceNotionalUsd) {
        throw new Error("A scheduled core-plus-dip order exceeds remaining cash");
      }
      const netNotionalUsd =
        (order.referenceNotionalUsd - config.fixedFeeUsdPerOrder) /
        (1 + slippageRate);
      cash = Math.max(0, cash - order.referenceNotionalUsd);
      positionValue += netNotionalUsd;
      trades.push({
        signalDate: order.signalDate,
        executionDate: bar.date,
        side: "BUY",
        reason: order.reason,
        triggeredTiersPct: order.triggeredTiersPct,
        referenceNotionalUsd: order.referenceNotionalUsd,
        netNotionalUsd,
        referencePrice: bar.open,
        effectivePrice: bar.open * (1 + slippageRate),
      });
    }

    if (orders.length > 0 && positionValue > 0) {
      positionValue *= bar.adjustedClose / bar.adjustedOpen;
    }

    strategyPoints.push({
      date: bar.date,
      equity: cash + positionValue,
      invested: positionValue > 0,
    });
  }

  let benchmarkValue = 0;
  const buyAndHoldTrades: BuyAndHoldTrade[] = [];
  const benchmarkPoints: EquityPoint[] = [
    {
      date: firstEvaluation.signalDate,
      equity: config.startingCashUsd,
      invested: false,
    },
  ];
  for (let index = firstExecutionIndex; index < bars.length; index += 1) {
    const bar = bars[index];
    if (bar === undefined) {
      continue;
    }
    const previousBar = bars[index - 1];
    if (index === firstExecutionIndex) {
      benchmarkValue =
        (config.startingCashUsd - config.fixedFeeUsdPerOrder) /
        (1 + slippageRate);
      buyAndHoldTrades.push({
        signalDate: firstEvaluation.signalDate,
        executionDate: bar.date,
        side: "BUY",
        referenceNotionalUsd: config.startingCashUsd,
        netNotionalUsd: benchmarkValue,
        referencePrice: bar.open,
        effectivePrice: bar.open * (1 + slippageRate),
      });
      benchmarkValue *= bar.adjustedClose / bar.adjustedOpen;
    } else if (previousBar !== undefined) {
      benchmarkValue *= bar.adjustedClose / previousBar.adjustedClose;
    }
    benchmarkPoints.push({ date: bar.date, equity: benchmarkValue, invested: true });
  }

  const strategyMetrics = calculateMetrics(
    strategyPoints,
    config.startingCashUsd,
    trades.length,
  );
  const benchmarkMetrics = calculateMetrics(
    benchmarkPoints,
    config.startingCashUsd,
    1,
  );

  return {
    candidate: "SPY_CORE_PLUS_DIP_V1",
    configuration: config,
    strategy: strategyMetrics,
    buyAndHold: benchmarkMetrics,
    comparison: compareWithBuyAndHold(strategyMetrics, benchmarkMetrics, config.symbol),
    endingCashUsd: cash,
    trades,
    buyAndHoldTrades,
    evaluations,
    assumptions: [
      "The candidate begins with one fixed capital pool: 60% SPY core and 40% cash reserve in the checked-in v1 configuration.",
      "It evaluates only observed Tuesday and Friday closes; a market holiday is skipped rather than shifted to another weekday.",
      "Drawdown is measured from the highest adjusted close in the rolling lookback window, including the evaluation close.",
      "Each configured drawdown tier can deploy one tranche only once; there are no sales, reserve replenishments, or external cash contributions.",
      "Multiple newly crossed tiers at one evaluation are aggregated into one dip order for the following observed session.",
      "Signals use adjusted closes and simulated buys use the following session's raw open, never the signal close.",
      "The CSV adapter derives adjusted open using that row's close adjustment factor so total-return valuation remains split/dividend aware.",
      "Every simulated order pays configured proportional slippage and one fixed per-order fee from its cash envelope.",
      "Drawdown percentages are reported to 10 decimal places; valuation retains full floating-point precision until output.",
      "Cash earns no interest; taxes, market impact, regulatory fee formulas, partial fills, and share rounding are not modeled.",
      "The SPY buy-and-hold benchmark starts with the same $100, on the same next-session open, under the same cost assumptions.",
      "Annualized return is suppressed for evaluation periods shorter than 365 days.",
      "Results are research evidence, not a forecast or promise of profit.",
    ],
  };
}
