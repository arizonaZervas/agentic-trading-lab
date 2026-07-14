const RFC3339_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 0;
}

/** Parse an RFC3339 instant without accepting Date.parse normalization. */
export function parseSemanticRfc3339(value: string, context: string): number {
  const match = RFC3339_PATTERN.exec(value);
  if (match === null) {
    throw new Error(`${context} must be a semantically valid RFC3339 timestamp`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? "";
  const zone = match[8];
  const offsetSign = match[9];
  const offsetHour = Number(match[10] ?? 0);
  const offsetMinute = Number(match[11] ?? 0);

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw new Error(`${context} must be a semantically valid RFC3339 timestamp`);
  }

  // JavaScript Date stores milliseconds. Accept additional precision only
  // when it is exactly zero, rather than silently truncating a future instant.
  if (fraction.length > 3 && /[1-9]/.test(fraction.slice(3))) {
    throw new Error(`${context} contains nonzero sub-millisecond precision`);
  }
  const milliseconds = Number(`${fraction}000`.slice(0, 3));
  const localMilliseconds = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    milliseconds,
  );
  const offsetMinutes =
    zone === "Z"
      ? 0
      : (offsetSign === "+" ? 1 : -1) *
        (offsetHour * 60 + offsetMinute);
  const instant = localMilliseconds - offsetMinutes * 60_000;
  if (!Number.isFinite(instant)) {
    throw new Error(`${context} must be a semantically valid RFC3339 timestamp`);
  }
  return instant;
}
