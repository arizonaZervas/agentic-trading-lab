import { createHash } from "node:crypto";

import {
  assertCompleteNyseSessions,
  isExpectedNyseSession,
  previousExpectedNyseSession,
} from "../domain/market-calendar.ts";
import type { PriceBar } from "../domain/model.ts";
import { parseSemanticRfc3339 } from "../domain/rfc3339.ts";

const EXPECTED_SYMBOL = "SPY" as const;
const MAX_SNAPSHOT_AGE_MS = 60 * 60 * 1_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const MAX_MORNING_SNAPSHOT_AGE_MS = 15 * 60 * 1_000;
const MORNING_OPENING_REFERENCE_SOURCE =
  "robinhood-equity-historicals" as const;
const MORNING_ADJUSTMENT_FACTOR_SOURCE =
  "robinhood-quote-corporate-action-factor" as const;
// Market-data JSON is parsed as IEEE-754 numbers. This permits less than one
// part per billion of relative representation/serialization error.
const ADJUSTED_PRICE_RELATIVE_TOLERANCE = 1e-9;
const OFFICIAL_CLOSE_SOURCES = new Set([
  "sip-close",
  "sip-list-exchange-close",
] as const);

export type CoreDipOfficialCloseSource =
  | "sip-close"
  | "sip-list-exchange-close";

export interface CoreDipSnapshotOfficialClose {
  readonly date: string;
  readonly price: number;
  readonly interpolated: false;
  readonly source: CoreDipOfficialCloseSource;
}

export interface CoreDipSnapshot {
  readonly symbol: typeof EXPECTED_SYMBOL;
  readonly fetchedAt: string;
  readonly officialClose: CoreDipSnapshotOfficialClose;
  readonly bars: readonly PriceBar[];
  readonly dataFingerprint: string;
}

export interface CoreDipMorningPriorOfficialClose {
  readonly date: string;
  /** Settled, unadjusted SIP close. */
  readonly price: number;
  /** Raw quote.previous_close used only as the factor denominator. */
  readonly quotePreviousClose: number;
  /** quote.adjusted_previous_close used only as the factor numerator. */
  readonly quoteAdjustedPreviousClose: number;
  readonly adjustmentFactor: number;
  readonly adjustmentFactorSource: typeof MORNING_ADJUSTMENT_FACTOR_SOURCE;
  /** Adjusted prior close in the same unit as bars[].adjustedClose. */
  readonly adjustedPrice: number;
  readonly interpolated: false;
  readonly source: CoreDipOfficialCloseSource;
}

export interface CoreDipMorningOpeningReference {
  readonly beginsAt: string;
  readonly price: number;
  readonly volume: number;
  readonly interval: "minute";
  readonly bounds: "regular";
  readonly session: "reg";
  readonly interpolated: false;
  readonly source: typeof MORNING_OPENING_REFERENCE_SOURCE;
}

export interface CoreDipMorningAdjustedHistoryProvenance {
  readonly source: typeof MORNING_OPENING_REFERENCE_SOURCE;
  readonly interval: "4hour";
  readonly bounds: "regular";
  readonly adjustmentType: "all";
  readonly sessionAggregation: "last-regular-bar-by-session-date";
}

export interface CoreDipMorningSnapshot {
  readonly schemaVersion: 2;
  readonly symbol: typeof EXPECTED_SYMBOL;
  readonly reportDate: string;
  readonly fetchedAt: string;
  readonly priorOfficialClose: CoreDipMorningPriorOfficialClose;
  readonly adjustedHistoryProvenance: CoreDipMorningAdjustedHistoryProvenance;
  readonly openingReference: CoreDipMorningOpeningReference;
  readonly bars: readonly PriceBar[];
  readonly dataFingerprint: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertObjectShape(
  value: unknown,
  context: string,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object`);
  }

  const acceptedKeys = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of Object.keys(value)) {
    if (!acceptedKeys.has(key)) {
      throw new Error(`${context} has an unexpected ${key} field`);
    }
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) {
      throw new Error(`${context} is missing ${key}`);
    }
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function requireIsoDate(value: unknown, context: string): string {
  if (typeof value !== "string" || !isIsoDate(value)) {
    throw new Error(`${context} must be a valid ISO date`);
  }
  return value;
}

function requirePositivePrice(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${context} must be a finite positive number`);
  }
  return value;
}

function approximatelyEqual(left: number, right: number): boolean {
  return (
    Math.abs(left - right) /
      Math.max(1, Math.abs(left), Math.abs(right)) <=
    ADJUSTED_PRICE_RELATIVE_TOLERANCE
  );
}

function requireRfc3339(value: unknown, context: string): string {
  if (typeof value !== "string") {
    throw new Error(`${context} must be a semantically valid RFC3339 timestamp`);
  }
  parseSemanticRfc3339(value, context);
  return value;
}

function losAngelesDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
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

function fingerprintSnapshot(
  officialClose: CoreDipSnapshotOfficialClose,
  bars: readonly PriceBar[],
): string {
  // Retrieval time is operational metadata. The same validated market snapshot
  // fetched twice must retain one data identity for duplicate-run detection.
  const canonicalData = JSON.stringify({
    schemaVersion: 1,
    symbol: EXPECTED_SYMBOL,
    officialClose: {
      date: officialClose.date,
      price: officialClose.price,
      source: officialClose.source,
    },
    bars: bars.map((bar) => ({ date: bar.date, adjustedClose: bar.adjustedClose })),
  });
  return createHash("sha256").update(canonicalData).digest("hex");
}

function fingerprintMorningSnapshot(
  reportDate: string,
  priorOfficialClose: CoreDipMorningPriorOfficialClose,
  adjustedHistoryProvenance: CoreDipMorningAdjustedHistoryProvenance,
  openingReference: CoreDipMorningOpeningReference,
  bars: readonly PriceBar[],
): string {
  const canonicalData = JSON.stringify({
    schemaVersion: 2,
    symbol: EXPECTED_SYMBOL,
    reportDate,
    priorOfficialClose: {
      date: priorOfficialClose.date,
      price: priorOfficialClose.price,
      quotePreviousClose: priorOfficialClose.quotePreviousClose,
      quoteAdjustedPreviousClose:
        priorOfficialClose.quoteAdjustedPreviousClose,
      adjustmentFactor: priorOfficialClose.adjustmentFactor,
      adjustmentFactorSource: priorOfficialClose.adjustmentFactorSource,
      adjustedPrice: priorOfficialClose.adjustedPrice,
      source: priorOfficialClose.source,
    },
    adjustedHistoryProvenance,
    openingReference: {
      beginsAt: openingReference.beginsAt,
      price: openingReference.price,
      volume: openingReference.volume,
      interval: openingReference.interval,
      bounds: openingReference.bounds,
      session: openingReference.session,
      source: openingReference.source,
    },
    bars: bars.map((bar) => ({ date: bar.date, adjustedClose: bar.adjustedClose })),
  });
  return createHash("sha256").update(canonicalData).digest("hex");
}

export function parseCoreDipSnapshot(
  raw: unknown,
  now: Date = new Date(),
): CoreDipSnapshot {
  if (Number.isNaN(now.valueOf())) {
    throw new Error("Core-dip snapshot validation clock is invalid");
  }
  assertObjectShape(raw, "Core-dip snapshot", [
    "symbol",
    "fetchedAt",
    "officialClose",
    "bars",
  ]);

  if (raw.symbol !== EXPECTED_SYMBOL) {
    throw new Error("Core-dip snapshot is restricted to SPY");
  }
  const fetchedAt = requireRfc3339(
    raw.fetchedAt,
    "Core-dip snapshot fetchedAt",
  );
  const snapshotAgeMs =
    now.valueOf() - parseSemanticRfc3339(fetchedAt, "Core-dip snapshot fetchedAt");
  if (snapshotAgeMs > MAX_SNAPSHOT_AGE_MS) {
    throw new Error("Core-dip snapshot fetchedAt is stale");
  }
  if (snapshotAgeMs < -MAX_FUTURE_CLOCK_SKEW_MS) {
    throw new Error("Core-dip snapshot fetchedAt is in the future");
  }

  assertObjectShape(raw.officialClose, "Core-dip snapshot officialClose", [
    "date",
    "price",
    "interpolated",
    "source",
  ]);
  const officialDate = requireIsoDate(
    raw.officialClose.date,
    "Core-dip snapshot officialClose date",
  );
  const expectedOfficialDate = losAngelesDate(now);
  if (officialDate !== expectedOfficialDate) {
    throw new Error(
      `Core-dip snapshot official close must match current America/Los_Angeles date ${expectedOfficialDate}`,
    );
  }
  const officialPrice = requirePositivePrice(
    raw.officialClose.price,
    "Core-dip snapshot officialClose price",
  );
  if (typeof raw.officialClose.interpolated !== "boolean") {
    throw new Error("Core-dip snapshot officialClose interpolated must be boolean");
  }
  if (raw.officialClose.interpolated) {
    throw new Error("Core-dip snapshot rejects an interpolated official close");
  }
  if (
    typeof raw.officialClose.source !== "string" ||
    !OFFICIAL_CLOSE_SOURCES.has(
      raw.officialClose.source as CoreDipOfficialCloseSource,
    )
  ) {
    throw new Error("Core-dip snapshot officialClose source is not recognized");
  }

  if (!Array.isArray(raw.bars) || raw.bars.length === 0) {
    throw new Error("Core-dip snapshot bars must be a non-empty array");
  }

  let previousDate: string | undefined;
  const bars: PriceBar[] = [];
  for (const [index, row] of raw.bars.entries()) {
    const context = `Core-dip snapshot bar ${index + 1}`;
    assertObjectShape(row, context, ["date", "adjustedClose"], ["interpolated"]);
    const date = requireIsoDate(row.date, `${context} date`);
    const adjustedClose = requirePositivePrice(
      row.adjustedClose,
      `${context} adjustedClose`,
    );
    if (row.interpolated !== undefined && typeof row.interpolated !== "boolean") {
      throw new Error(`${context} interpolated must be boolean when present`);
    }
    if (row.interpolated === true) {
      throw new Error(`${context} is interpolated`);
    }
    if (previousDate !== undefined && date <= previousDate) {
      throw new Error("Core-dip snapshot bar dates must be unique and strictly increasing");
    }

    bars.push(
      Object.freeze({
        symbol: EXPECTED_SYMBOL,
        date,
        close: adjustedClose,
        adjustedClose,
        isMonthEnd: false,
        isFirstSessionOfMonth: false,
      }),
    );
    previousDate = date;
  }

  const finalBar = bars.at(-1);
  if (
    finalBar === undefined ||
    finalBar.date !== officialDate ||
    finalBar.adjustedClose !== officialPrice
  ) {
    throw new Error(
      "Core-dip snapshot final bar must exactly match the official close date and price",
    );
  }
  assertCompleteNyseSessions(bars, officialDate, "Core-dip snapshot");

  const officialClose = Object.freeze({
    date: officialDate,
    price: officialPrice,
    interpolated: false as const,
    source: raw.officialClose.source as CoreDipOfficialCloseSource,
  });
  const readonlyBars = Object.freeze(bars);

  return Object.freeze({
    symbol: EXPECTED_SYMBOL,
    fetchedAt,
    officialClose,
    bars: readonlyBars,
    dataFingerprint: fingerprintSnapshot(officialClose, readonlyBars),
  });
}

/**
 * Parse the market snapshot used by the 6:35 AM Pacific Tuesday/Friday
 * candidate. This is deliberately a separate schema so the accepted
 * after-close v1 adapter keeps its exact contract.
 */
export function parseCoreDipMorningSnapshot(
  raw: unknown,
  now: Date = new Date(),
): CoreDipMorningSnapshot {
  if (Number.isNaN(now.valueOf())) {
    throw new Error("Core-dip morning snapshot validation clock is invalid");
  }
  assertObjectShape(raw, "Core-dip morning snapshot", [
    "schemaVersion",
    "symbol",
    "reportDate",
    "fetchedAt",
    "priorOfficialClose",
    "adjustedHistoryProvenance",
    "openingReference",
    "bars",
  ]);

  if (raw.schemaVersion !== 2) {
    throw new Error("Core-dip morning snapshot schemaVersion must be 2");
  }
  if (raw.symbol !== EXPECTED_SYMBOL) {
    throw new Error("Core-dip morning snapshot is restricted to SPY");
  }

  const reportDate = requireIsoDate(
    raw.reportDate,
    "Core-dip morning snapshot reportDate",
  );
  const currentLosAngelesDate = losAngelesDate(now);
  if (reportDate !== currentLosAngelesDate) {
    throw new Error(
      `Core-dip morning snapshot reportDate must match current America/Los_Angeles date ${currentLosAngelesDate}`,
    );
  }
  const reportWeekday = new Date(`${reportDate}T00:00:00Z`).getUTCDay();
  if (reportWeekday !== 2 && reportWeekday !== 5) {
    throw new Error("Core-dip morning snapshot reportDate must be Tuesday or Friday");
  }
  if (!isExpectedNyseSession(reportDate, "Core-dip morning snapshot")) {
    throw new Error("Core-dip morning snapshot reportDate must be an NYSE session");
  }

  const fetchedAt = requireRfc3339(
    raw.fetchedAt,
    "Core-dip morning snapshot fetchedAt",
  );
  const fetchedAtMs = parseSemanticRfc3339(
    fetchedAt,
    "Core-dip morning snapshot fetchedAt",
  );
  const snapshotAgeMs = now.valueOf() - fetchedAtMs;
  if (snapshotAgeMs > MAX_MORNING_SNAPSHOT_AGE_MS) {
    throw new Error("Core-dip morning snapshot fetchedAt is stale");
  }
  if (snapshotAgeMs < 0) {
    throw new Error("Core-dip morning snapshot fetchedAt is in the future");
  }
  if (losAngelesDate(new Date(fetchedAtMs)) !== reportDate) {
    throw new Error("Core-dip morning snapshot fetchedAt must be on reportDate in America/Los_Angeles");
  }

  assertObjectShape(
    raw.adjustedHistoryProvenance,
    "Core-dip morning snapshot adjustedHistoryProvenance",
    ["source", "interval", "bounds", "adjustmentType", "sessionAggregation"],
  );
  if (
    raw.adjustedHistoryProvenance.source !==
      MORNING_OPENING_REFERENCE_SOURCE ||
    raw.adjustedHistoryProvenance.interval !== "4hour" ||
    raw.adjustedHistoryProvenance.bounds !== "regular" ||
    raw.adjustedHistoryProvenance.adjustmentType !== "all" ||
    raw.adjustedHistoryProvenance.sessionAggregation !==
      "last-regular-bar-by-session-date"
  ) {
    throw new Error(
      "Core-dip morning snapshot adjustedHistoryProvenance must identify Robinhood 4hour regular all-adjusted bars grouped by session date using the last regular bar",
    );
  }
  const adjustedHistoryProvenance = Object.freeze({
    source: MORNING_OPENING_REFERENCE_SOURCE,
    interval: "4hour" as const,
    bounds: "regular" as const,
    adjustmentType: "all" as const,
    sessionAggregation: "last-regular-bar-by-session-date" as const,
  });

  assertObjectShape(
    raw.priorOfficialClose,
    "Core-dip morning snapshot priorOfficialClose",
    [
      "date",
      "price",
      "quotePreviousClose",
      "quoteAdjustedPreviousClose",
      "adjustmentFactor",
      "adjustmentFactorSource",
      "adjustedPrice",
      "interpolated",
      "source",
    ],
  );
  const priorOfficialDate = requireIsoDate(
    raw.priorOfficialClose.date,
    "Core-dip morning snapshot priorOfficialClose date",
  );
  const expectedPriorSession = previousExpectedNyseSession(
    reportDate,
    "Core-dip morning snapshot",
  );
  if (priorOfficialDate !== expectedPriorSession) {
    throw new Error(
      `Core-dip morning snapshot prior official close must be the immediately prior NYSE session ${expectedPriorSession}`,
    );
  }
  const priorOfficialPrice = requirePositivePrice(
    raw.priorOfficialClose.price,
    "Core-dip morning snapshot priorOfficialClose price",
  );
  const quotePreviousClose = requirePositivePrice(
    raw.priorOfficialClose.quotePreviousClose,
    "Core-dip morning snapshot priorOfficialClose quotePreviousClose",
  );
  const quoteAdjustedPreviousClose = requirePositivePrice(
    raw.priorOfficialClose.quoteAdjustedPreviousClose,
    "Core-dip morning snapshot priorOfficialClose quoteAdjustedPreviousClose",
  );
  const adjustmentFactor = requirePositivePrice(
    raw.priorOfficialClose.adjustmentFactor,
    "Core-dip morning snapshot priorOfficialClose adjustmentFactor",
  );
  if (
    raw.priorOfficialClose.adjustmentFactorSource !==
    MORNING_ADJUSTMENT_FACTOR_SOURCE
  ) {
    throw new Error(
      `Core-dip morning snapshot priorOfficialClose adjustmentFactorSource must be ${MORNING_ADJUSTMENT_FACTOR_SOURCE}`,
    );
  }
  const expectedFactor = quoteAdjustedPreviousClose / quotePreviousClose;
  if (!approximatelyEqual(adjustmentFactor, expectedFactor)) {
    throw new Error(
      "Core-dip morning snapshot priorOfficialClose adjustmentFactor must equal quoteAdjustedPreviousClose / quotePreviousClose",
    );
  }
  const priorAdjustedPrice = requirePositivePrice(
    raw.priorOfficialClose.adjustedPrice,
    "Core-dip morning snapshot priorOfficialClose adjustedPrice",
  );
  const expectedAdjustedPrice = priorOfficialPrice * adjustmentFactor;
  if (!approximatelyEqual(priorAdjustedPrice, expectedAdjustedPrice)) {
    throw new Error(
      "Core-dip morning snapshot priorOfficialClose adjustedPrice must equal official price times adjustmentFactor",
    );
  }
  if (raw.priorOfficialClose.interpolated !== false) {
    throw new Error("Core-dip morning snapshot rejects an interpolated prior official close");
  }
  if (
    typeof raw.priorOfficialClose.source !== "string" ||
    !OFFICIAL_CLOSE_SOURCES.has(
      raw.priorOfficialClose.source as CoreDipOfficialCloseSource,
    )
  ) {
    throw new Error("Core-dip morning snapshot priorOfficialClose source is not recognized");
  }

  assertObjectShape(
    raw.openingReference,
    "Core-dip morning snapshot openingReference",
    [
      "beginsAt",
      "price",
      "volume",
      "interval",
      "bounds",
      "session",
      "interpolated",
      "source",
    ],
  );
  const beginsAt = requireRfc3339(
    raw.openingReference.beginsAt,
    "Core-dip morning snapshot openingReference beginsAt",
  );
  const beginsAtMs = parseSemanticRfc3339(
    beginsAt,
    "Core-dip morning snapshot openingReference beginsAt",
  );
  const beginsAgeMs = now.valueOf() - beginsAtMs;
  if (beginsAgeMs > MAX_MORNING_SNAPSHOT_AGE_MS) {
    throw new Error("Core-dip morning snapshot openingReference beginsAt is stale");
  }
  if (beginsAgeMs < 0) {
    throw new Error("Core-dip morning snapshot openingReference beginsAt is in the future");
  }
  if (beginsAgeMs < 60_000) {
    throw new Error("Core-dip morning snapshot openingReference minute bar is not complete");
  }
  const beginsLosAngeles = losAngelesDateTimeParts(new Date(beginsAtMs));
  if (
    beginsLosAngeles.date !== reportDate ||
    beginsLosAngeles.hour !== "06" ||
    beginsLosAngeles.minute !== "30" ||
    beginsLosAngeles.second !== "00" ||
    new Date(beginsAtMs).getUTCMilliseconds() !== 0
  ) {
    throw new Error(
      "Core-dip morning snapshot openingReference beginsAt must be exactly 6:30:00.000 AM America/Los_Angeles on reportDate",
    );
  }
  if (beginsAtMs > fetchedAtMs) {
    throw new Error("Core-dip morning snapshot openingReference cannot begin after fetchedAt");
  }
  if (fetchedAtMs < beginsAtMs + 60_000) {
    throw new Error(
      "Core-dip morning snapshot fetchedAt must be at least one minute after openingReference beginsAt",
    );
  }
  const openingPrice = requirePositivePrice(
    raw.openingReference.price,
    "Core-dip morning snapshot openingReference price",
  );
  const openingVolume = requirePositivePrice(
    raw.openingReference.volume,
    "Core-dip morning snapshot openingReference volume",
  );
  if (raw.openingReference.interval !== "minute") {
    throw new Error("Core-dip morning snapshot openingReference interval must be minute");
  }
  if (raw.openingReference.bounds !== "regular") {
    throw new Error("Core-dip morning snapshot openingReference bounds must be regular");
  }
  if (raw.openingReference.session !== "reg") {
    throw new Error("Core-dip morning snapshot openingReference session must be reg");
  }
  if (raw.openingReference.interpolated !== false) {
    throw new Error("Core-dip morning snapshot rejects an interpolated openingReference");
  }
  if (raw.openingReference.source !== MORNING_OPENING_REFERENCE_SOURCE) {
    throw new Error(
      `Core-dip morning snapshot openingReference source must be ${MORNING_OPENING_REFERENCE_SOURCE}`,
    );
  }

  if (!Array.isArray(raw.bars) || raw.bars.length === 0) {
    throw new Error("Core-dip morning snapshot bars must be a non-empty array");
  }
  let previousDate: string | undefined;
  const bars: PriceBar[] = [];
  for (const [index, row] of raw.bars.entries()) {
    const context = `Core-dip morning snapshot bar ${index + 1}`;
    assertObjectShape(row, context, ["date", "adjustedClose", "interpolated"]);
    const date = requireIsoDate(row.date, `${context} date`);
    const adjustedClose = requirePositivePrice(
      row.adjustedClose,
      `${context} adjustedClose`,
    );
    if (row.interpolated !== false) {
      throw new Error(`${context} must explicitly be non-interpolated`);
    }
    if (previousDate !== undefined && date <= previousDate) {
      throw new Error(
        "Core-dip morning snapshot bar dates must be unique and strictly increasing",
      );
    }
    bars.push(
      Object.freeze({
        symbol: EXPECTED_SYMBOL,
        date,
        close: adjustedClose,
        adjustedClose,
        isMonthEnd: false,
        isFirstSessionOfMonth: false,
      }),
    );
    previousDate = date;
  }

  const finalBar = bars.at(-1);
  if (
    finalBar === undefined ||
    finalBar.date !== priorOfficialDate ||
    finalBar.adjustedClose !== priorAdjustedPrice
  ) {
    throw new Error(
      "Core-dip morning snapshot final bar must exactly match the prior official close date and adjustedPrice",
    );
  }
  assertCompleteNyseSessions(
    bars,
    priorOfficialDate,
    "Core-dip morning snapshot",
  );

  const priorOfficialClose = Object.freeze({
    date: priorOfficialDate,
    price: priorOfficialPrice,
    quotePreviousClose,
    quoteAdjustedPreviousClose,
    adjustmentFactor,
    adjustmentFactorSource: MORNING_ADJUSTMENT_FACTOR_SOURCE,
    adjustedPrice: priorAdjustedPrice,
    interpolated: false as const,
    source: raw.priorOfficialClose.source as CoreDipOfficialCloseSource,
  });
  const openingReference = Object.freeze({
    beginsAt,
    price: openingPrice,
    volume: openingVolume,
    interval: "minute" as const,
    bounds: "regular" as const,
    session: "reg" as const,
    interpolated: false as const,
    source: MORNING_OPENING_REFERENCE_SOURCE,
  });
  const readonlyBars = Object.freeze(bars);

  return Object.freeze({
    schemaVersion: 2 as const,
    symbol: EXPECTED_SYMBOL,
    reportDate,
    fetchedAt,
    priorOfficialClose,
    adjustedHistoryProvenance,
    openingReference,
    bars: readonlyBars,
    dataFingerprint: fingerprintMorningSnapshot(
      reportDate,
      priorOfficialClose,
      adjustedHistoryProvenance,
      openingReference,
      readonlyBars,
    ),
  });
}
