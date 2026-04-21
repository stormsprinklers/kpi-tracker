import {
  DEFAULT_PAY_PERIOD_CALENDAR,
  getCalendarDateInTimeZone,
  getPayPeriodRangeForOffset,
  formatYmd,
  type PayPeriodCalendarSettings,
} from "./payPeriod";

export { DEFAULT_PAY_PERIOD_CALENDAR };

export type DashboardDatePreset =
  | "thisPayPeriod"
  | "lastPayPeriod"
  | "all"
  | "7d"
  | "14d"
  | "30d"
  | "thisMonth"
  | "lastMonth"
  | "ytd"
  | "custom";

export const DASHBOARD_PRESET_LABELS: Record<DashboardDatePreset, string> = {
  thisPayPeriod: "This pay period",
  lastPayPeriod: "Last pay period",
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  thisMonth: "This month",
  lastMonth: "Last month",
  ytd: "Year to date",
  all: "All time",
  custom: "Custom range",
};

/** Preset order for the dashboard selector (matches prior technician options). */
export const DASHBOARD_PRESET_ORDER: DashboardDatePreset[] = [
  "thisPayPeriod",
  "lastPayPeriod",
  "7d",
  "14d",
  "30d",
  "thisMonth",
  "lastMonth",
  "ytd",
  "all",
  "custom",
];

export interface DashboardDateRange {
  /** No start/end filter (same as “all time” for key metrics; technician/CSR APIs omit date params). */
  isAllTime: boolean;
  startDate?: string;
  endDate?: string;
  rangeLabel: string;
}

/**
 * When the selected window extends past “today” in the org’s pay-period time zone (e.g. this
 * biweekly pay period), metrics should only query through today so period-over-period deltas
 * compare the same elapsed length (day 2 vs day 2), not partial current vs full prior period.
 */
export function clampDashboardRangeEndToTodayInOrgTz(
  dateRange: DashboardDateRange,
  payPeriodCalendar: PayPeriodCalendarSettings
): DashboardDateRange {
  if (dateRange.isAllTime || !dateRange.startDate || !dateRange.endDate) return dateRange;
  const cal = getCalendarDateInTimeZone(new Date(), payPeriodCalendar.payPeriodTimezone);
  const todayYmd = formatYmd(cal.y, cal.m, cal.d);
  const end = dateRange.endDate <= todayYmd ? dateRange.endDate : todayYmd;
  if (end < dateRange.startDate) {
    return { ...dateRange, endDate: dateRange.startDate };
  }
  return { ...dateRange, endDate: end };
}

/**
 * Resolves the selected dashboard preset into API-friendly bounds and a display label.
 * Custom without both dates: all-time behavior (same as technician section previously).
 */
export function getDashboardDateRange(
  preset: DashboardDatePreset,
  customStart: string,
  customEnd: string,
  payPeriodCalendar: PayPeriodCalendarSettings = DEFAULT_PAY_PERIOD_CALENDAR
): DashboardDateRange {
  if (preset === "all") {
    return { isAllTime: true, rangeLabel: DASHBOARD_PRESET_LABELS.all };
  }

  if (preset === "thisPayPeriod") {
    const p = getPayPeriodRangeForOffset(0, payPeriodCalendar);
    return {
      isAllTime: false,
      startDate: p.startDate,
      endDate: p.endDate,
      rangeLabel: DASHBOARD_PRESET_LABELS.thisPayPeriod,
    };
  }
  if (preset === "lastPayPeriod") {
    const p = getPayPeriodRangeForOffset(-1, payPeriodCalendar);
    return {
      isAllTime: false,
      startDate: p.startDate,
      endDate: p.endDate,
      rangeLabel: DASHBOARD_PRESET_LABELS.lastPayPeriod,
    };
  }

  const today = new Date();
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  const endStr = end.toISOString().slice(0, 10);

  if (preset === "custom") {
    if (customStart && customEnd) {
      return {
        isAllTime: false,
        startDate: customStart,
        endDate: customEnd,
        rangeLabel: `${customStart} → ${customEnd}`,
      };
    }
    return {
      isAllTime: true,
      rangeLabel: `${DASHBOARD_PRESET_LABELS.custom} (select dates)`,
    };
  }

  if (preset === "7d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 7);
    return {
      isAllTime: false,
      startDate: start.toISOString().slice(0, 10),
      endDate: endStr,
      rangeLabel: DASHBOARD_PRESET_LABELS["7d"],
    };
  }
  if (preset === "14d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 14);
    return {
      isAllTime: false,
      startDate: start.toISOString().slice(0, 10),
      endDate: endStr,
      rangeLabel: DASHBOARD_PRESET_LABELS["14d"],
    };
  }
  if (preset === "30d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    return {
      isAllTime: false,
      startDate: start.toISOString().slice(0, 10),
      endDate: endStr,
      rangeLabel: DASHBOARD_PRESET_LABELS["30d"],
    };
  }
  if (preset === "thisMonth") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      isAllTime: false,
      startDate: start.toISOString().slice(0, 10),
      endDate: endStr,
      rangeLabel: DASHBOARD_PRESET_LABELS.thisMonth,
    };
  }
  if (preset === "lastMonth") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endLast = new Date(today.getFullYear(), today.getMonth(), 0);
    return {
      isAllTime: false,
      startDate: start.toISOString().slice(0, 10),
      endDate: endLast.toISOString().slice(0, 10),
      rangeLabel: DASHBOARD_PRESET_LABELS.lastMonth,
    };
  }
  if (preset === "ytd") {
    const cal = getCalendarDateInTimeZone(new Date(), payPeriodCalendar.payPeriodTimezone);
    const endYmd = formatYmd(cal.y, cal.m, cal.d);
    const startYmd = `${cal.y}-01-01`;
    return {
      isAllTime: false,
      startDate: startYmd,
      endDate: endYmd,
      rangeLabel: DASHBOARD_PRESET_LABELS.ytd,
    };
  }

  return { isAllTime: true, rangeLabel: DASHBOARD_PRESET_LABELS.all };
}
