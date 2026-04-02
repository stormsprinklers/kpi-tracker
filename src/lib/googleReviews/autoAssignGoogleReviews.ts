import { sql } from "@/lib/db";
import {
  getGoogleBusinessReviewsByOrg,
  getJobRevenueAssignments,
  getJobsWithCustomersForCompany,
  replaceGoogleBusinessReviewAssignmentRows,
} from "@/lib/db/queries";
import { getJobRelevantDate, getTechnicianIdsFromJob } from "@/lib/jobs/hcpJobTechnicians";

const RECENT_JOB_MS = 72 * 60 * 60 * 1000;
const MIN_NAME_LEN = 2;

function normToken(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseReviewerParts(displayName: string | null | undefined): {
  first: string;
  last: string;
} {
  if (!displayName?.trim()) return { first: "", last: "" };
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: normToken(parts[0]), last: normToken(parts[0]) };
  return {
    first: normToken(parts[0]),
    last: normToken(parts[parts.length - 1]),
  };
}

function customerNameParts(raw: Record<string, unknown> | null): { first: string; last: string } {
  if (!raw) return { first: "", last: "" };
  const first = normToken(String(raw.first_name ?? raw.firstName ?? ""));
  const last = normToken(String(raw.last_name ?? raw.lastName ?? ""));
  return { first, last };
}

function reviewerMatchesCustomer(
  rFirst: string,
  rLast: string,
  cFirst: string,
  cLast: string
): boolean {
  const tokens = [rFirst, rLast].filter((t) => t.length >= MIN_NAME_LEN);
  if (tokens.length === 0) return false;
  const cTokens = [cFirst, cLast].filter((t) => t.length >= MIN_NAME_LEN);
  if (cTokens.length === 0) return false;
  for (const rt of tokens) {
    for (const ct of cTokens) {
      if (rt === ct) return true;
    }
  }
  return false;
}

function jobIsWithinRecentWindow(jobRaw: Record<string, unknown>, jobUpdatedAtIso: string): boolean {
  const d = getJobRelevantDate(jobRaw);
  const t = d?.getTime();
  if (t != null && !Number.isNaN(t)) {
    return Date.now() - t <= RECENT_JOB_MS;
  }
  const u = new Date(jobUpdatedAtIso);
  if (!Number.isNaN(u.getTime())) {
    return Date.now() - u.getTime() <= RECENT_JOB_MS;
  }
  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function buildFirstNameToEmployeeIds(
  companyId: string
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const add = (first: string, id: string) => {
    const k = normToken(first);
    if (k.length < MIN_NAME_LEN) return;
    const list = map.get(k) ?? [];
    if (!list.includes(id)) list.push(id);
    map.set(k, list);
  };

  const empResult = await sql`
    SELECT hcp_id, raw FROM employees WHERE company_id = ${companyId}
  `;
  for (const row of empResult.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    const raw = r.raw ?? {};
    add(String(raw.first_name ?? raw.firstName ?? ""), r.hcp_id);
  }
  const prosResult = await sql`
    SELECT hcp_id, raw FROM pros WHERE company_id = ${companyId}
  `;
  for (const row of prosResult.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    const raw = r.raw ?? {};
    add(String(raw.first_name ?? raw.firstName ?? ""), r.hcp_id);
  }
  return map;
}

function techIdsForJobRow(
  jobRaw: Record<string, unknown>,
  jobHcpId: string,
  revenueByJob: Map<string, string>
): string[] {
  const fromRaw = getTechnicianIdsFromJob(jobRaw);
  if (fromRaw.length > 0) return [...new Set(fromRaw)];
  const manual = revenueByJob.get(jobHcpId);
  return manual ? [manual] : [];
}

/**
 * Auto-assign unassigned Google reviews: customer name vs jobs (72h), then technician first names in text.
 */
export async function autoAssignUnassignedGoogleReviews(
  organizationId: string,
  companyId: string
): Promise<{ assigned: number }> {
  const [reviews, jobRows, revenueRows, firstNameIndex] = await Promise.all([
    getGoogleBusinessReviewsByOrg(organizationId),
    getJobsWithCustomersForCompany(companyId),
    getJobRevenueAssignments(organizationId),
    buildFirstNameToEmployeeIds(companyId),
  ]);

  const revenueByJob = new Map(revenueRows.map((r) => [r.job_hcp_id, r.hcp_employee_id]));

  const recentJobs = jobRows.filter((row) =>
    jobIsWithinRecentWindow(row.job_raw, row.job_updated_at)
  );

  let assigned = 0;
  for (const rev of reviews) {
    if (rev.assigned_hcp_employee_ids.length > 0) continue;

    const { first: rFirst, last: rLast } = parseReviewerParts(rev.reviewer_name);
    const techFromCustomer = new Set<string>();

    for (const row of recentJobs) {
      const c = customerNameParts(row.customer_raw);
      if (!reviewerMatchesCustomer(rFirst, rLast, c.first, c.last)) continue;
      for (const tid of techIdsForJobRow(row.job_raw, row.job_hcp_id, revenueByJob)) {
        techFromCustomer.add(tid);
      }
    }

    if (techFromCustomer.size > 0) {
      await replaceGoogleBusinessReviewAssignmentRows({
        organization_id: organizationId,
        review_id: rev.review_id,
        hcp_employee_ids: [...techFromCustomer],
        source: "auto_customer",
      });
      assigned++;
      continue;
    }

    const haystack = normToken(`${rev.comment ?? ""} ${rev.reviewer_name ?? ""}`).replace(
      /\s+/g,
      " "
    );
    const fromMention = new Set<string>();
    for (const [firstLower, ids] of firstNameIndex) {
      if (firstLower.length < MIN_NAME_LEN) continue;
      const re = new RegExp(`\\b${escapeRegExp(firstLower)}\\b`, "i");
      if (re.test(haystack)) {
        for (const id of ids) fromMention.add(id);
      }
    }

    if (fromMention.size > 0) {
      await replaceGoogleBusinessReviewAssignmentRows({
        organization_id: organizationId,
        review_id: rev.review_id,
        hcp_employee_ids: [...fromMention],
        source: "auto_mention",
      });
      assigned++;
    }
  }

  return { assigned };
}
