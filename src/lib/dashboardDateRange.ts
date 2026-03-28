export type DashboardDatePreset =
  | "thisPayPeriod"
  | "lastPayPeriod"
  | "all"
  | "7d"
  | "14d"
  | "30d"
  | "thisMonth"
  | "lastMonth"
  | "custom";

export const DASHBOARD_PRESET_LABELS: Record<DashboardDatePreset, string> = {
  thisPayPeriod: "This pay period",
  lastPayPeriod: "Last pay period",
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  thisMonth: "This month",
  lastMonth: "Last month",
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

function getPayPeriodRange(offset: 0 | -1): { startDate: string; endDate: string } {
  const dayMs = 24 * 60 * 60 * 1000;
  const periodDays = 14;
  const anchorStart = new Date(Date.UTC(2026, 2, 21));
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const diffDays = Math.floor((todayUtc.getTime() - anchorStart.getTime()) / dayMs);
  const currentIndex = Math.floor(diffDays / periodDays);
  const index = currentIndex + offset;
  const start = new Date(anchorStart.getTime() + index * periodDays * dayMs);
  const end = new Date(start.getTime() + (periodDays - 1) * dayMs);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

/**
 * Resolves the selected dashboard preset into API-friendly bounds and a display label.
 * Custom without both dates: all-time behavior (same as technician section previously).
 */
export function getDashboardDateRange(
  preset: DashboardDatePreset,
  customStart: string,
  customEnd: string
): DashboardDateRange {
  if (preset === "all") {
    return { isAllTime: true, rangeLabel: DASHBOARD_PRESET_LABELS.all };
  }

  if (preset === "thisPayPeriod") {
    const p = getPayPeriodRange(0);
    return {
      isAllTime: false,
      startDate: p.startDate,
      endDate: p.endDate,
      rangeLabel: DASHBOARD_PRESET_LABELS.thisPayPeriod,
    };
  }
  if (preset === "lastPayPeriod") {
    const p = getPayPeriodRange(-1);
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

  return { isAllTime: true, rangeLabel: DASHBOARD_PRESET_LABELS.all };
}
