import { sql } from "@/lib/db";
import {
  getGoogleBusinessReviewsByOrg,
  getJobRevenueAssignments,
  getJobsWithCustomersForCompany,
  replaceGoogleBusinessReviewAssignmentRows,
} from "@/lib/db/queries";
import { getJobRelevantDate, getTechnicianIdsFromJob } from "@/lib/jobs/hcpJobTechnicians";

const RECENT_JOB_MS = 72 * 60 * 60 * 1000;

/** Lowercase, strip accents, collapse internal whitespace (for exact string comparisons). */
function normPersonName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function customerFullNameNorm(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null;
  const first = String(raw.first_name ?? raw.firstName ?? "").trim();
  const last = String(raw.last_name ?? raw.lastName ?? "").trim();
  if (!first || !last) return null;
  return normPersonName(`${first} ${last}`);
}

function reviewerDisplayNorm(displayName: string | null | undefined): string | null {
  if (!displayName?.trim()) return null;
  return normPersonName(displayName);
}

/** Full technician display name for matching in review text (first+last, or single name field from HCP). */
function technicianFullNormFromRaw(raw: Record<string, unknown>): string | null {
  const first = String(raw.first_name ?? raw.firstName ?? "").trim();
  const last = String(raw.last_name ?? raw.lastName ?? "").trim();
  if (first && last) return normPersonName(`${first} ${last}`);
  const fb = raw.full_name ?? raw.name ?? raw.display_name;
  if (typeof fb === "string" && fb.trim()) return normPersonName(fb);
  return null;
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

/**
 * True if normFull appears as a whole phrase in haystack (word boundaries; multi-word names use \s+ between parts).
 */
function exactFullNameInText(normFull: string, normHaystack: string): boolean {
  const parts = normFull.split(" ").filter((p) => p.length > 0);
  if (parts.length === 0) return false;
  const body = parts.map(escapeRegExp).join("\\s+");
  const re = new RegExp(`\\b${body}\\b`, "i");
  return re.test(normHaystack);
}

async function buildTechnicianFullNames(
  companyId: string
): Promise<{ hcp_id: string; normFull: string }[]> {
  const byId = new Map<string, string>();

  const empResult = await sql`
    SELECT hcp_id, raw FROM employees WHERE company_id = ${companyId}
  `;
  for (const row of empResult.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    const n = technicianFullNormFromRaw(r.raw ?? {});
    if (n) byId.set(r.hcp_id, n);
  }
  const prosResult = await sql`
    SELECT hcp_id, raw FROM pros WHERE company_id = ${companyId}
  `;
  for (const row of prosResult.rows ?? []) {
    const r = row as { hcp_id: string; raw: Record<string, unknown> };
    const n = technicianFullNormFromRaw(r.raw ?? {});
    if (n) byId.set(r.hcp_id, n);
  }

  return [...byId.entries()].map(([hcp_id, normFull]) => ({ hcp_id, normFull }));
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
 * Auto-assign only when certain:
 * 1) A technician's full name appears as an exact phrase in the review comment (unique technician), or
 * 2) The Google reviewer's display name exactly matches a customer's full first+last (normalized), and exactly one recent job exists for that customer — then assign that job's technicians.
 * Otherwise leaves the review unassigned.
 */
export async function autoAssignUnassignedGoogleReviews(
  organizationId: string,
  companyId: string
): Promise<{ assigned: number }> {
  const [reviews, jobRows, revenueRows, techFullNames] = await Promise.all([
    getGoogleBusinessReviewsByOrg(organizationId),
    getJobsWithCustomersForCompany(companyId),
    getJobRevenueAssignments(organizationId),
    buildTechnicianFullNames(companyId),
  ]);

  const revenueByJob = new Map(revenueRows.map((r) => [r.job_hcp_id, r.hcp_employee_id]));

  const recentJobs = jobRows.filter((row) =>
    jobIsWithinRecentWindow(row.job_raw, row.job_updated_at)
  );

  let assigned = 0;
  for (const rev of reviews) {
    if (rev.assigned_hcp_employee_ids.length > 0) continue;

    const commentNorm = normPersonName(rev.comment ?? "");

    // Path 1: exact full technician name phrase in review body only (not reviewer display name).
    const techIdsFromMention: string[] = [];
    if (commentNorm.length > 0) {
      for (const { hcp_id, normFull } of techFullNames) {
        if (exactFullNameInText(normFull, commentNorm)) {
          techIdsFromMention.push(hcp_id);
        }
      }
    }
    const uniqueMention = [...new Set(techIdsFromMention)];
    if (uniqueMention.length === 1) {
      await replaceGoogleBusinessReviewAssignmentRows({
        organization_id: organizationId,
        review_id: rev.review_id,
        hcp_employee_ids: uniqueMention,
        source: "auto_mention",
      });
      assigned++;
      continue;
    }

    // Path 2: reviewer display name === customer full name; exactly one matching recent job.
    const revNorm = reviewerDisplayNorm(rev.reviewer_name);
    if (!revNorm) {
      continue;
    }

    const matchingJobRows = recentJobs.filter((row) => {
      const cFull = customerFullNameNorm(row.customer_raw);
      return cFull != null && cFull === revNorm;
    });

    if (matchingJobRows.length !== 1) {
      continue;
    }

    const row = matchingJobRows[0];
    const techIds = techIdsForJobRow(row.job_raw, row.job_hcp_id, revenueByJob);
    if (techIds.length === 0) {
      continue;
    }

    await replaceGoogleBusinessReviewAssignmentRows({
      organization_id: organizationId,
      review_id: rev.review_id,
      hcp_employee_ids: techIds,
      source: "auto_customer",
    });
    assigned++;
  }

  return { assigned };
}
