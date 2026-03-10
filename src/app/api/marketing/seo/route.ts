import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getOrganizationById,
  getSeoConfig,
  getSeoServiceAreas,
  getLatestSeoResults,
} from "@/lib/db/queries";
import { fetchAndCacheSeoForOrg } from "@/lib/seo/fetchSeoForOrg";

function configFingerprint(
  website: string,
  keywords: string[],
  locationValues: string[],
  serviceAreas: { name: string; location_values: string[] }[]
): string {
  const parts = [
    (website ?? "").toLowerCase().trim(),
    [...keywords].sort().join("|"),
    [...locationValues].sort().join("|"),
    ...serviceAreas.map((a) => `${a.name}:${[...a.location_values].sort().join(",")}`).sort(),
  ];
  return createHash("sha256").update(parts.join("::")).digest("hex");
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forceRefresh = new URL(request.url).searchParams.get("force_refresh") === "1";

  await initSchema();
  const orgId = session.user.organizationId;
  const org = await getOrganizationById(orgId);
  const seo = await getSeoConfig(orgId);
  const serviceAreas = await getSeoServiceAreas(orgId);

  const website = org?.website?.trim();
  const keywords = seo.keywords.filter(Boolean);
  const locationValues = seo.locations.filter(Boolean);

  if (!website || keywords.length === 0 || locationValues.length === 0) {
    return NextResponse.json({
      configured: false,
      message: "Configure website, keywords, and locations in Settings → Marketing & SEO.",
    });
  }

  if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
    return NextResponse.json({
      configured: true,
      error: "DataForSEO credentials not set. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to enable rankings.",
      locations: [],
      serviceAreas: [],
      organic: [],
      local: [],
      ai: [],
    });
  }

  const fingerprint = configFingerprint(website, keywords, locationValues, serviceAreas);

  if (!forceRefresh) {
    const cached = await getLatestSeoResults(orgId, fingerprint);
    if (cached?.payload) {
      return NextResponse.json({
        ...(cached.payload as Record<string, unknown>),
        cachedAt: cached.snapshot_at,
        fromCache: true,
      });
    }
  }

  const result = await fetchAndCacheSeoForOrg(orgId);
  if (!result.ok) {
    return NextResponse.json({
      configured: true,
      error: result.error ?? "Failed to fetch SEO data",
      locations: [],
      serviceAreas: [],
      organic: [],
      local: [],
      ai: [],
    });
  }

  const cached = await getLatestSeoResults(orgId, fingerprint);
  if (cached?.payload) {
    return NextResponse.json({
      ...(cached.payload as Record<string, unknown>),
      cachedAt: cached.snapshot_at,
      fromCache: false,
    });
  }

  return NextResponse.json({
    configured: true,
    error: "Fetch completed but cache read failed",
    locations: [],
    serviceAreas: [],
    organic: [],
    local: [],
    ai: [],
  });
}
