import { NextResponse } from "next/server";
import { initSchema } from "@/lib/db";
import { getOrganizationsWithSeoConfig } from "@/lib/db/queries";
import { fetchAndCacheSeoForOrg } from "@/lib/seo/fetchSeoForOrg";

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** GET /api/cron/seo - Weekly refresh of SEO rankings for all orgs with SEO config. Protected by CRON_SECRET. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initSchema();

  if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
    return NextResponse.json({
      status: "ok",
      message: "DataForSEO credentials not set, skipping SEO refresh",
      refreshed: [],
    });
  }

  const orgIds = await getOrganizationsWithSeoConfig();
  if (orgIds.length === 0) {
    return NextResponse.json({
      status: "ok",
      message: "No organizations with SEO configured",
      refreshed: [],
    });
  }

  const results: { orgId: string; ok: boolean; error?: string }[] = [];

  for (const orgId of orgIds) {
    const result = await fetchAndCacheSeoForOrg(orgId);
    results.push({
      orgId,
      ok: result.ok,
      ...(result.error && { error: result.error }),
    });
  }

  return NextResponse.json({
    status: "ok",
    refreshed: results.filter((r) => r.ok).map((r) => r.orgId),
    errors: results.filter((r) => !r.ok).map((r) => ({ orgId: r.orgId, error: r.error })),
  });
}
