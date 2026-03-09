import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getOrganizationById, getSeoConfig } from "@/lib/db/queries";
import {
  fetchOrganicLive,
  fetchLocalFinderLive,
  fetchAiModeLive,
  fetchLocations,
} from "@/lib/dataforseo";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initSchema();
  const orgId = session.user.organizationId;
  const org = await getOrganizationById(orgId);
  const seo = await getSeoConfig(orgId);

  const website = org?.website?.trim();
  const keywords = seo.keywords.filter(Boolean);
  const locationCodes = seo.locations
    .map((v) => parseInt(v, 10))
    .filter((n) => !Number.isNaN(n));

  if (!website || keywords.length === 0 || locationCodes.length === 0) {
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
      organic: [],
      local: [],
      ai: [],
    });
  }

  const businessName = org?.seo_business_name?.trim() || org?.name || "";
  const domain = website.replace(/^https?:\/\//, "").replace(/^www\./, "");

  let locationMap: Record<number, string> = {};
  try {
    const locs = await fetchLocations("us");
    locs.forEach((l) => {
      locationMap[l.location_code] = l.location_name;
    });
  } catch {
    locationCodes.forEach((c) => {
      locationMap[c] = `Location ${c}`;
    });
  }

  const organic: Array<{
    keyword: string;
    locationCode: number;
    locationName: string;
    rank: number | null;
    url: string | null;
    title: string | null;
  }> = [];
  const local: Array<{
    keyword: string;
    locationCode: number;
    locationName: string;
    rank: number | null;
    title: string | null;
  }> = [];
  const ai: Array<{
    keyword: string;
    locationCode: number;
    locationName: string;
    mentioned: boolean;
    snippet: string | null;
  }> = [];

  for (const keyword of keywords) {
    for (const locCode of locationCodes) {
      const locName = locationMap[locCode] ?? `Location ${locCode}`;
      try {
        const [o, l, a] = await Promise.all([
          fetchOrganicLive({
            keyword,
            locationCode: locCode,
            target: domain,
          }),
          fetchLocalFinderLive({
            keyword,
            locationCode: locCode,
            businessName,
            domain,
          }),
          fetchAiModeLive({
            keyword,
            locationCode: locCode,
            businessName,
            domain,
          }),
        ]);
        organic.push({
          keyword: o.keyword,
          locationCode: o.locationCode,
          locationName: locName,
          rank: o.rank,
          url: o.url,
          title: o.title,
        });
        local.push({
          keyword: l.keyword,
          locationCode: l.locationCode,
          locationName: locName,
          rank: l.rank,
          title: l.title,
        });
        ai.push({
          keyword: a.keyword,
          locationCode: a.locationCode,
          locationName: locName,
          mentioned: a.mentioned,
          snippet: a.snippet,
        });
      } catch (err) {
        console.error(`DataForSEO error for ${keyword} @ ${locCode}:`, err);
        organic.push({
          keyword,
          locationCode: locCode,
          locationName: locName,
          rank: null,
          url: null,
          title: null,
        });
        local.push({
          keyword,
          locationCode: locCode,
          locationName: locName,
          rank: null,
          title: null,
        });
        ai.push({
          keyword,
          locationCode: locCode,
          locationName: locName,
          mentioned: false,
          snippet: null,
        });
      }
    }
  }

  return NextResponse.json({
    configured: true,
    locations: locationCodes.map((c) => ({
      code: c,
      name: locationMap[c] ?? `Location ${c}`,
    })),
    organic,
    local,
    ai,
  });
}
