import { createHash } from "node:crypto";

import {
  parseCoreDipConfig,
  type CoreDipConfig,
  type EvaluationWeekday,
} from "./core-dip.ts";
import {
  assertCompleteNyseSessions,
  isExpectedNyseSession,
  previousExpectedNyseSession,
} from "./market-calendar.ts";
import { assertPriceBars, type PriceBar } from "./model.ts";
import { parseSemanticRfc3339 } from "./rfc3339.ts";

export type CoreDipShadowStatus = "PROPOSAL" | "NO_TRADE";

export type CoreDipNoTradeReason =
  | "AS_OF_DATE_NOT_TUESDAY_OR_FRIDAY"
  | "NO_NEW_CORE_OR_DIP_TIER";

export interface CoreDipShadowOrder {
  readonly proposalKey: string;
  readonly symbol: "SPY";
  readonly side: "BUY";
  readonly reason: "CORE_ENTRY" | "DIP_TRANCHES";
  readonly notionalUsd: number;
  readonly triggeredTiersPct: readonly number[];
  readonly hypotheticalExecution: "NEXT_OBSERVED_SESSION_OPEN";
  readonly shadowOnly: true;
}

export interface CoreDipShadowObservation {
  readonly date: string;
  readonly evaluationWeekday: EvaluationWeekday | null;
  readonly adjustedClose: number;
  readonly rollingHighAdjustedClose: number;
  readonly drawdownPct: number;
  readonly corePreviouslyProposed: boolean;
  readonly coreProposedThisRun: boolean;
  readonly previouslyUsedTiersPct: readonly number[];
  readonly newlyTriggeredTiersPct: readonly number[];
  readonly usedTiersPct: readonly number[];
  readonly remainingReserveUsdBefore: number;
  readonly remainingReserveUsdAfter: number;
}

export interface CoreDipShadowSafety {
  readonly mode: "SHADOW_ONLY";
  readonly paperOnly: true;
  readonly brokerOrdersCreated: false;
  readonly liveOrderIntent: false;
  readonly requiresHumanApprovalBeforeAnyFutureLiveOrder: true;
  readonly statement: string;
}

export interface CoreDipShadowReport {
  readonly candidate: "SPY_CORE_PLUS_DIP_V1";
  readonly symbol: "SPY";
  readonly runKey: string;
  readonly dataFingerprint: string;
  readonly experimentStartDate: string;
  readonly asOfDate: string;
  readonly status: CoreDipShadowStatus;
  readonly observation: CoreDipShadowObservation;
  readonly shadowOrders: readonly CoreDipShadowOrder[];
  readonly usedTiersPct: readonly number[];
  readonly replayedEvaluationCount: number;
  readonly noTradeReason: CoreDipNoTradeReason | null;
  readonly safety: CoreDipShadowSafety;
}

export interface CoreDipMorningReference {
  readonly beginsAt: string;
  readonly price: number;
  readonly volume: number;
  readonly interval: "minute";
  readonly bounds: "regular";
  readonly session: "reg";
  readonly interpolated: false;
  readonly source: "robinhood-equity-historicals";
}

export interface CoreDipMorningShadowOrder {
  readonly proposalKey: string;
  readonly symbol: "SPY";
  readonly side: "BUY";
  readonly reason: "CORE_ENTRY" | "DIP_TRANCHES";
  readonly signalDate: string;
  readonly notionalUsd: number;
  readonly triggeredTiersPct: readonly number[];
  readonly openingReferencePrice: number;
  readonly executionStatus: "NOT_SUBMITTED";
  readonly actualFillPrice: null;
  readonly requiresLaterExactHumanApproval: true;
  readonly shadowOnly: true;
}

export interface CoreDipMorningShadowReport {
  readonly candidate: "SPY_CORE_PLUS_DIP_MORNING_V1";
  readonly symbol: "SPY";
  readonly runKey: string;
  readonly dataFingerprint: string;
  readonly experimentStartDate: string;
  readonly reportDate: string;
  readonly signalDate: string;
  readonly status: CoreDipShadowStatus;
  readonly observation: {
    readonly reportDate: string;
    readonly reportWeekday: EvaluationWeekday;
    readonly signalDate: string;
    readonly adjustedClose: number;
    readonly rollingHighAdjustedClose: number;
    readonly drawdownPct: number;
    readonly corePreviouslyProposed: boolean;
    readonly coreProposedThisRun: boolean;
    readonly previouslyUsedTiersPct: readonly number[];
    readonly newlyTriggeredTiersPct: readonly number[];
    readonly usedTiersPct: readonly number[];
    readonly remainingReserveUsdBefore: number;
    readonly remainingReserveUsdAfter: number;
  };
  readonly openingReference: CoreDipMorningReference;
  readonly shadowOrders: readonly CoreDipMorningShadowOrder[];
  readonly usedTiersPct: readonly number[];
  readonly replayedEvaluationCount: number;
  readonly noTradeReason: "NO_NEW_CORE_OR_DIP_TIER" | null;
  readonly safety: CoreDipShadowSafety & {
    readonly actualFillKnown: false;
    readonly openingPriceIsReferenceOnly: true;
  };
}

const CANDIDATE = "SPY_CORE_PLUS_DIP_V1" as const;
const MORNING_CANDIDATE = "SPY_CORE_PLUS_DIP_MORNING_V1" as const;
const COMPARISON_EPSILON = 1e-9;
const MAX_MORNING_REFERENCE_AGE_MS = 15 * 60 * 1_000;
const WEEKDAY_NUMBER: Readonly<Record<EvaluationWeekday, number>> = {
  TUESDAY: 2,
  FRIDAY: 5,
};

function assertIsoDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be an ISO date`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${field} must be a valid ISO date`);
  }
}

function utcWeekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function losAngelesDateTimeParts(instant: Date): Readonly<{
  date: string;
  hour: string;
  minute: string;
  second: string;
}> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.get("year")}-${values.get("month")}-${values.get("day")}`,
    hour: values.get("hour") ?? "",
    minute: values.get("minute") ?? "",
    second: values.get("second") ?? "",
  };
}

function evaluationWeekday(date: string): EvaluationWeekday | null {
  const weekday = utcWeekday(date);
  if (weekday === WEEKDAY_NUMBER.TUESDAY) {
    return "TUESDAY";
  }
  if (weekday === WEEKDAY_NUMBER.FRIDAY) {
    return "FRIDAY";
  }
  return null;
}

function drawdownPct(current: number, high: number): number {
  const rawDrawdownPct = Math.max(0, (1 - current / high) * 100);
  return Math.round(rawDrawdownPct * 1e10) / 1e10;
}

function rollingObservation(
  bars: readonly PriceBar[],
  index: number,
  lookback: number,
): Pick<
  CoreDipShadowObservation,
  "adjustedClose" | "rollingHighAdjustedClose" | "drawdownPct"
> {
  const bar = bars[index];
  if (bar === undefined || index < lookback - 1) {
    throw new Error(
      `Price history has insufficient lookback for ${lookback}-session evaluation`,
    );
  }
  const window = bars.slice(index - lookback + 1, index + 1);
  const rollingHighAdjustedClose = Math.max(
    ...window.map((candidate) => candidate.adjustedClose),
  );
  return {
    adjustedClose: bar.adjustedClose,
    rollingHighAdjustedClose,
    drawdownPct: drawdownPct(bar.adjustedClose, rollingHighAdjustedClose),
  };
}

function orderedUsedTiers(
  configuredTiers: readonly number[],
  usedTiers: ReadonlySet<number>,
): readonly number[] {
  return configuredTiers.filter((tier) => usedTiers.has(tier));
}

function fingerprint(
  bars: readonly PriceBar[],
  config: CoreDipConfig,
  asOfDate: string,
  experimentStartDate: string,
): string {
  const canonicalInput = JSON.stringify([
    CANDIDATE,
    experimentStartDate,
    asOfDate,
    [
      config.symbol,
      config.startingCashUsd,
      config.coreAllocationPct,
      config.drawdownLookbackTradingDays,
      [...config.drawdownTiersPct],
      config.trancheUsd,
      [...config.evaluationWeekdays].sort(),
      config.slippageBpsPerSide,
      config.fixedFeeUsdPerOrder,
      config.paperOnly,
    ],
    bars.map((bar) => [
      bar.symbol,
      bar.date,
      bar.open ?? null,
      bar.close,
      bar.adjustedOpen ?? null,
      bar.adjustedClose,
      bar.isMonthEnd,
      bar.isFirstSessionOfMonth,
    ]),
  ]);
  return createHash("sha256").update(canonicalInput).digest("hex");
}

function nextDate(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function fingerprintMorningSignal(
  bars: readonly PriceBar[],
  config: CoreDipConfig,
  reportDate: string,
  experimentStartDate: string,
): string {
  const canonicalInput = JSON.stringify([
    MORNING_CANDIDATE,
    experimentStartDate,
    reportDate,
    [
      config.symbol,
      config.startingCashUsd,
      config.coreAllocationPct,
      config.drawdownLookbackTradingDays,
      [...config.drawdownTiersPct],
      config.trancheUsd,
      [...config.evaluationWeekdays].sort(),
      config.slippageBpsPerSide,
      config.fixedFeeUsdPerOrder,
      config.paperOnly,
    ],
    bars.map((bar) => [bar.symbol, bar.date, bar.adjustedClose]),
  ]);
  return createHash("sha256").update(canonicalInput).digest("hex");
}

export function createCoreDipShadowReport(
  bars: readonly PriceBar[],
  config: CoreDipConfig,
  asOfDate: string,
  experimentStartDate: string,
): CoreDipShadowReport {
  config = parseCoreDipConfig(config);
  assertPriceBars(bars, config.symbol);
  assertIsoDate(asOfDate, "asOfDate");
  assertIsoDate(experimentStartDate, "experimentStartDate");

  const asOfIndex = bars.findIndex((bar) => bar.date === asOfDate);
  if (asOfIndex < 0) {
    throw new Error(`asOfDate ${asOfDate} is missing from price history`);
  }
  if (asOfIndex !== bars.length - 1) {
    throw new Error(
      `asOfDate ${asOfDate} must be the latest price row (${bars.at(-1)?.date})`,
    );
  }
  if (experimentStartDate > asOfDate) {
    throw new Error("experimentStartDate must not be after asOfDate");
  }
  const experimentStartIndex = bars.findIndex(
    (bar) => bar.date === experimentStartDate,
  );
  if (experimentStartIndex < 0) {
    throw new Error(
      `experimentStartDate ${experimentStartDate} is missing from price history`,
    );
  }
  if (experimentStartIndex < config.drawdownLookbackTradingDays - 1) {
    throw new Error(
      `Price history must include ${config.drawdownLookbackTradingDays - 1} sessions before experimentStartDate ${experimentStartDate}`,
    );
  }
  if (asOfIndex < config.drawdownLookbackTradingDays - 1) {
    throw new Error(
      `Price history has insufficient lookback for the ${asOfDate} as-of observation`,
    );
  }

  const eligibleWeekdays = new Set(
    config.evaluationWeekdays.map((weekday) => WEEKDAY_NUMBER[weekday]),
  );
  const coreNotionalUsd =
    config.startingCashUsd * (config.coreAllocationPct / 100);
  let remainingReserveUsd = config.startingCashUsd - coreNotionalUsd;
  let corePreviouslyProposed = false;
  let replayedEvaluationCount = 0;
  const usedTiers = new Set<number>();

  let currentCorePreviouslyProposed = false;
  let currentCoreProposed = false;
  let currentPreviousTiers: readonly number[] = [];
  let currentNewTiers: readonly number[] = [];
  let currentReserveBefore = remainingReserveUsd;
  let currentObservation:
    | Pick<
        CoreDipShadowObservation,
        "adjustedClose" | "rollingHighAdjustedClose" | "drawdownPct"
      >
    | undefined;

  for (let index = 0; index <= asOfIndex; index += 1) {
    const bar = bars[index];
    if (
      bar === undefined ||
      bar.date < experimentStartDate ||
      !eligibleWeekdays.has(utcWeekday(bar.date))
    ) {
      continue;
    }
    if (index < config.drawdownLookbackTradingDays - 1) {
      throw new Error(
        `Price history has insufficient lookback for experiment evaluation ${bar.date}`,
      );
    }

    const observed = rollingObservation(
      bars,
      index,
      config.drawdownLookbackTradingDays,
    );
    const coreProposed = !corePreviouslyProposed;
    const usedBefore = orderedUsedTiers(config.drawdownTiersPct, usedTiers);
    const newlyTriggeredTiers = config.drawdownTiersPct.filter(
      (tier) =>
        !usedTiers.has(tier) &&
        observed.drawdownPct + COMPARISON_EPSILON >= tier,
    );
    const affordableTiers = newlyTriggeredTiers.filter(
      (_, tierIndex) =>
        remainingReserveUsd + COMPARISON_EPSILON >=
        (tierIndex + 1) * config.trancheUsd,
    );
    const reserveBefore = remainingReserveUsd;

    corePreviouslyProposed = true;
    for (const tier of affordableTiers) {
      usedTiers.add(tier);
    }
    remainingReserveUsd = Math.max(
      0,
      remainingReserveUsd - affordableTiers.length * config.trancheUsd,
    );
    replayedEvaluationCount += 1;

    if (index === asOfIndex) {
      currentCorePreviouslyProposed = !coreProposed;
      currentCoreProposed = coreProposed;
      currentPreviousTiers = usedBefore;
      currentNewTiers = [...affordableTiers];
      currentReserveBefore = reserveBefore;
      currentObservation = observed;
    }
  }

  const asOfBar = bars[asOfIndex];
  if (asOfBar === undefined) {
    throw new Error(`asOfDate ${asOfDate} is missing from price history`);
  }
  const asOfEvaluationWeekday = evaluationWeekday(asOfDate);
  const isEvaluationDay =
    asOfEvaluationWeekday !== null &&
    eligibleWeekdays.has(utcWeekday(asOfDate));

  if (!isEvaluationDay) {
    currentCorePreviouslyProposed = corePreviouslyProposed;
    currentPreviousTiers = orderedUsedTiers(config.drawdownTiersPct, usedTiers);
    currentNewTiers = [];
    currentReserveBefore = remainingReserveUsd;
    currentObservation = rollingObservation(
      bars,
      asOfIndex,
      config.drawdownLookbackTradingDays,
    );
  }
  if (currentObservation === undefined) {
    throw new Error(`No replay observation was produced for asOfDate ${asOfDate}`);
  }

  const orderSpecs: Array<
    Pick<
      CoreDipShadowOrder,
      "reason" | "notionalUsd" | "triggeredTiersPct"
    >
  > = [];
  if (currentCoreProposed) {
    orderSpecs.push({
      reason: "CORE_ENTRY",
      notionalUsd: coreNotionalUsd,
      triggeredTiersPct: [],
    });
  }
  if (currentNewTiers.length > 0) {
    orderSpecs.push({
      reason: "DIP_TRANCHES",
      notionalUsd: currentNewTiers.length * config.trancheUsd,
      triggeredTiersPct: [...currentNewTiers],
    });
  }

  const dataFingerprint = fingerprint(
    bars,
    config,
    asOfDate,
    experimentStartDate,
  );
  const runKey = [
    CANDIDATE,
    experimentStartDate,
    asOfDate,
    dataFingerprint.slice(0, 16),
  ].join(":");
  const shadowOrders: readonly CoreDipShadowOrder[] = orderSpecs.map((order) => ({
    proposalKey: [
      runKey,
      "SPY",
      "BUY",
      order.reason,
      order.triggeredTiersPct.join("-") || "CORE",
    ].join(":"),
    symbol: "SPY",
    side: "BUY",
    reason: order.reason,
    notionalUsd: order.notionalUsd,
    triggeredTiersPct: [...order.triggeredTiersPct],
    hypotheticalExecution: "NEXT_OBSERVED_SESSION_OPEN",
    shadowOnly: true,
  }));
  const status: CoreDipShadowStatus =
    shadowOrders.length > 0 ? "PROPOSAL" : "NO_TRADE";
  const finalUsedTiers = orderedUsedTiers(config.drawdownTiersPct, usedTiers);

  return {
    candidate: CANDIDATE,
    symbol: "SPY",
    runKey,
    dataFingerprint,
    experimentStartDate,
    asOfDate,
    status,
    observation: {
      date: asOfDate,
      evaluationWeekday: asOfEvaluationWeekday,
      ...currentObservation,
      corePreviouslyProposed: currentCorePreviouslyProposed,
      coreProposedThisRun: currentCoreProposed,
      previouslyUsedTiersPct: [...currentPreviousTiers],
      newlyTriggeredTiersPct: [...currentNewTiers],
      usedTiersPct: [...finalUsedTiers],
      remainingReserveUsdBefore: currentReserveBefore,
      remainingReserveUsdAfter: remainingReserveUsd,
    },
    shadowOrders,
    usedTiersPct: [...finalUsedTiers],
    replayedEvaluationCount,
    noTradeReason:
      status === "PROPOSAL"
        ? null
        : isEvaluationDay
          ? "NO_NEW_CORE_OR_DIP_TIER"
          : "AS_OF_DATE_NOT_TUESDAY_OR_FRIDAY",
    safety: {
      mode: "SHADOW_ONLY",
      paperOnly: true,
      brokerOrdersCreated: false,
      liveOrderIntent: false,
      requiresHumanApprovalBeforeAnyFutureLiveOrder: true,
      statement:
        "Shadow analysis only: this report creates no broker order and expresses no live-order intent.",
    },
  };
}

/**
 * Evaluate the morning variant from the immediately prior completed session.
 * The opening print is carried only as context: it never changes the signal,
 * stable proposal keys, or candidate state and is never represented as a fill.
 */
export function createCoreDipMorningShadowReport(
  bars: readonly PriceBar[],
  config: CoreDipConfig,
  reportDate: string,
  experimentStartDate: string,
  openingReference: CoreDipMorningReference,
  now: Date = new Date(),
): CoreDipMorningShadowReport {
  config = parseCoreDipConfig(config);
  assertPriceBars(bars, config.symbol);
  assertIsoDate(reportDate, "reportDate");
  assertIsoDate(experimentStartDate, "experimentStartDate");

  if (Number.isNaN(now.valueOf())) {
    throw new Error("Morning report validation clock is invalid");
  }
  const currentLosAngelesDate = losAngelesDateTimeParts(now).date;
  if (reportDate !== currentLosAngelesDate) {
    throw new Error(
      `reportDate must match current America/Los_Angeles date ${currentLosAngelesDate}`,
    );
  }
  if (!isExpectedNyseSession(reportDate, "Core-dip morning report")) {
    throw new Error("reportDate must be an expected NYSE session");
  }

  const reportWeekday = evaluationWeekday(reportDate);
  if (reportWeekday === null) {
    throw new Error("reportDate must be Tuesday or Friday");
  }
  if (evaluationWeekday(experimentStartDate) === null) {
    throw new Error("experimentStartDate must be Tuesday or Friday");
  }
  if (experimentStartDate > reportDate) {
    throw new Error("experimentStartDate must not be after reportDate");
  }
  if (bars.length === 0) {
    throw new Error("Price history is empty");
  }
  const finalBar = bars.at(-1);
  if (finalBar === undefined || finalBar.date >= reportDate) {
    throw new Error(
      "Price history must end at the completed session before reportDate and contain no current-session or future bar",
    );
  }
  const expectedPriorSession = previousExpectedNyseSession(
    reportDate,
    "Core-dip morning report",
  );
  if (finalBar.date !== expectedPriorSession) {
    throw new Error(
      `Price history must end at the immediately prior expected NYSE session ${expectedPriorSession}`,
    );
  }
  assertCompleteNyseSessions(
    bars,
    expectedPriorSession,
    "Core-dip morning report",
  );
  if (typeof openingReference.beginsAt !== "string") {
    throw new Error(
      "openingReference beginsAt must be a semantically valid RFC3339 timestamp",
    );
  }
  const beginsAtMs = parseSemanticRfc3339(
    openingReference.beginsAt,
    "openingReference beginsAt",
  );
  const beginsAgeMs = now.valueOf() - beginsAtMs;
  const beginsLosAngeles = Number.isFinite(beginsAtMs)
    ? losAngelesDateTimeParts(new Date(beginsAtMs))
    : undefined;
  if (
    Number.isFinite(beginsAtMs) &&
    beginsAgeMs >= 0 &&
    beginsAgeMs < 60_000
  ) {
    throw new Error("openingReference minute bar must be complete");
  }
  if (
    !Number.isFinite(beginsAtMs) ||
    beginsAgeMs < 0 ||
    beginsAgeMs > MAX_MORNING_REFERENCE_AGE_MS ||
    beginsLosAngeles?.date !== reportDate ||
    beginsLosAngeles?.hour !== "06" ||
    beginsLosAngeles?.minute !== "30" ||
    beginsLosAngeles?.second !== "00" ||
    new Date(beginsAtMs).getUTCMilliseconds() !== 0 ||
    !Number.isFinite(openingReference.price) ||
    openingReference.price <= 0 ||
    !Number.isFinite(openingReference.volume) ||
    openingReference.volume <= 0 ||
    openingReference.interval !== "minute" ||
    openingReference.bounds !== "regular" ||
    openingReference.session !== "reg" ||
    openingReference.interpolated !== false ||
    openingReference.source !== "robinhood-equity-historicals"
  ) {
    throw new Error("openingReference must be a validated regular-session opening print");
  }

  const barIndexByDate = new Map(bars.map((bar, index) => [bar.date, index]));
  if (
    experimentStartDate < reportDate &&
    !barIndexByDate.has(experimentStartDate)
  ) {
    throw new Error(
      `experimentStartDate ${experimentStartDate} must be an observed Tuesday/Friday market session`,
    );
  }

  const eligibleWeekdays = new Set(
    config.evaluationWeekdays.map((weekday) => WEEKDAY_NUMBER[weekday]),
  );
  const coreNotionalUsd =
    config.startingCashUsd * (config.coreAllocationPct / 100);
  let remainingReserveUsd = config.startingCashUsd - coreNotionalUsd;
  let corePreviouslyProposed = false;
  let replayedEvaluationCount = 0;
  const usedTiers = new Set<number>();

  let currentSignalDate: string | undefined;
  let currentObserved:
    | Pick<
        CoreDipShadowObservation,
        "adjustedClose" | "rollingHighAdjustedClose" | "drawdownPct"
      >
    | undefined;
  let currentCorePreviouslyProposed = false;
  let currentCoreProposed = false;
  let currentPreviouslyUsedTiers: readonly number[] = [];
  let currentNewTiers: readonly number[] = [];
  let currentReserveBefore = remainingReserveUsd;

  for (
    let candidateReportDate = experimentStartDate;
    candidateReportDate <= reportDate;
    candidateReportDate = nextDate(candidateReportDate)
  ) {
    const weekday = utcWeekday(candidateReportDate);
    if (!eligibleWeekdays.has(weekday)) {
      continue;
    }

    const isCurrentReport = candidateReportDate === reportDate;
    // A missing historical report-date bar represents a full-day closure. The
    // current report is proven open by the strict schema-v2 opening print.
    if (!isCurrentReport && !barIndexByDate.has(candidateReportDate)) {
      continue;
    }

    let signalIndex: number;
    if (isCurrentReport) {
      signalIndex = bars.length - 1;
    } else {
      const reportBarIndex = barIndexByDate.get(candidateReportDate);
      if (reportBarIndex === undefined) {
        continue;
      }
      signalIndex = reportBarIndex - 1;
    }
    if (signalIndex < config.drawdownLookbackTradingDays - 1) {
      throw new Error(
        `Price history must include ${config.drawdownLookbackTradingDays} completed sessions through the session before reportDate ${candidateReportDate}`,
      );
    }

    const signalBar = bars[signalIndex];
    if (signalBar === undefined || signalBar.date >= candidateReportDate) {
      throw new Error(
        `No completed prior-session observation exists for reportDate ${candidateReportDate}`,
      );
    }
    const observed = rollingObservation(
      bars,
      signalIndex,
      config.drawdownLookbackTradingDays,
    );
    const coreProposed = !corePreviouslyProposed;
    const usedBefore = orderedUsedTiers(config.drawdownTiersPct, usedTiers);
    const newlyTriggeredTiers = config.drawdownTiersPct.filter(
      (tier) =>
        !usedTiers.has(tier) &&
        observed.drawdownPct + COMPARISON_EPSILON >= tier,
    );
    const affordableTiers = newlyTriggeredTiers.filter(
      (_, tierIndex) =>
        remainingReserveUsd + COMPARISON_EPSILON >=
        (tierIndex + 1) * config.trancheUsd,
    );
    const reserveBefore = remainingReserveUsd;

    corePreviouslyProposed = true;
    for (const tier of affordableTiers) {
      usedTiers.add(tier);
    }
    remainingReserveUsd = Math.max(
      0,
      remainingReserveUsd - affordableTiers.length * config.trancheUsd,
    );
    replayedEvaluationCount += 1;

    if (isCurrentReport) {
      currentSignalDate = signalBar.date;
      currentObserved = observed;
      currentCorePreviouslyProposed = !coreProposed;
      currentCoreProposed = coreProposed;
      currentPreviouslyUsedTiers = usedBefore;
      currentNewTiers = [...affordableTiers];
      currentReserveBefore = reserveBefore;
    }
  }

  if (currentSignalDate === undefined || currentObserved === undefined) {
    throw new Error(`No morning observation was produced for reportDate ${reportDate}`);
  }

  const dataFingerprint = fingerprintMorningSignal(
    bars,
    config,
    reportDate,
    experimentStartDate,
  );
  const runKey = [
    MORNING_CANDIDATE,
    experimentStartDate,
    reportDate,
    dataFingerprint.slice(0, 16),
  ].join(":");
  const orderSpecs: Array<{
    reason: CoreDipMorningShadowOrder["reason"];
    notionalUsd: number;
    triggeredTiersPct: readonly number[];
  }> = [];
  if (currentCoreProposed) {
    orderSpecs.push({
      reason: "CORE_ENTRY",
      notionalUsd: coreNotionalUsd,
      triggeredTiersPct: [],
    });
  }
  if (currentNewTiers.length > 0) {
    orderSpecs.push({
      reason: "DIP_TRANCHES",
      notionalUsd: currentNewTiers.length * config.trancheUsd,
      triggeredTiersPct: [...currentNewTiers],
    });
  }
  const shadowOrders = orderSpecs.map((order) => ({
    proposalKey: [
      runKey,
      "SPY",
      "BUY",
      order.reason,
      order.triggeredTiersPct.join("-") || "CORE",
    ].join(":"),
    symbol: "SPY" as const,
    side: "BUY" as const,
    reason: order.reason,
    signalDate: currentSignalDate,
    notionalUsd: order.notionalUsd,
    triggeredTiersPct: [...order.triggeredTiersPct],
    openingReferencePrice: openingReference.price,
    executionStatus: "NOT_SUBMITTED" as const,
    actualFillPrice: null,
    requiresLaterExactHumanApproval: true as const,
    shadowOnly: true as const,
  }));
  const finalUsedTiers = orderedUsedTiers(config.drawdownTiersPct, usedTiers);
  const status: CoreDipShadowStatus =
    shadowOrders.length > 0 ? "PROPOSAL" : "NO_TRADE";

  return {
    candidate: MORNING_CANDIDATE,
    symbol: "SPY",
    runKey,
    dataFingerprint,
    experimentStartDate,
    reportDate,
    signalDate: currentSignalDate,
    status,
    observation: {
      reportDate,
      reportWeekday,
      signalDate: currentSignalDate,
      ...currentObserved,
      corePreviouslyProposed: currentCorePreviouslyProposed,
      coreProposedThisRun: currentCoreProposed,
      previouslyUsedTiersPct: [...currentPreviouslyUsedTiers],
      newlyTriggeredTiersPct: [...currentNewTiers],
      usedTiersPct: [...finalUsedTiers],
      remainingReserveUsdBefore: currentReserveBefore,
      remainingReserveUsdAfter: remainingReserveUsd,
    },
    openingReference: { ...openingReference },
    shadowOrders,
    usedTiersPct: [...finalUsedTiers],
    replayedEvaluationCount,
    noTradeReason: status === "PROPOSAL" ? null : "NO_NEW_CORE_OR_DIP_TIER",
    safety: {
      mode: "SHADOW_ONLY",
      paperOnly: true,
      brokerOrdersCreated: false,
      liveOrderIntent: false,
      requiresHumanApprovalBeforeAnyFutureLiveOrder: true,
      actualFillKnown: false,
      openingPriceIsReferenceOnly: true,
      statement:
        "Shadow analysis only: the opening print is a reference, not a promised fill; no broker order exists and any later order requires exact human approval.",
    },
  };
}
