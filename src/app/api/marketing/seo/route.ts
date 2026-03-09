import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getOrganizationById,
  getSeoConfig,
  getSeoServiceAreas,
  getLatestSeoResults,
  insertSeoResults,
  getLocationsCache,
  setLocationsCache,
} from "@/lib/db/queries";
import {
  fetchOrganicLive,
  fetchLocalFinderLive,
  fetchAiModeLive,
  fetchLocations,
  type LocationParam,
} from "@/lib/dataforseo";

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

function parseLocation(
  value: string,
  locationNames: Record<number, string>
): { param: LocationParam; key: string } | null {
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith("zip:")) {
    const parts = v.split(":");
    if (parts.length >= 3) {
      const zip = parts[1];
      const coord = `${parts[2]},5000`;
      return { param: { locationCoordinate: coord }, key: `ZIP ${zip}` };
    }
    return null;
  }
  const code = parseInt(v, 10);
  if (Number.isNaN(code)) return null;
  const name = locationNames[code] ?? `Location ${code}`;
  return { param: { locationCode: code }, key: name };
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

  const businessName = org?.seo_business_name?.trim() || org?.name || "";
  const domain = website.replace(/^https?:\/\//, "").replace(/^www\./, "");

  const locationNames: Record<number, string> = {};
  let locs: Array<{ location_code: number; location_name: string }> = [];
  const locationsCache = await getLocationsCache("locations:us");
  if (locationsCache != null && Array.isArray(locationsCache)) {
    locs = locationsCache as Array<{ location_code: number; location_name: string }>;
  } else {
    try {
      locs = await fetchLocations("us");
      await setLocationsCache("locations:us", locs);
    } catch {
      // use fallbacks
    }
  }
  locs.forEach((l) => {
    locationNames[l.location_code] = l.location_name;
  });

  const parsedLocations: { param: LocationParam; key: string; locValue: string }[] = [];
  for (const v of locationValues) {
    const p = parseLocation(v, locationNames);
    if (p) parsedLocations.push({ ...p, locValue: v });
  }

  const organic: Array<{
    keyword: string;
    locationKey: string;
    locationValue: string;
    rank: number | null;
    url: string | null;
    title: string | null;
  }> = [];
  const local: Array<{
    keyword: string;
    locationKey: string;
    locationValue: string;
    rank: number | null;
    title: string | null;
  }> = [];
  const ai: Array<{
    keyword: string;
    locationKey: string;
    locationValue: string;
    mentioned: boolean;
    snippet: string | null;
  }> = [];

  for (const keyword of keywords) {
    for (const { param, key, locValue } of parsedLocations) {
      try {
        const [o, l, a] = await Promise.all([
          fetchOrganicLive({
            keyword,
            locationKey: key,
            location: param,
            target: domain,
          }),
          fetchLocalFinderLive({
            keyword,
            locationKey: key,
            location: param,
            businessName,
            domain,
          }),
          fetchAiModeLive({
            keyword,
            locationKey: key,
            location: param,
            businessName,
            domain,
          }),
        ]);
        organic.push({
          keyword: o.keyword,
          locationKey: o.locationKey,
          locationValue: locValue,
          rank: o.rank,
          url: o.url,
          title: o.title,
        });
        local.push({
          keyword: l.keyword,
          locationKey: l.locationKey,
          locationValue: locValue,
          rank: l.rank,
          title: l.title,
        });
        ai.push({
          keyword: a.keyword,
          locationKey: a.locationKey,
          locationValue: locValue,
          mentioned: a.mentioned,
          snippet: a.snippet,
        });
      } catch (err) {
        console.error(`DataForSEO error for ${keyword} @ ${key}:`, err);
        organic.push({
          keyword,
          locationKey: key,
          locationValue: locValue,
          rank: null,
          url: null,
          title: null,
        });
        local.push({
          keyword,
          locationKey: key,
          locationValue: locValue,
          rank: null,
          title: null,
        });
        ai.push({
          keyword,
          locationKey: key,
          locationValue: locValue,
          mentioned: false,
          snippet: null,
        });
      }
    }
  }

  const avgRank = (ranks: (number | null)[]): number | null => {
    const valid = ranks.filter((r): r is number => r != null && r > 0);
    if (valid.length === 0) return null;
    return Math.round(
      valid.reduce((a, b) => a + b, 0) / valid.length
    );
  };

  const serviceAreaLocal: Array<{
    serviceAreaName: string;
    keyword: string;
    avgRank: number | null;
    locationCount: number;
  }> = [];
  const serviceAreaOrganic: Array<{
    serviceAreaName: string;
    keyword: string;
    avgRank: number | null;
    locationCount: number;
  }> = [];

  for (const area of serviceAreas) {
    const areaValues = new Set(area.location_values);
    if (areaValues.size === 0) continue;
    for (const kw of keywords) {
      const localRanks = local
        .filter(
          (r) =>
            r.keyword === kw &&
            areaValues.has(r.locationValue) &&
            r.rank != null
        )
        .map((r) => r.rank as number);
      const organicRanks = organic
        .filter(
          (r) =>
            r.keyword === kw &&
            areaValues.has(r.locationValue) &&
            r.rank != null
        )
        .map((r) => r.rank as number);
      serviceAreaLocal.push({
        serviceAreaName: area.name,
        keyword: kw,
        avgRank: avgRank(localRanks),
        locationCount: area.location_values.length,
      });
      serviceAreaOrganic.push({
        serviceAreaName: area.name,
        keyword: kw,
        avgRank: avgRank(organicRanks),
        locationCount: area.location_values.length,
      });
    }
  }

  const payload = {
    configured: true,
    locations: parsedLocations.map((p) => ({ value: p.locValue, name: p.key })),
    serviceAreas: serviceAreas.map((a) => ({
      id: a.id,
      name: a.name,
      locationCount: a.location_values.length,
    })),
    organic,
    local,
    ai,
    serviceAreaLocal,
    serviceAreaOrganic,
  };

  await insertSeoResults(orgId, fingerprint, payload);
  const snapshotAt = new Date().toISOString();

  return NextResponse.json({
    ...payload,
    cachedAt: snapshotAt,
    fromCache: false,
  });
}
