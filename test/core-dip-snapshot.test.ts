import assert from "node:assert/strict";
import test from "node:test";

import { parseCoreDipSnapshot } from "../src/adapters/core-dip-snapshot.ts";

const VALIDATION_NOW = new Date("2026-07-15T20:45:00Z");

function parseSnapshot(raw: unknown, now = VALIDATION_NOW) {
  return parseCoreDipSnapshot(raw, now);
}

function validSnapshot(): Record<string, unknown> {
  return {
    symbol: "SPY",
    fetchedAt: "2026-07-15T20:31:04.123Z",
    officialClose: {
      date: "2026-07-15",
      price: 101.5,
      interpolated: false,
      source: "sip-list-exchange-close",
    },
    bars: [
      { date: "2026-07-13", adjustedClose: 100 },
      { date: "2026-07-14", adjustedClose: 101, interpolated: false },
      { date: "2026-07-15", adjustedClose: 101.5 },
    ],
  };
}

test("validates provenance and creates immutable SPY price bars for the shadow report", () => {
  const result = parseSnapshot(validSnapshot());

  assert.equal(result.symbol, "SPY");
  assert.equal(result.officialClose.source, "sip-list-exchange-close");
  assert.deepEqual(result.bars, [
    {
      symbol: "SPY",
      date: "2026-07-13",
      close: 100,
      adjustedClose: 100,
      isMonthEnd: false,
      isFirstSessionOfMonth: false,
    },
    {
      symbol: "SPY",
      date: "2026-07-14",
      close: 101,
      adjustedClose: 101,
      isMonthEnd: false,
      isFirstSessionOfMonth: false,
    },
    {
      symbol: "SPY",
      date: "2026-07-15",
      close: 101.5,
      adjustedClose: 101.5,
      isMonthEnd: false,
      isFirstSessionOfMonth: false,
    },
  ]);
  assert.match(result.dataFingerprint, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.bars));
  assert.ok(Object.isFrozen(result.bars[0]));
});

test("fails closed on malformed shape, provenance, timestamps, dates, and prices", () => {
  assert.throws(() => parseSnapshot(null), /must be an object/);
  assert.throws(
    () => parseSnapshot({ ...validSnapshot(), unexpected: true }),
    /unexpected unexpected field/,
  );
  assert.throws(
    () => parseSnapshot({ ...validSnapshot(), symbol: "QQQ" }),
    /restricted to SPY/,
  );
  assert.throws(
    () => parseSnapshot({ ...validSnapshot(), fetchedAt: "2026-07-15" }),
    /RFC3339/,
  );
  assert.throws(
    () =>
      parseSnapshot({
        ...validSnapshot(),
        bars: [{ date: "2026-07-15", adjustedClose: Number.NaN }],
      }),
    /finite positive number/,
  );
  assert.throws(
    () =>
      parseSnapshot({
        ...validSnapshot(),
        bars: [
          { date: "2026-07-15", adjustedClose: 101.5 },
          { date: "2026-07-14", adjustedClose: 101 },
        ],
      }),
    /strictly increasing/,
  );
  assert.throws(
    () =>
      parseSnapshot({
        ...validSnapshot(),
        bars: [
          { date: "2026-07-15", adjustedClose: 101.5 },
          { date: "2026-07-15", adjustedClose: 101.5 },
        ],
      }),
    /unique and strictly increasing/,
  );
});

test("rejects interpolated historical and official close data", () => {
  const historical = validSnapshot();
  historical.bars = [
    { date: "2026-07-14", adjustedClose: 101, interpolated: true },
    { date: "2026-07-15", adjustedClose: 101.5 },
  ];
  assert.throws(() => parseSnapshot(historical), /bar 1 is interpolated/);

  const official = validSnapshot();
  official.officialClose = {
    date: "2026-07-15",
    price: 101.5,
    interpolated: true,
    source: "sip-list-exchange-close",
  };
  assert.throws(() => parseSnapshot(official), /interpolated official close/);
});

test("rejects a stale or price-mismatched final historical bar", () => {
  const stale = validSnapshot();
  stale.bars = [{ date: "2026-07-14", adjustedClose: 101 }];
  assert.throws(() => parseSnapshot(stale), /exactly match the official close/);

  const mismatchedPrice = validSnapshot();
  mismatchedPrice.bars = [{ date: "2026-07-15", adjustedClose: 101.49 }];
  assert.throws(
    () => parseSnapshot(mismatchedPrice),
    /exactly match the official close/,
  );
});

test("fingerprint is semantic and changes when market data or dates change", () => {
  const first = parseSnapshot(validSnapshot());
  const reFetched = validSnapshot();
  reFetched.fetchedAt = "2026-07-15T13:35:00-07:00";
  const second = parseSnapshot(reFetched);
  assert.equal(first.dataFingerprint, second.dataFingerprint);

  const changedData = validSnapshot();
  changedData.bars = [
    { date: "2026-07-13", adjustedClose: 99.99 },
    { date: "2026-07-14", adjustedClose: 101 },
    { date: "2026-07-15", adjustedClose: 101.5 },
  ];
  assert.notEqual(
    first.dataFingerprint,
    parseSnapshot(changedData).dataFingerprint,
  );

  const changedDate = validSnapshot();
  changedDate.officialClose = {
    date: "2026-07-16",
    price: 101.5,
    interpolated: false,
    source: "sip-list-exchange-close",
  };
  changedDate.fetchedAt = "2026-07-16T20:35:00Z";
  changedDate.bars = [
    { date: "2026-07-14", adjustedClose: 100 },
    { date: "2026-07-15", adjustedClose: 101 },
    { date: "2026-07-16", adjustedClose: 101.5 },
  ];
  assert.notEqual(
    first.dataFingerprint,
    parseSnapshot(changedDate, new Date("2026-07-16T20:45:00Z")).dataFingerprint,
  );
});

test("rejects stale retrievals, unrecognized provenance, and incomplete sessions", () => {
  assert.throws(
    () =>
      parseSnapshot({
        ...validSnapshot(),
        fetchedAt: "2026-07-15T18:00:00Z",
      }),
    /fetchedAt is stale/,
  );
  const badSource = validSnapshot();
  badSource.officialClose = {
    date: "2026-07-15",
    price: 101.5,
    interpolated: false,
    source: "synthetic-or-unverified",
  };
  assert.throws(() => parseSnapshot(badSource), /source is not recognized/);

  const missingTuesday = validSnapshot();
  missingTuesday.bars = [
    { date: "2026-07-13", adjustedClose: 100 },
    { date: "2026-07-15", adjustedClose: 101.5 },
  ];
  assert.throws(
    () => parseSnapshot(missingTuesday),
    /missing expected market session 2026-07-14/,
  );

  const weekend = validSnapshot();
  weekend.bars = [
    { date: "2026-07-12", adjustedClose: 99 },
    ...((validSnapshot().bars as Array<Record<string, unknown>>) ?? []),
  ];
  assert.throws(() => parseSnapshot(weekend), /non-session date 2026-07-12/);

  const independenceDayClosure = {
    symbol: "SPY",
    fetchedAt: "2026-07-06T20:35:00Z",
    officialClose: {
      date: "2026-07-06",
      price: 102,
      interpolated: false,
      source: "sip-list-exchange-close",
    },
    bars: [
      { date: "2026-07-02", adjustedClose: 100 },
      { date: "2026-07-06", adjustedClose: 102 },
    ],
  };
  assert.equal(
    parseSnapshot(
      independenceDayClosure,
      new Date("2026-07-06T20:45:00Z"),
    ).bars.length,
    2,
  );
});
