/** Default when org has no `performance_pay_org` row yet. */
export const DEFAULT_PAY_PERIOD_START_WEEKDAY = 1;
export const DEFAULT_PAY_PERIOD_TIMEZONE = "UTC";

export interface PayPeriodCalendarSettings {
  payPeriodStartWeekday: number;
  payPeriodTimezone: string;
}

export function payPeriodSettingsFromOrg(org: {
  pay_period_start_weekday?: number | null;
  pay_period_timezone?: string | null;
} | null): PayPeriodCalendarSettings {
  const w = org?.pay_period_start_weekday;
  const weekday =
    typeof w === "number" && w >= 0 && w <= 6 ? w : DEFAULT_PAY_PERIOD_START_WEEKDAY;
  const tz = org?.pay_period_timezone?.trim();
  return {
    payPeriodStartWeekday: weekday,
    payPeriodTimezone: tz && isValidIanaTimeZone(tz) ? tz : DEFAULT_PAY_PERIOD_TIMEZONE,
  };
}

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Calendar date (Y-M-D) and weekday (0=Sun..6=Sat) for an instant in an IANA time zone. */
export function getCalendarDateInTimeZone(
  instant: Date,
  timeZone: string
): { y: number; m: number; d: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = fmt.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const wdMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    weekday: wdMap[map.weekday] ?? 0,
  };
}

export function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDaysToYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = Date.UTC(y, (m || 1) - 1, (d || 1) + delta);
  const dt = new Date(utc);
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Biweekly window [start, end] inclusive YYYY-MM-DD, aligned to payPeriodStartWeekday in the given zone.
 * Matches legacy getBiweeklyPeriod behavior but uses the org's calendar day and weekday.
 */
export function getBiweeklyPeriodBounds(
  fromInstant: Date,
  payPeriodStartWeekday: number,
  timeZone: string
): { startDate: string; endDate: string } {
  const cal = getCalendarDateInTimeZone(fromInstant, timeZone);
  const day = cal.weekday;
  let daysBack = (day - payPeriodStartWeekday + 7) % 7;
  if (day < payPeriodStartWeekday) daysBack += 7;
  const todayYmd = formatYmd(cal.y, cal.m, cal.d);
  const startDate = addDaysToYmd(todayYmd, -daysBack);
  const endDate = addDaysToYmd(startDate, 13);
  return { startDate, endDate };
}

/** `periodOffset` 0 = current pay period, -1 = previous, 1 = next, etc. */
export function getPayPeriodRangeForOffsetN(
  periodOffset: number,
  settings: PayPeriodCalendarSettings
): { startDate: string; endDate: string } {
  const current = getBiweeklyPeriodBounds(
    new Date(),
    settings.payPeriodStartWeekday,
    settings.payPeriodTimezone
  );
  const startDate = addDaysToYmd(current.startDate, periodOffset * 14);
  const endDate = addDaysToYmd(startDate, 13);
  return { startDate, endDate };
}

export function getPayPeriodRangeForOffset(
  offset: 0 | -1,
  settings: PayPeriodCalendarSettings
): { startDate: string; endDate: string } {
  return getPayPeriodRangeForOffsetN(offset === 0 ? 0 : -1, settings);
}

/** IANA zones for settings UI (Node 20+ / modern browsers). */
export function listIanaTimeZones(): string[] {
  try {
    const fn = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf;
    if (typeof fn === "function") {
      return fn.call(Intl, "timeZone").slice().sort();
    }
  } catch {
    /* ignore */
  }
  return FALLBACK_TIME_ZONES;
}

const FALLBACK_TIME_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
];
