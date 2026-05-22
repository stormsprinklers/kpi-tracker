import { getCollectedRevenueJobDate } from "./jobCollectedRevenue";

/** HCP job number fields (invoice / display number). */
export function getHcpJobNumber(job: Record<string, unknown>): string | null {
  const candidates = [
    job.invoice_number,
    job.job_number,
    job.number,
    job.display_number,
    (job as Record<string, unknown>).invoiceNumber,
    (job as Record<string, unknown>).jobNumber,
  ];
  for (const c of candidates) {
    if (c == null || c === "") continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return null;
}

function parseToUtcYmd(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Inclusive UTC calendar days from start through end (YYYY-MM-DD). */
export function calendarDaysInclusiveUtc(startIso: unknown, endIso: unknown): string[] {
  const startYmd = parseToUtcYmd(startIso);
  const endYmd = parseToUtcYmd(endIso ?? startIso);
  if (!startYmd || !endYmd) return startYmd ? [startYmd] : [];

  const days: string[] = [];
  const cur = new Date(`${startYmd}T12:00:00.000Z`);
  const end = new Date(`${endYmd}T12:00:00.000Z`);
  if (cur.getTime() > end.getTime()) return [startYmd];

  while (cur.getTime() <= end.getTime()) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

function appointmentDayYmds(job: Record<string, unknown>): string[] {
  const appts =
    job.appointments ??
    job.job_appointments ??
    (job as Record<string, unknown>).jobAppointments;
  if (!Array.isArray(appts) || appts.length === 0) return [];

  const days = new Set<string>();
  for (const a of appts) {
    if (!a || typeof a !== "object") continue;
    const r = a as Record<string, unknown>;
    const sched = r.schedule as Record<string, unknown> | undefined;
    const start =
      r.start_time ??
      r.startTime ??
      r.scheduled_start ??
      r.scheduledStart ??
      sched?.scheduled_start ??
      sched?.scheduledStart;
    const ymd = parseToUtcYmd(start);
    if (ymd) days.add(ymd);
  }
  return Array.from(days).sort();
}

/** Distinct work days for a job (appointments, schedule span, else primary job date). */
export function getHcpJobWorkDayYmds(job: Record<string, unknown>): string[] {
  const fromAppts = appointmentDayYmds(job);
  if (fromAppts.length > 0) return fromAppts;

  const sched = job.schedule as Record<string, unknown> | undefined;
  const start = sched?.scheduled_start ?? sched?.scheduledStart ?? job.scheduled_start;
  const end = sched?.scheduled_end ?? sched?.scheduledEnd ?? job.scheduled_end ?? start;
  const spanDays = calendarDaysInclusiveUtc(start, end);
  if (spanDays.length > 1) return spanDays;

  const primary = getCollectedRevenueJobDate(job);
  if (primary) return [primary.toISOString().slice(0, 10)];
  if (spanDays.length === 1) return spanDays;
  return [];
}

export function ymdInDateRange(
  ymd: string,
  startDate?: string,
  endDate?: string
): boolean {
  if (startDate && ymd < startDate) return false;
  if (endDate && ymd > endDate) return false;
  return true;
}

export type JobNumberGroup = {
  canonicalPaid: number;
  workDays: Set<string>;
};

/** Merge all synced rows sharing a job number (multi-day duplicates in HCP). */
export function buildJobNumberGroups(
  jobs: unknown[],
  paidByJobId: Map<string, number>
): Map<string, JobNumberGroup> {
  const groups = new Map<string, JobNumberGroup>();

  for (const job of jobs) {
    const j = job as Record<string, unknown>;
    const jobNum = getHcpJobNumber(j);
    if (!jobNum) continue;

    const jobId = j.id != null ? String(j.id) : "";
    const paid = jobId ? (paidByJobId.get(jobId) ?? 0) : 0;
    const days = getHcpJobWorkDayYmds(j);

    let g = groups.get(jobNum);
    if (!g) {
      g = { canonicalPaid: 0, workDays: new Set() };
      groups.set(jobNum, g);
    }
    if (paid > g.canonicalPaid) g.canonicalPaid = paid;
    for (const d of days) g.workDays.add(d);
  }

  return groups;
}

export type CrewRevenueDayCredit = {
  dayYmd: string;
  amount: number;
};

/**
 * Crew revenue for one job row: split canonical paid across work days; dedupe by job number + day.
 * Returns per-day slices that fall in the reporting range (empty if already credited or no days).
 */
export function computeCrewRevenueDayCredits(params: {
  job: Record<string, unknown>;
  paidAmount: number;
  jobNumberGroups: Map<string, JobNumberGroup>;
  creditedDayKeys: Set<string>;
  startDate?: string;
  endDate?: string;
}): CrewRevenueDayCredit[] {
  const { job, paidAmount, jobNumberGroups, creditedDayKeys, startDate, endDate } = params;
  const jobNum = getHcpJobNumber(job);
  const jobId = job.id != null ? String(job.id) : "";

  const group = jobNum ? jobNumberGroups.get(jobNum) : undefined;
  const workDays =
    group && group.workDays.size > 0
      ? Array.from(group.workDays).sort()
      : getHcpJobWorkDayYmds(job);
  const dayCount = Math.max(1, workDays.length);
  const canonicalPaid = group && group.canonicalPaid > 0 ? group.canonicalPaid : paidAmount;
  const slice = canonicalPaid / dayCount;

  const credits: CrewRevenueDayCredit[] = [];
  const daysInPeriod = workDays.filter((d) => ymdInDateRange(d, startDate, endDate));

  for (const dayYmd of daysInPeriod) {
    const dedupeKey = jobNum ? `${jobNum}|${dayYmd}` : `${jobId}|${dayYmd}`;
    if (creditedDayKeys.has(dedupeKey)) continue;
    creditedDayKeys.add(dedupeKey);
    credits.push({ dayYmd, amount: slice });
  }

  if (credits.length === 0) {
    const jobDate = getCollectedRevenueJobDate(job);
    const jobDay = jobDate ? jobDate.toISOString().slice(0, 10) : null;
    if (jobDay && ymdInDateRange(jobDay, startDate, endDate)) {
      const dedupeKey = jobNum ? `${jobNum}|${jobDay}` : `${jobId}|${jobDay}`;
      if (!creditedDayKeys.has(dedupeKey)) {
        creditedDayKeys.add(dedupeKey);
        credits.push({ dayYmd: jobDay, amount: slice });
      }
    }
  }

  return credits;
}
