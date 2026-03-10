/**
 * Shared logic to fetch SEO data from DataForSEO and cache it.
 * Used by the marketing SEO API route and the weekly cron.
 */

/** Max keyword×location combos per full refresh to avoid excessive time. */
const MAX_COMBOS_TOTAL = 80;

/** Combos per chunk for multi-invocation processing. */
const COMBOS_PER_CHUNK = 25;

/** Max chunks to avoid runaway chains. */
const MAX_CHUNKS = 20;

/** Batch size for parallel DataForSEO calls within each chunk. */
const BATCH_SIZE = 12;

import { createHash } from "crypto";
import {
  getOrganizationById,
  getSeoConfig,
  getSeoServiceAreas,
  insertSeoResults,
  getLocationsCache,
  setLocationsCache,
  getSeoFetchProgress,
  upsertSeoFetchProgress,
  deleteSeoFetchProgress,
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

export interface FetchSeoOptions {
  chunkIndex?: number;
  triggerContinue?: boolean;
}

export interface FetchSeoResult {
  ok: boolean;
  error?: string;
  /** When last chunk completes, the full payload. */
  payload?: Record<string, unknown>;
  /** When chunked and more chunks are running in background. */
  pending?: boolean;
}

export async function fetchAndCacheSeoForOrg(
  orgId: string,
  options?: FetchSeoOptions
): Promise<FetchSeoResult> {
  const chunkIndex = options?.chunkIndex ?? 0;
  const triggerContinue = options?.triggerContinue ?? true;
  const org = await getOrganizationById(orgId);
  const seo = await getSeoConfig(orgId);
  const serviceAreas = await getSeoServiceAreas(orgId);

  const website = org?.website?.trim();
  const keywords = seo.keywords.filter(Boolean);
  const locationValues = seo.locations.filter(Boolean);

  if (!website || keywords.length === 0 || locationValues.length === 0) {
    return { ok: true };
  }

  if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
    return { ok: true };
  }

  const fingerprint = configFingerprint(website, keywords, locationValues, serviceAreas);
  const businessName = org?.seo_business_name?.trim() || org?.name || "";
  const domain = website.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const includeAiMode = org?.seo_include_ai_mode === true;

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

  type Combo = { keyword: string; param: LocationParam; key: string; locValue: string };
  const allCombos: Combo[] = [];
  for (const keyword of keywords) {
    for (const { param, key, locValue } of parsedLocations) {
      allCombos.push({ keyword, param, key, locValue });
    }
  }
  const totalCombos = Math.min(allCombos.length, MAX_COMBOS_TOTAL);
  const comboCapNote =
    allCombos.length > MAX_COMBOS_TOTAL
      ? `Showing first ${MAX_COMBOS_TOTAL} of ${allCombos.length} combinations.`
      : null;

  const startIdx = chunkIndex * COMBOS_PER_CHUNK;
  const endIdx = Math.min(startIdx + COMBOS_PER_CHUNK, totalCombos);
  const chunkCombos = allCombos.slice(startIdx, endIdx);

  if (chunkCombos.length === 0) return { ok: true };

  type OrganicRow = {
    keyword: string;
    locationKey: string;
    locationValue: string;
    rank: number | null;
    url: string | null;
    title: string | null;
  };
  type LocalRow = {
    keyword: string;
    locationKey: string;
    locationValue: string;
    rank: number | null;
    title: string | null;
  };
  type AiRow = {
    keyword: string;
    locationKey: string;
    locationValue: string;
    mentioned: boolean;
    snippet: string | null;
  };

  let prevOrganic: OrganicRow[] = [];
  let prevLocal: LocalRow[] = [];
  let prevAi: AiRow[] = [];
  if (chunkIndex > 0) {
    const progress = await getSeoFetchProgress(orgId, fingerprint);
    if (progress) {
      prevOrganic = (progress.partial_organic ?? []) as OrganicRow[];
      prevLocal = (progress.partial_local ?? []) as LocalRow[];
      prevAi = (progress.partial_ai ?? []) as AiRow[];
    }
  }

  const organic: OrganicRow[] = [];
  const local: LocalRow[] = [];
  const ai: AiRow[] = [];

  try {
    for (let i = 0; i < chunkCombos.length; i += BATCH_SIZE) {
      const batch = chunkCombos.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (c) => {
          try {
            const tasks: Promise<unknown>[] = [
              fetchOrganicLive({ keyword: c.keyword, locationKey: c.key, location: c.param, target: domain }),
              fetchLocalFinderLive({
                keyword: c.keyword,
                locationKey: c.key,
                location: c.param,
                businessName,
                domain,
              }),
            ];
            if (includeAiMode) {
              tasks.push(
                fetchAiModeLive({
                  keyword: c.keyword,
                  locationKey: c.key,
                  location: c.param,
                  businessName,
                  domain,
                })
              );
            }
            const res = await Promise.all(tasks);
            const o = res[0] as Awaited<ReturnType<typeof fetchOrganicLive>>;
            const l = res[1] as Awaited<ReturnType<typeof fetchLocalFinderLive>>;
            const a = includeAiMode
              ? (res[2] as Awaited<ReturnType<typeof fetchAiModeLive>>)
              : { keyword: c.keyword, locationKey: c.key, locationValue: c.locValue, mentioned: false as boolean, snippet: null as string | null };
            return { o, l, a, locValue: c.locValue };
          } catch (err) {
            console.error(`[SEO] DataForSEO error for ${c.keyword} @ ${c.key}:`, err);
            return {
              o: { keyword: c.keyword, locationKey: c.key, locationValue: c.locValue, rank: null, url: null, title: null },
              l: { keyword: c.keyword, locationKey: c.key, locationValue: c.locValue, rank: null, title: null },
              a: { keyword: c.keyword, locationKey: c.key, locationValue: c.locValue, mentioned: false, snippet: null },
              locValue: c.locValue,
            };
          }
        })
      );
      for (const { o, l, a, locValue } of results) {
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
      }
    }

    const mergedOrganic = [...prevOrganic, ...organic];
    const mergedLocal = [...prevLocal, ...local];
    const mergedAi = [...prevAi, ...ai];

    const isLastChunk = endIdx >= totalCombos || chunkIndex + 1 >= MAX_CHUNKS;

    if (isLastChunk) {
      const avgRank = (ranks: (number | null)[]): number | null => {
        const valid = ranks.filter((r): r is number => r != null && r > 0);
        if (valid.length === 0) return null;
        return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
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
        const localRanks = mergedLocal
          .filter((r) => r.keyword === kw && areaValues.has(r.locationValue) && r.rank != null)
          .map((r) => r.rank as number);
        const organicRanks = mergedOrganic
          .filter((r) => r.keyword === kw && areaValues.has(r.locationValue) && r.rank != null)
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

      const payload: Record<string, unknown> = {
        configured: true,
        locations: parsedLocations.map((p) => ({ value: p.locValue, name: p.key })),
        serviceAreas: serviceAreas.map((a) => ({
          id: a.id,
          name: a.name,
          locationCount: a.location_values.length,
        })),
        organic: mergedOrganic,
        local: mergedLocal,
        ai: mergedAi,
        serviceAreaLocal,
        serviceAreaOrganic,
      };
      if (comboCapNote) payload.comboCapNote = comboCapNote;

      await insertSeoResults(orgId, fingerprint, payload);
      await deleteSeoFetchProgress(orgId, fingerprint);
      Object.assign(payload, { cachedAt: new Date().toISOString(), fromCache: false });
      return { ok: true, payload };
    } else {
      await upsertSeoFetchProgress(orgId, fingerprint, {
        chunk_index: chunkIndex,
        total_combos: totalCombos,
        combos_per_chunk: COMBOS_PER_CHUNK,
        partial_organic: mergedOrganic,
        partial_local: mergedLocal,
        partial_ai: mergedAi,
      });
      if (triggerContinue) {
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        const cronSecret = process.env.CRON_SECRET;
        fetch(`${baseUrl}/api/cron/seo/continue`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(cronSecret && { Authorization: `Bearer ${cronSecret}` }),
          },
          body: JSON.stringify({
            orgId,
            nextChunkIndex: chunkIndex + 1,
          }),
        }).catch((e) => console.error("[SEO] Failed to trigger continue:", e));
      }
      return { ok: true, pending: true };
    }
  } catch (err) {
    console.error("[SEO] fetchAndCacheSeoForOrg error:", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
