interface DatedSession {
  readonly date: string;
}

const SUPPORTED_MARKET_CALENDAR_YEARS = new Set(["2026", "2027", "2028"]);

// Full-day closures from https://www.nyse.com/trade/hours-calendars.
// Early-close dates remain sessions because the strategies use daily closes.
const FULL_DAY_MARKET_CLOSURES = new Set([
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-06-18",
  "2027-07-05",
  "2027-09-06",
  "2027-11-25",
  "2027-12-24",
  "2028-01-17",
  "2028-02-21",
  "2028-04-14",
  "2028-05-29",
  "2028-06-19",
  "2028-07-04",
  "2028-09-04",
  "2028-11-23",
  "2028-12-25",
]);

function nextIsoDate(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export function isExpectedNyseSession(
  date: string,
  context = "NYSE",
): boolean {
  const year = date.slice(0, 4);
  if (!SUPPORTED_MARKET_CALENDAR_YEARS.has(year)) {
    throw new Error(`${context} market calendar does not support year ${year}`);
  }
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !FULL_DAY_MARKET_CLOSURES.has(date);
}

export function previousExpectedNyseSession(
  reportDate: string,
  context = "NYSE",
): string {
  const date = new Date(`${reportDate}T00:00:00Z`);
  for (let attempts = 0; attempts < 10; attempts += 1) {
    date.setUTCDate(date.getUTCDate() - 1);
    const candidate = date.toISOString().slice(0, 10);
    if (isExpectedNyseSession(candidate, context)) {
      return candidate;
    }
  }
  throw new Error(`Unable to resolve the prior market session for ${reportDate}`);
}

export function assertCompleteNyseSessions(
  bars: readonly DatedSession[],
  finalDate: string,
  context: string,
): void {
  const firstBar = bars[0];
  if (firstBar === undefined) {
    throw new Error(`${context} bars must be a non-empty array`);
  }

  let barIndex = 0;
  for (let date = firstBar.date; date <= finalDate; date = nextIsoDate(date)) {
    const currentBar = bars[barIndex];
    if (isExpectedNyseSession(date, context)) {
      if (currentBar?.date !== date) {
        throw new Error(`${context} is missing expected market session ${date}`);
      }
      barIndex += 1;
    } else if (currentBar?.date === date) {
      throw new Error(`${context} contains non-session date ${date}`);
    }
  }
  if (barIndex !== bars.length) {
    throw new Error(`${context} contains a bar after its official close`);
  }
}
