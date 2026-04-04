/** Default when org has no `performance_pay_org` row yet. */
export const DEFAULT_PAY_PERIOD_START_WEEKDAY = 1;
export const DEFAULT_PAY_PERIOD_TIMEZONE = "UTC";

export interface PayPeriodCalendarSettings {
  payPeriodStartWeekday: number;
  payPeriodTimezone: string;
  /**
   * First day of pay period #0 (inclusive YYYY-MM-DD), snapped to `payPeriodStartWeekday`.
   * When null, periods use the built-in grid from 1970-01-01 (first matching weekday).
   */
  payPeriodAnchorDate: string | null;
}

export const DEFAULT_PAY_PERIOD_CALENDAR: PayPeriodCalendarSettings = {
  payPeriodStartWeekday: DEFAULT_PAY_PERIOD_START_WEEKDAY,
  payPeriodTimezone: DEFAULT_PAY_PERIOD_TIMEZONE,
  payPeriodAnchorDate: null,
};

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === (m || 1) - 1 && dt.getUTCDate() === (d || 1);
}

/** First calendar date on or after `fromYmd` whose weekday is `targetWeekday` (0=Sun..6=Sat). */
export function firstWeekdayOnOrAfterYmd(fromYmd: string, targetWeekday: number): string {
  const [y, m, d] = fromYmd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
  const delta = (targetWeekday - dow + 7) % 7;
  return addDaysToYmd(fromYmd, delta);
}

/** Normalize user-entered anchor to the first period start on or after that calendar day. */
export function normalizePayPeriodAnchorYmd(
  raw: string | null | undefined,
  payPeriodStartWeekday: number
): string | null {
  const t = raw?.trim();
  if (!t) return null;
  if (!isValidYmd(t)) return null;
  return firstWeekdayOnOrAfterYmd(t, payPeriodStartWeekday);
}

export function payPeriodSettingsFromOrg(org: {
  pay_period_start_weekday?: number | null;
  pay_period_timezone?: string | null;
  pay_period_anchor_date?: string | null;
} | null): PayPeriodCalendarSettings {
  const w = org?.pay_period_start_weekday;
  const weekday =
    typeof w === "number" && w >= 0 && w <= 6 ? w : DEFAULT_PAY_PERIOD_START_WEEKDAY;
  const tz = org?.pay_period_timezone?.trim();
  const rawAnchor = org?.pay_period_anchor_date;
  let anchor: string | null = null;
  if (rawAnchor != null && String(rawAnchor).trim() !== "") {
    const a = String(rawAnchor).trim().slice(0, 10);
    if (isValidYmd(a)) {
      anchor = firstWeekdayOnOrAfterYmd(a, weekday);
    }
  }
  return {
    payPeriodStartWeekday: weekday,
    payPeriodTimezone: tz && isValidIanaTimeZone(tz) ? tz : DEFAULT_PAY_PERIOD_TIMEZONE,
    payPeriodAnchorDate: anchor,
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

/** Signed whole-day difference b - a in the proleptic Gregorian calendar (timezone-agnostic dates). */
function civilDaysBetweenYmd(aYmd: string, bYmd: string): number {
  const [ay, am, ad] = aYmd.split("-").map(Number);
  const [by, bm, bd] = bYmd.split("-").map(Number);
  const ta = Date.UTC(ay, (am || 1) - 1, ad || 1);
  const tb = Date.UTC(by, (bm || 1) - 1, bd || 1);
  return Math.round((tb - ta) / 86400000);
}

/**
 * Biweekly window [start, end] inclusive YYYY-MM-DD.
 * Uses the org's calendar **date** in the configured time zone for "today".
 * If `payPeriodAnchorDate` is set, 14-day blocks count from that date; otherwise from the first
 * `payPeriodStartWeekday` on or after 1970-01-01.
 */
export function getBiweeklyPeriodBounds(
  fromInstant: Date,
  settings: PayPeriodCalendarSettings
): { startDate: string; endDate: string } {
  const { payPeriodStartWeekday, payPeriodTimezone, payPeriodAnchorDate } = settings;
  const cal = getCalendarDateInTimeZone(fromInstant, payPeriodTimezone);
  const todayYmd = formatYmd(cal.y, cal.m, cal.d);

  const epochStart = payPeriodAnchorDate?.trim()
    ? firstWeekdayOnOrAfterYmd(payPeriodAnchorDate.trim(), payPeriodStartWeekday)
    : firstWeekdayOnOrAfterYmd("1970-01-01", payPeriodStartWeekday);
  const dayIndex = Math.floor(civilDaysBetweenYmd(epochStart, todayYmd) / 14);
  const startDate = addDaysToYmd(epochStart, dayIndex * 14);
  const endDate = addDaysToYmd(startDate, 13);
  return { startDate, endDate };
}

/** `periodOffset` 0 = current pay period, -1 = previous, 1 = next, etc. */
export function getPayPeriodRangeForOffsetN(
  periodOffset: number,
  settings: PayPeriodCalendarSettings
): { startDate: string; endDate: string } {
  const current = getBiweeklyPeriodBounds(new Date(), settings);
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

/** Shown at the top of timezone pickers; also used when `Intl.supportedValuesOf` is unavailable. */
export const TIMEZONE_SUGGESTIONS: readonly string[] = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Boise",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Detroit",
  "America/Indiana/Indianapolis",
  "America/Kentucky/Louisville",
  "America/Menominee",
  "America/North_Dakota/Center",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const FALLBACK_TIME_ZONES: string[] = [...TIMEZONE_SUGGESTIONS];
