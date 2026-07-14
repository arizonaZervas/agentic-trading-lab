import assert from "node:assert/strict";
import test from "node:test";

import { parseCoreDipMorningSnapshot } from "../src/adapters/core-dip-snapshot.ts";
import {
  createCoreDipMorningShadowReport,
  createCoreDipShadowReport,
} from "../src/domain/core-dip-report.ts";
import { parseCoreDipConfig } from "../src/domain/core-dip.ts";
import type { PriceBar } from "../src/domain/model.ts";

const CLOSURES = new Set([
  "2026-01-19",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
]);

function marketDates(first: string, last: string): string[] {
  const dates: string[] = [];
  for (
    let current = new Date(`${first}T00:00:00Z`);
    current.toISOString().slice(0, 10) <= last;
    current = new Date(current.valueOf() + 24 * 60 * 60 * 1_000)
  ) {
    const date = current.toISOString().slice(0, 10);
    const weekday = current.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !CLOSURES.has(date)) {
      dates.push(date);
    }
  }
  return dates;
}

function config() {
  return parseCoreDipConfig({
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
  });
}

function rawMorningSnapshot(
  reportDate: string,
  priorDate: string,
  options: {
    firstDate?: string;
    fetchedAt?: string;
    beginsAt?: string;
    openingPrice?: number;
    rawPriorPrice?: number;
    closes?: Readonly<Record<string, number>>;
  } = {},
): Record<string, unknown> {
  const firstDate = options.firstDate ?? "2026-06-01";
  const closes = options.closes ?? {};
  const bars = marketDates(firstDate, priorDate).map((date) => ({
    date,
    adjustedClose: closes[date] ?? 100,
    interpolated: false,
  }));
  const priorPrice = closes[priorDate] ?? 100;
  const rawPriorPrice = options.rawPriorPrice ?? priorPrice;
  const adjustmentFactor = priorPrice / rawPriorPrice;
  return {
    schemaVersion: 2,
    symbol: "SPY",
    reportDate,
    fetchedAt: options.fetchedAt ?? `${reportDate}T13:35:00Z`,
    priorOfficialClose: {
      date: priorDate,
      price: rawPriorPrice,
      quotePreviousClose: 100,
      quoteAdjustedPreviousClose: 100 * adjustmentFactor,
      adjustmentFactor,
      adjustmentFactorSource: "robinhood-quote-corporate-action-factor",
      adjustedPrice: priorPrice,
      interpolated: false,
      source: "sip-list-exchange-close",
    },
    adjustedHistoryProvenance: {
      source: "robinhood-equity-historicals",
      interval: "4hour",
      bounds: "regular",
      adjustmentType: "all",
      sessionAggregation: "last-regular-bar-by-session-date",
    },
    openingReference: {
      beginsAt: options.beginsAt ?? `${reportDate}T13:30:00Z`,
      price: options.openingPrice ?? 101,
      volume: 1_000,
      interval: "minute",
      bounds: "regular",
      session: "reg",
      interpolated: false,
      source: "robinhood-equity-historicals",
    },
    bars,
  };
}

function parseMorning(
  raw: unknown,
  now = new Date("2026-07-14T13:36:00Z"),
) {
  return parseCoreDipMorningSnapshot(raw, now);
}

test("schema v2 binds Tuesday to Monday and Friday to Thursday", () => {
  const tuesday = parseMorning(
    rawMorningSnapshot("2026-07-14", "2026-07-13"),
  );
  assert.equal(tuesday.reportDate, "2026-07-14");
  assert.equal(tuesday.priorOfficialClose.date, "2026-07-13");
  assert.equal(tuesday.bars.at(-1)?.date, "2026-07-13");
  assert.equal(
    tuesday.openingReference.source,
    "robinhood-equity-historicals",
  );

  const friday = parseMorning(
    rawMorningSnapshot("2026-07-17", "2026-07-16", {
      fetchedAt: "2026-07-17T13:35:00Z",
      beginsAt: "2026-07-17T13:30:00Z",
    }),
    new Date("2026-07-17T13:36:00Z"),
  );
  assert.equal(friday.priorOfficialClose.date, "2026-07-16");
  assert.equal(friday.openingReference.session, "reg");
});

test("schema v2 resolves the prior session across a market holiday", () => {
  const afterLaborDay = parseMorning(
    rawMorningSnapshot("2026-09-08", "2026-09-04", {
      firstDate: "2026-08-03",
      fetchedAt: "2026-09-08T13:35:00Z",
      beginsAt: "2026-09-08T13:30:00Z",
    }),
    new Date("2026-09-08T13:36:00Z"),
  );
  assert.equal(afterLaborDay.priorOfficialClose.date, "2026-09-04");
  assert.equal(afterLaborDay.bars.some((bar) => bar.date === "2026-09-07"), false);

  const afterFridayClosure = parseMorning(
    rawMorningSnapshot("2026-07-07", "2026-07-06", {
      fetchedAt: "2026-07-07T13:35:00Z",
      beginsAt: "2026-07-07T13:30:00Z",
    }),
    new Date("2026-07-07T13:36:00Z"),
  );
  const replay = createCoreDipMorningShadowReport(
    afterFridayClosure.bars,
    config(),
    afterFridayClosure.reportDate,
    "2026-06-30",
    afterFridayClosure.openingReference,
    new Date("2026-07-07T13:36:00Z"),
  );
  assert.equal(replay.signalDate, "2026-07-06");
  assert.equal(replay.replayedEvaluationCount, 2);
  assert.equal(
    afterFridayClosure.bars.some((bar) => bar.date === "2026-07-03"),
    false,
  );
});

test("morning snapshot fails closed on stale, pre-open, interpolated, mismatched, or incomplete data", () => {
  assert.throws(
    () =>
      parseMorning(
        rawMorningSnapshot("2026-07-14", "2026-07-13", {
          fetchedAt: "2026-07-14T13:15:00Z",
        }),
      ),
    /fetchedAt is stale/,
  );
  assert.throws(
    () =>
      parseMorning(
        rawMorningSnapshot("2026-07-14", "2026-07-13", {
          fetchedAt: "2026-07-14T13:36:01Z",
        }),
      ),
    /fetchedAt is in the future/,
  );
  assert.throws(
    () =>
      parseMorning(
        rawMorningSnapshot("2026-07-14", "2026-07-13", {
          fetchedAt: "2026-07-14T13:29:00Z",
          beginsAt: "2026-07-14T13:30:00Z",
        }),
        new Date("2026-07-14T13:29:30Z"),
      ),
    /beginsAt is in the future/,
  );
  assert.throws(
    () =>
      parseMorning(
        rawMorningSnapshot("2026-07-14", "2026-07-13", {
          fetchedAt: "2026-07-14T13:30:30Z",
          beginsAt: "2026-07-14T13:30:00Z",
        }),
        new Date("2026-07-14T13:30:30Z"),
      ),
    /minute bar is not complete/,
  );
  assert.throws(
    () =>
      parseMorning(
        rawMorningSnapshot("2026-07-14", "2026-07-13", {
          fetchedAt: "2026-07-14T13:45:00Z",
        }),
        new Date("2026-07-14T13:46:01Z"),
      ),
    /beginsAt is stale/,
  );
  assert.throws(
    () =>
      parseMorning(
        rawMorningSnapshot("2026-07-14", "2026-07-13", {
          beginsAt: "2026-07-14T13:29:00Z",
        }),
      ),
    /exactly 6:30:00\.000 AM/,
  );
  assert.throws(
    () =>
      parseMorning(
        rawMorningSnapshot("2026-07-14", "2026-07-13", {
          beginsAt: "2026-07-14T13:30:01Z",
        }),
      ),
    /exactly 6:30:00\.000 AM/,
  );

  const interpolated = rawMorningSnapshot("2026-07-14", "2026-07-13");
  (interpolated.openingReference as Record<string, unknown>).interpolated = true;
  assert.throws(() => parseMorning(interpolated), /interpolated openingReference/);

  const mismatched = rawMorningSnapshot("2026-07-14", "2026-07-13");
  (mismatched.priorOfficialClose as Record<string, unknown>).date = "2026-07-10";
  assert.throws(() => parseMorning(mismatched), /immediately prior NYSE session/);

  const incomplete = rawMorningSnapshot("2026-07-14", "2026-07-13");
  const incompleteBars = incomplete.bars as Array<Record<string, unknown>>;
  incompleteBars.splice(5, 1);
  assert.throws(() => parseMorning(incomplete), /missing expected market session/);

  const wrongSource = rawMorningSnapshot("2026-07-14", "2026-07-13");
  (wrongSource.openingReference as Record<string, unknown>).source = "sip-close";
  assert.throws(
    () => parseMorning(wrongSource),
    /source must be robinhood-equity-historicals/,
  );

  const wrongInterval = rawMorningSnapshot("2026-07-14", "2026-07-13");
  (wrongInterval.openingReference as Record<string, unknown>).interval = "5minute";
  assert.throws(() => parseMorning(wrongInterval), /interval must be minute/);

  const dailyAdjustedHistory = rawMorningSnapshot(
    "2026-07-14",
    "2026-07-13",
  );
  (
    dailyAdjustedHistory.adjustedHistoryProvenance as Record<string, unknown>
  ).interval = "day";
  assert.throws(
    () => parseMorning(dailyAdjustedHistory),
    /4hour regular all-adjusted bars/,
  );

  const wrongAdjustedSource = rawMorningSnapshot(
    "2026-07-14",
    "2026-07-13",
  );
  (
    wrongAdjustedSource.priorOfficialClose as Record<string, unknown>
  ).adjustmentFactorSource = "unverified-adjustment";
  assert.throws(
    () => parseMorning(wrongAdjustedSource),
    /adjustmentFactorSource must be robinhood-quote-corporate-action-factor/,
  );

  const inconsistentFactor = rawMorningSnapshot(
    "2026-07-14",
    "2026-07-13",
  );
  (
    inconsistentFactor.priorOfficialClose as Record<string, unknown>
  ).adjustmentFactor = 1.01;
  assert.throws(
    () => parseMorning(inconsistentFactor),
    /adjustmentFactor must equal quoteAdjustedPreviousClose \/ quotePreviousClose/,
  );

  const inconsistentAdjustedPrice = rawMorningSnapshot(
    "2026-07-14",
    "2026-07-13",
  );
  (
    inconsistentAdjustedPrice.priorOfficialClose as Record<string, unknown>
  ).adjustedPrice = 99;
  assert.throws(
    () => parseMorning(inconsistentAdjustedPrice),
    /adjustedPrice must equal official price times adjustmentFactor/,
  );

  assert.throws(
    () =>
      parseMorning(
        rawMorningSnapshot("2026-07-14", "2026-07-13", {
          beginsAt: "2026-04-31T13:30:00Z",
        }),
      ),
    /semantically valid RFC3339/,
  );
  assert.throws(
    () =>
      parseMorning(
        rawMorningSnapshot("2026-07-14", "2026-07-13", {
          beginsAt: "2026-07-14T13:30:00.0009Z",
        }),
      ),
    /nonzero sub-millisecond precision/,
  );
  assert.throws(
    () =>
      parseMorning(
        rawMorningSnapshot("2026-07-14", "2026-07-13", {
          fetchedAt: "2026-04-31T13:35:00Z",
        }),
      ),
    /semantically valid RFC3339/,
  );

  assert.throws(
    () =>
      parseMorning(
        rawMorningSnapshot("2026-07-14", "2026-07-13"),
        new Date("2026-07-15T13:36:00Z"),
      ),
    /reportDate must match current America\/Los_Angeles date 2026-07-15/,
  );
});

test("opening proof accepts exact 6:30 in both PDT and PST", () => {
  const pdt = parseMorning(
    rawMorningSnapshot("2026-07-14", "2026-07-13", {
      beginsAt: "2026-07-14T06:30:00.000-07:00",
    }),
  );
  assert.equal(
    pdt.openingReference.beginsAt,
    "2026-07-14T06:30:00.000-07:00",
  );

  const pst = parseMorning(
    rawMorningSnapshot("2026-01-20", "2026-01-16", {
      firstDate: "2026-01-02",
      fetchedAt: "2026-01-20T14:35:00Z",
      beginsAt: "2026-01-20T06:30:00.000-08:00",
    }),
    new Date("2026-01-20T14:36:00Z"),
  );
  assert.equal(
    pst.openingReference.beginsAt,
    "2026-01-20T06:30:00.000-08:00",
  );
  assert.equal(pst.priorOfficialClose.date, "2026-01-16");
});

test("direct morning domain calls reject stale time and malformed bar provenance", () => {
  const snapshot = parseMorning(
    rawMorningSnapshot("2026-07-14", "2026-07-13"),
  );
  assert.throws(
    () =>
      createCoreDipMorningShadowReport(
        snapshot.bars,
        config(),
        snapshot.reportDate,
        "2026-07-14",
        { ...snapshot.openingReference, beginsAt: "2000-01-04T14:30:00Z" },
        new Date("2026-07-14T13:36:00Z"),
      ),
    /validated regular-session opening print/,
  );
  assert.throws(
    () =>
      createCoreDipMorningShadowReport(
        snapshot.bars,
        config(),
        snapshot.reportDate,
        "2026-07-14",
        {
          ...snapshot.openingReference,
          interval: "hour",
        } as unknown as typeof snapshot.openingReference,
        new Date("2026-07-14T13:36:00Z"),
      ),
    /validated regular-session opening print/,
  );
  assert.throws(
    () =>
      createCoreDipMorningShadowReport(
        snapshot.bars,
        config(),
        snapshot.reportDate,
        "2026-07-14",
        {
          ...snapshot.openingReference,
          beginsAt: "2026-04-31T13:30:00Z",
        },
        new Date("2026-07-14T13:36:00Z"),
      ),
    /semantically valid RFC3339/,
  );
  assert.throws(
    () =>
      createCoreDipMorningShadowReport(
        snapshot.bars,
        config(),
        snapshot.reportDate,
        "2026-07-14",
        {
          ...snapshot.openingReference,
          beginsAt: "2026-07-14T13:30:00.0009Z",
        },
        new Date("2026-07-14T13:36:00Z"),
      ),
    /nonzero sub-millisecond precision/,
  );
});

test("direct morning domain calls require the prior and every interior NYSE session", () => {
  const snapshot = parseMorning(
    rawMorningSnapshot("2026-07-14", "2026-07-13"),
  );
  assert.throws(
    () =>
      createCoreDipMorningShadowReport(
        snapshot.bars.slice(0, -1),
        config(),
        snapshot.reportDate,
        "2026-07-14",
        snapshot.openingReference,
        new Date("2026-07-14T13:36:00Z"),
      ),
    /must end at the immediately prior expected NYSE session 2026-07-13/,
  );

  const missingInterior = snapshot.bars.filter((_, index) => index !== 5);
  assert.throws(
    () =>
      createCoreDipMorningShadowReport(
        missingInterior,
        config(),
        snapshot.reportDate,
        "2026-07-14",
        snapshot.openingReference,
        new Date("2026-07-14T13:36:00Z"),
      ),
    /missing expected market session/,
  );
});

test("direct morning domain calls reject weekends, full-day closures, and unsupported years", () => {
  const snapshot = parseMorning(
    rawMorningSnapshot("2026-07-14", "2026-07-13"),
  );
  assert.throws(
    () =>
      createCoreDipMorningShadowReport(
        snapshot.bars,
        config(),
        "2026-07-18",
        "2026-07-14",
        {
          ...snapshot.openingReference,
          beginsAt: "2026-07-18T13:30:00Z",
        },
        new Date("2026-07-18T13:36:00Z"),
      ),
    /reportDate must be an expected NYSE session/,
  );
  assert.throws(
    () =>
      createCoreDipMorningShadowReport(
        snapshot.bars,
        config(),
        "2028-07-04",
        "2028-07-04",
        {
          ...snapshot.openingReference,
          beginsAt: "2028-07-04T13:30:00Z",
        },
        new Date("2028-07-04T13:36:00Z"),
      ),
    /reportDate must be an expected NYSE session/,
  );
  assert.throws(
    () =>
      createCoreDipMorningShadowReport(
        snapshot.bars,
        config(),
        "2029-01-02",
        "2029-01-02",
        {
          ...snapshot.openingReference,
          beginsAt: "2029-01-02T14:30:00Z",
        },
        new Date("2029-01-02T14:36:00Z"),
      ),
    /market calendar does not support year 2029/,
  );
});

test("raw SIP close remains separate while the signal uses adjusted prior close", () => {
  const snapshot = parseMorning(
    rawMorningSnapshot("2026-07-14", "2026-07-13", {
      rawPriorPrice: 103,
      closes: { "2026-07-13": 98 },
    }),
  );
  assert.equal(snapshot.priorOfficialClose.price, 103);
  assert.equal(snapshot.priorOfficialClose.adjustedPrice, 98);
  assert.equal(
    snapshot.priorOfficialClose.adjustmentFactorSource,
    "robinhood-quote-corporate-action-factor",
  );
  assert.notEqual(snapshot.priorOfficialClose.adjustmentFactor, 1);
  assert.ok(
    Math.abs(
      snapshot.priorOfficialClose.adjustmentFactor -
        snapshot.priorOfficialClose.quoteAdjustedPreviousClose /
          snapshot.priorOfficialClose.quotePreviousClose,
    ) < 1e-12,
  );
  assert.ok(
    Math.abs(
      snapshot.priorOfficialClose.adjustedPrice -
        snapshot.priorOfficialClose.price *
          snapshot.priorOfficialClose.adjustmentFactor,
    ) < 1e-9,
  );
  assert.equal(snapshot.bars.at(-1)?.adjustedClose, 98);

  const report = createCoreDipMorningShadowReport(
    snapshot.bars,
    config(),
    snapshot.reportDate,
    "2026-07-14",
    snapshot.openingReference,
    new Date("2026-07-14T13:36:00Z"),
  );
  assert.equal(report.observation.adjustedClose, 98);
  assert.equal(report.observation.rollingHighAdjustedClose, 100);
  assert.deepEqual(report.observation.newlyTriggeredTiersPct, [2]);
});

test("morning signal uses only the prior close; opening changes are reference-only and keys stay stable", () => {
  const closes = { "2026-07-13": 98 };
  const first = parseMorning(
    rawMorningSnapshot("2026-07-14", "2026-07-13", {
      openingPrice: 99,
      closes,
    }),
  );
  const second = parseMorning(
    rawMorningSnapshot("2026-07-14", "2026-07-13", {
      openingPrice: 125,
      closes,
    }),
  );
  const firstReport = createCoreDipMorningShadowReport(
    first.bars,
    config(),
    first.reportDate,
    "2026-07-14",
    first.openingReference,
    new Date("2026-07-14T13:36:00Z"),
  );
  const secondReport = createCoreDipMorningShadowReport(
    second.bars,
    config(),
    second.reportDate,
    "2026-07-14",
    second.openingReference,
    new Date("2026-07-14T13:36:00Z"),
  );

  assert.equal(firstReport.candidate, "SPY_CORE_PLUS_DIP_MORNING_V1");
  assert.equal(firstReport.signalDate, "2026-07-13");
  assert.equal(firstReport.observation.adjustedClose, 98);
  assert.equal(firstReport.observation.rollingHighAdjustedClose, 100);
  assert.deepEqual(firstReport.observation.newlyTriggeredTiersPct, [2]);
  assert.deepEqual(
    firstReport.shadowOrders.map((order) => order.proposalKey),
    secondReport.shadowOrders.map((order) => order.proposalKey),
  );
  assert.equal(firstReport.runKey, secondReport.runKey);
  assert.equal(firstReport.openingReference.price, 99);
  assert.equal(secondReport.openingReference.price, 125);
  for (const order of firstReport.shadowOrders) {
    assert.equal(order.executionStatus, "NOT_SUBMITTED");
    assert.equal(order.actualFillPrice, null);
    assert.equal(order.requiresLaterExactHumanApproval, true);
  }
  assert.equal(firstReport.safety.brokerOrdersCreated, false);
  assert.equal(firstReport.safety.actualFillKnown, false);
  assert.match(firstReport.safety.statement, /not a promised fill/i);
});

test("replay consumes prior morning signals deterministically without current-session lookahead", () => {
  const snapshot = parseMorning(
    rawMorningSnapshot("2026-07-17", "2026-07-16", {
      fetchedAt: "2026-07-17T13:35:00Z",
      beginsAt: "2026-07-17T13:30:00Z",
      closes: { "2026-07-13": 98, "2026-07-16": 95 },
    }),
    new Date("2026-07-17T13:36:00Z"),
  );
  const report = createCoreDipMorningShadowReport(
    snapshot.bars,
    config(),
    snapshot.reportDate,
    "2026-07-14",
    snapshot.openingReference,
    new Date("2026-07-17T13:36:00Z"),
  );
  const repeated = createCoreDipMorningShadowReport(
    snapshot.bars,
    config(),
    snapshot.reportDate,
    "2026-07-14",
    snapshot.openingReference,
    new Date("2026-07-17T13:36:00Z"),
  );

  assert.deepEqual(report, repeated);
  assert.equal(report.replayedEvaluationCount, 2);
  assert.equal(report.signalDate, "2026-07-16");
  assert.deepEqual(report.observation.previouslyUsedTiersPct, [2]);
  assert.deepEqual(report.observation.newlyTriggeredTiersPct, [5]);

  const currentSessionBar: PriceBar = {
    symbol: "SPY",
    date: "2026-07-17",
    close: 1_000,
    adjustedClose: 1_000,
    isMonthEnd: false,
    isFirstSessionOfMonth: false,
  };
  assert.throws(
    () =>
      createCoreDipMorningShadowReport(
        [...snapshot.bars, currentSessionBar],
        config(),
        snapshot.reportDate,
        "2026-07-14",
        snapshot.openingReference,
        new Date("2026-07-17T13:36:00Z"),
      ),
    /no current-session or future bar/,
  );
});

test("the accepted close-evaluation v1 API remains unchanged", () => {
  const snapshot = parseMorning(
    rawMorningSnapshot("2026-07-17", "2026-07-16", {
      fetchedAt: "2026-07-17T13:35:00Z",
      beginsAt: "2026-07-17T13:30:00Z",
    }),
    new Date("2026-07-17T13:36:00Z"),
  );
  const v1Bars = snapshot.bars.filter((bar) => bar.date <= "2026-07-14");
  const v1 = createCoreDipShadowReport(
    v1Bars,
    config(),
    "2026-07-14",
    "2026-07-14",
  );
  assert.equal(v1.candidate, "SPY_CORE_PLUS_DIP_V1");
  assert.equal(v1.asOfDate, "2026-07-14");
  assert.equal(v1.shadowOrders[0]?.hypotheticalExecution, "NEXT_OBSERVED_SESSION_OPEN");
});
