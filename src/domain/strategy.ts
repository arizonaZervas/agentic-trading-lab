import type { PriceBar, TargetAllocation } from "./model.ts";

export interface MonthEndObservation extends PriceBar {
  readonly sourceIndex: number;
}

export interface SignalDecision {
  readonly signalDate: string;
  readonly executionDate: string;
  readonly executionIndex: number;
  readonly adjustedClose: number;
  readonly movingAverage: number;
  readonly targetAllocation: TargetAllocation;
}

export interface LatestSignal {
  readonly signalDate: string;
  readonly adjustedClose: number;
  readonly movingAverage: number;
  readonly targetAllocation: TargetAllocation;
  readonly monthsObserved: number;
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function monthOrdinal(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return year * 12 + month;
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function getMonthEndObservations(
  bars: readonly PriceBar[],
): MonthEndObservation[] {
  const observations: MonthEndObservation[] = [];

  for (let index = 1; index < bars.length; index += 1) {
    const previous = bars[index - 1];
    const current = bars[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      monthKey(previous.date) !== monthKey(current.date) &&
      !previous.isMonthEnd
    ) {
      throw new Error(
        `Last observed row ${previous.date} before month transition is not marked as month end`,
      );
    }
  }

  for (const [sourceIndex, bar] of bars.entries()) {
    if (bar.isMonthEnd) {
      observations.push({ ...bar, sourceIndex });
    }
  }

  for (const observation of observations) {
    const nextBar = bars[observation.sourceIndex + 1];
    if (nextBar !== undefined && monthKey(nextBar.date) === monthKey(observation.date)) {
      throw new Error(
        `Row ${observation.date} is marked as month end but is followed by ${nextBar.date} in the same month`,
      );
    }
  }

  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1];
    const current = observations[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      monthOrdinal(current.date) - monthOrdinal(previous.date) !== 1
    ) {
      throw new Error(
        `Price history has a missing or nonconsecutive month between ${previous.date} and ${current.date}`,
      );
    }
  }

  return observations;
}

function evaluateObservation(
  observations: readonly MonthEndObservation[],
  index: number,
  movingAverageMonths: number,
): Omit<SignalDecision, "executionDate" | "executionIndex"> {
  const observation = observations[index];
  if (observation === undefined) {
    throw new Error("Signal observation is missing");
  }

  const window = observations.slice(index - movingAverageMonths + 1, index + 1);
  if (window.length !== movingAverageMonths) {
    throw new Error("Insufficient observations for the moving-average window");
  }

  const movingAverage = mean(window.map((item) => item.adjustedClose));
  return {
    signalDate: observation.date,
    adjustedClose: observation.adjustedClose,
    movingAverage,
    targetAllocation: observation.adjustedClose > movingAverage ? 1 : 0,
  };
}

export function buildExecutionDecisions(
  bars: readonly PriceBar[],
  movingAverageMonths: number,
): SignalDecision[] {
  const observations = getMonthEndObservations(bars);
  const decisions: SignalDecision[] = [];

  for (let index = movingAverageMonths - 1; index < observations.length; index += 1) {
    const observation = observations[index];
    if (observation === undefined) {
      continue;
    }

    const executionIndex = observation.sourceIndex + 1;
    const executionBar = bars[executionIndex];
    if (executionBar === undefined) {
      continue;
    }
    if (!executionBar.isFirstSessionOfMonth) {
      throw new Error(
        `Execution row ${executionBar.date} is not marked as the first trading session after month end ${observation.date}`,
      );
    }
    decisions.push({
      ...evaluateObservation(observations, index, movingAverageMonths),
      executionDate: executionBar.date,
      executionIndex,
    });
  }

  return decisions;
}

export function evaluateLatestSignal(
  bars: readonly PriceBar[],
  movingAverageMonths: number,
  confirmedMonthEndDate: string,
): LatestSignal {
  const observations = getMonthEndObservations(bars);
  const latestBar = bars.at(-1);
  if (latestBar === undefined || latestBar.date !== confirmedMonthEndDate) {
    throw new Error(
      `Latest price date ${latestBar?.date ?? "<missing>"} does not match confirmed month-end ${confirmedMonthEndDate}`,
    );
  }
  const latestIndex = observations.length - 1;
  if (latestIndex < movingAverageMonths - 1) {
    throw new Error(
      `Need ${movingAverageMonths} completed months; found ${observations.length}`,
    );
  }

  const latest = observations[latestIndex];
  if (latest === undefined || latest.date !== confirmedMonthEndDate) {
    throw new Error(
      `Latest price date ${latest?.date ?? "<missing>"} does not match confirmed month-end ${confirmedMonthEndDate}`,
    );
  }

  const evaluated = evaluateObservation(observations, latestIndex, movingAverageMonths);
  return { ...evaluated, monthsObserved: observations.length };
}
