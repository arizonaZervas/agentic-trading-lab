export interface PriceBar {
  readonly symbol: string;
  readonly date: string;
  readonly open?: number;
  readonly close: number;
  readonly adjustedOpen?: number;
  readonly adjustedClose: number;
  readonly isMonthEnd: boolean;
  readonly isFirstSessionOfMonth: boolean;
}

export interface StrategyConfig {
  readonly symbol: "SPY";
  readonly movingAverageMonths: 10;
  readonly startingCashUsd: 100;
  readonly slippageBpsPerSide: number;
  readonly fixedFeeUsdPerOrder: number;
  readonly paperOnly: true;
}

export type TargetAllocation = 0 | 1;

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function assertPositivePrice(
  value: unknown,
  field: string,
  rowNumber: number,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Price row ${rowNumber} has an invalid ${field}`);
  }
}

export function assertPriceBars(
  bars: readonly PriceBar[],
  expectedSymbol: string,
): void {
  let previousDate: string | undefined;
  for (const [index, bar] of bars.entries()) {
    const rowNumber = index + 1;
    if (bar.symbol !== expectedSymbol) {
      throw new Error(
        `Price rows must be explicitly labeled ${expectedSymbol} (row ${rowNumber}, ${bar.date})`,
      );
    }
    if (typeof bar.date !== "string" || !isIsoDate(bar.date)) {
      throw new Error(`Price row ${rowNumber} has an invalid ISO date`);
    }
    if (previousDate !== undefined && bar.date <= previousDate) {
      throw new Error(`Price dates must be unique and strictly increasing (row ${rowNumber})`);
    }
    assertPositivePrice(bar.close, "close", rowNumber);
    assertPositivePrice(bar.adjustedClose, "adjusted close", rowNumber);
    if (bar.open !== undefined) {
      assertPositivePrice(bar.open, "open", rowNumber);
    }
    if (bar.adjustedOpen !== undefined) {
      assertPositivePrice(bar.adjustedOpen, "adjusted open", rowNumber);
    }
    if (
      typeof bar.isMonthEnd !== "boolean" ||
      typeof bar.isFirstSessionOfMonth !== "boolean"
    ) {
      throw new Error(`Price row ${rowNumber} has invalid session markers`);
    }
    previousDate = bar.date;
  }
}

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

export function parseStrategyConfig(raw: unknown): StrategyConfig {
  if (!isRecord(raw)) {
    throw new Error("Strategy configuration must be a JSON object");
  }

  if (raw.symbol !== "SPY") {
    throw new Error("SPY_TREND_10_MONTH_V1 is restricted to SPY");
  }

  const movingAverageMonths = requireFiniteNumber(raw, "movingAverageMonths");
  if (movingAverageMonths !== 10) {
    throw new Error("SPY_TREND_10_MONTH_V1 is frozen at a 10-month moving average");
  }

  const startingCashUsd = requireFiniteNumber(raw, "startingCashUsd");
  if (startingCashUsd !== 100) {
    throw new Error("SPY_TREND_10_MONTH_V1 is frozen at the $100 research cap");
  }

  const slippageBpsPerSide = requireFiniteNumber(raw, "slippageBpsPerSide");
  if (slippageBpsPerSide < 0 || slippageBpsPerSide > 100) {
    throw new Error("slippageBpsPerSide must be between 0 and 100 basis points");
  }

  const fixedFeeUsdPerOrder = requireFiniteNumber(raw, "fixedFeeUsdPerOrder");
  if (fixedFeeUsdPerOrder < 0 || fixedFeeUsdPerOrder > 10) {
    throw new Error("fixedFeeUsdPerOrder must be between $0 and $10");
  }
  if (fixedFeeUsdPerOrder >= startingCashUsd) {
    throw new Error("fixedFeeUsdPerOrder must be less than startingCashUsd");
  }

  if (raw.paperOnly !== true) {
    throw new Error("paperOnly must remain true; this prototype has no live-order mode");
  }

  return {
    symbol: "SPY",
    movingAverageMonths: 10,
    startingCashUsd: 100,
    slippageBpsPerSide,
    fixedFeeUsdPerOrder,
    paperOnly: true,
  };
}
