import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getGoogleBusinessProfile, getOrganizationById } from "@/lib/db/queries";
import { autoAssignUnassignedGoogleReviews } from "@/lib/googleReviews/autoAssignGoogleReviews";
import { syncGoogleBusinessReviewsForOrganization } from "@/lib/googleReviews/syncGoogleBusinessReviews";

export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await initSchema();
  const profile = await getGoogleBusinessProfile(session.user.organizationId);
  if (!profile?.google_account_connected) {
    return NextResponse.json(
      { error: "Connect a Google account with access to your Business Profile first." },
      { status: 400 }
    );
  }
  const accountId = profile.account_id?.trim();
  const locationId = profile.location_id?.trim();
  if (!accountId || !locationId) {
    return NextResponse.json(
      { error: "Select a Business Profile location before syncing." },
      { status: 400 }
    );
  }

  const syncResult = await syncGoogleBusinessReviewsForOrganization(session.user.organizationId);
  if (!syncResult.ok) {
    return NextResponse.json(
      { error: syncResult.error || "Sync failed" },
      { status: syncResult.status ?? 502 }
    );
  }

  const org = await getOrganizationById(session.user.organizationId);
  const companyId = org?.hcp_company_id ?? "default";
  const { assigned } = await autoAssignUnassignedGoogleReviews(
    session.user.organizationId,
    companyId
  );

  return NextResponse.json({ ok: true, synced: syncResult.synced, autoAssigned: assigned });
}
