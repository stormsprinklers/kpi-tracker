import { NextResponse } from "next/server";
import { initSchema } from "@/lib/db";
import { getOrganizationById, getOrganizationIdsWithGoogleReviewSync } from "@/lib/db/queries";
import { autoAssignUnassignedGoogleReviews } from "@/lib/googleReviews/autoAssignGoogleReviews";
import { syncGoogleBusinessReviewsForOrganization } from "@/lib/googleReviews/syncGoogleBusinessReviews";

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export const dynamic = "force-dynamic";

/** Hourly: sync Google reviews for each org with GBP connected, then auto-assign technicians. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initSchema();
  const orgIds = await getOrganizationIdsWithGoogleReviewSync();
  const results: {
    organizationId: string;
    synced?: number;
    autoAssigned?: number;
    error?: string;
  }[] = [];

  for (const organizationId of orgIds) {
    const syncResult = await syncGoogleBusinessReviewsForOrganization(organizationId);
    if (!syncResult.ok) {
      results.push({
        organizationId,
        error: syncResult.error,
      });
      continue;
    }
    const org = await getOrganizationById(organizationId);
    const companyId = org?.hcp_company_id ?? "default";
    const { assigned } = await autoAssignUnassignedGoogleReviews(organizationId, companyId);
    results.push({
      organizationId,
      synced: syncResult.synced,
      autoAssigned: assigned,
    });
  }

  return NextResponse.json({
    ok: true,
    organizations: orgIds.length,
    results,
  });
}
