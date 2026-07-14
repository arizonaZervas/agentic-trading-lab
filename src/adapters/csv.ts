import { readFile } from "node:fs/promises";

import type { PriceBar } from "../domain/model.ts";

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function parseBoolean(
  value: string | undefined,
  rowNumber: number,
  fieldName: string,
): boolean {
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  throw new Error(`CSV row ${rowNumber} has an invalid ${fieldName} value`);
}

export function parseAdjustedCloseCsv(contents: string): PriceBar[] {
  const lines = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const headerLine = lines[0];
  if (headerLine === undefined) {
    throw new Error("CSV is empty");
  }

  const headers = headerLine.split(",").map(normalizeHeader);
  const symbolIndex = headers.indexOf("symbol");
  const dateIndex = headers.indexOf("date");
  const openIndex = headers.indexOf("open");
  const closeIndex = headers.indexOf("close");
  const monthEndIndex = headers.indexOf("ismonthend");
  const firstSessionIndex = headers.indexOf("isfirstsessionofmonth");
  const adjustedCloseIndex = headers.findIndex(
    (header) => header === "adjustedclose" || header === "adjclose",
  );

  if (
    symbolIndex < 0 ||
    dateIndex < 0 ||
    closeIndex < 0 ||
    adjustedCloseIndex < 0 ||
    monthEndIndex < 0 ||
    firstSessionIndex < 0
  ) {
    throw new Error(
      "CSV must contain symbol, date, close, adjusted_close (or Adj Close), is_month_end, and is_first_session_of_month columns",
    );
  }

  const bars: PriceBar[] = [];
  for (const [offset, line] of lines.slice(1).entries()) {
    const rowNumber = offset + 2;
    const cells = line.split(",").map((cell) => cell.trim());
    const symbol = cells[symbolIndex];
    const date = cells[dateIndex];
    const openText = openIndex < 0 ? undefined : cells[openIndex];
    const closeText = cells[closeIndex];
    const adjustedCloseText = cells[adjustedCloseIndex];
    const isMonthEnd = parseBoolean(cells[monthEndIndex], rowNumber, "is_month_end");
    const isFirstSessionOfMonth = parseBoolean(
      cells[firstSessionIndex],
      rowNumber,
      "is_first_session_of_month",
    );

    if (date === undefined || !isIsoDate(date)) {
      throw new Error(`CSV row ${rowNumber} has an invalid ISO date`);
    }

    if (
      symbol === undefined ||
      !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)
    ) {
      throw new Error(`CSV row ${rowNumber} has an invalid uppercase symbol`);
    }

    const close = Number(closeText);
    if (!Number.isFinite(close) || close <= 0) {
      throw new Error(`CSV row ${rowNumber} has an invalid close`);
    }

    const adjustedClose = Number(adjustedCloseText);
    if (!Number.isFinite(adjustedClose) || adjustedClose <= 0) {
      throw new Error(`CSV row ${rowNumber} has an invalid adjusted close`);
    }

    let open: number | undefined;
    let adjustedOpen: number | undefined;
    if (openIndex >= 0) {
      open = Number(openText);
      if (!Number.isFinite(open) || open <= 0) {
        throw new Error(`CSV row ${rowNumber} has an invalid open`);
      }
      adjustedOpen = open * (adjustedClose / close);
    }

    const previous = bars.at(-1);
    if (previous !== undefined && date <= previous.date) {
      throw new Error(`CSV dates must be unique and strictly increasing (row ${rowNumber})`);
    }

    bars.push({
      symbol,
      date,
      ...(open === undefined || adjustedOpen === undefined
        ? {}
        : { open, adjustedOpen }),
      close,
      adjustedClose,
      isMonthEnd,
      isFirstSessionOfMonth,
    });
  }

  if (bars.length === 0) {
    throw new Error("CSV has no price rows");
  }

  return bars;
}

export async function loadAdjustedCloseCsv(path: string): Promise<PriceBar[]> {
  return parseAdjustedCloseCsv(await readFile(path, "utf8"));
}
