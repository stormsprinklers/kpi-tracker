const FALLBACK_TZ = "America/Denver";

/** Calendar YYYY-MM-DD in IANA time zone for the given instant. */
export function ymdInTimeZone(date: Date, timeZone: string): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : FALLBACK_TZ;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Pure Gregorian calendar arithmetic on YYYY-MM-DD (not wall-clock in a zone). */
export function subtractCalendarDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const u = Date.UTC(y, m - 1, d - days);
  const dt = new Date(u);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Prior calendar day relative to "today" in the org time zone. */
export function yesterdayYmdInOrgZone(now: Date, timeZone: string): string {
  const today = ymdInTimeZone(now, timeZone);
  return subtractCalendarDays(today, 1);
}

/** Inclusive 7-day window ending on endYmd. */
export function rolling7DaysEnding(endYmd: string): { startDate: string; endDate: string } {
  return { startDate: subtractCalendarDays(endYmd, 6), endDate: endYmd };
}
