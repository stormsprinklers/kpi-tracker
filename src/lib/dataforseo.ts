const BASE = "https://api.dataforseo.com/v3";

function getAuth(): string {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required");
  }
  return Buffer.from(`${login}:${password}`, "utf8").toString("base64");
}

async function post<T>(path: string, body: unknown[]): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${getAuth()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    status_code?: number;
    status_message?: string;
    tasks?: { status_code?: number; status_message?: string; result?: unknown[] }[];
  };
  if (!res.ok || (json.status_code !== undefined && json.status_code !== 20000)) {
    throw new Error(json.status_message ?? `DataForSEO error: ${res.status}`);
  }
  return json as T;
}

export type LocationParam =
  | { locationCode: number }
  | { locationCoordinate: string };

function addLocationToTask(task: Record<string, unknown>, loc: LocationParam): void {
  if ("locationCode" in loc) {
    task.location_code = loc.locationCode;
  } else {
    task.location_coordinate = loc.locationCoordinate;
  }
}

export interface OrganicResult {
  keyword: string;
  locationKey: string;
  rank: number | null;
  url: string | null;
  title: string | null;
}

export async function fetchOrganicLive(params: {
  keyword: string;
  locationKey: string;
  location: LocationParam;
  target?: string;
}): Promise<OrganicResult> {
  const task: Record<string, unknown> = {
    keyword: params.keyword,
    language_code: "en",
  };
  addLocationToTask(task, params.location);
  if (params.target) {
    task.target = params.target.includes("*") ? params.target : `${params.target}*`;
  }
  const json = await post<{
    tasks: {
      result?: Array<{
        keyword?: string;
        location_code?: number;
        items?: Array<{
          type?: string;
          rank_absolute?: number;
          url?: string;
          title?: string;
          domain?: string;
        }>;
      }>;
    }[];
  }>("/serp/google/organic/live/regular", [task]);

  const result = json.tasks?.[0]?.result?.[0];
  if (!result) {
    return { keyword: params.keyword, locationKey: params.locationKey, rank: null, url: null, title: null };
  }
  const items = result.items ?? [];
  const organic = items.filter((i) => i.type === "organic");
  const target = (params.target ?? "").replace(/\*$/, "").toLowerCase();
  const match = target
    ? organic.find((o) => (o.domain ?? o.url ?? "").toLowerCase().includes(target))
    : organic[0];
  return {
    keyword: result.keyword ?? params.keyword,
    locationKey: params.locationKey,
    rank: match?.rank_absolute ?? null,
    url: match?.url ?? null,
    title: match?.title ?? null,
  };
}

export interface LocalFinderResult {
  keyword: string;
  locationKey: string;
  rank: number | null;
  title: string | null;
}

function matchesLocal(
  item: { title?: string; domain?: string },
  businessName: string,
  domain: string | null
): boolean {
  const t = (item.title ?? "").toLowerCase();
  const d = (item.domain ?? "").toLowerCase();
  if (businessName && t.includes(businessName.toLowerCase())) return true;
  if (domain && d.includes(domain.toLowerCase().replace(/^www\./, ""))) return true;
  return false;
}

export async function fetchLocalFinderLive(params: {
  keyword: string;
  locationKey: string;
  location: LocationParam;
  businessName: string;
  domain: string | null;
}): Promise<LocalFinderResult> {
  const task: Record<string, unknown> = {
    keyword: params.keyword,
    language_code: "en",
  };
  addLocationToTask(task, params.location);
  const json = await post<{
    tasks: {
      result?: Array<{
        keyword?: string;
        location_code?: number;
        items?: Array<{
          type?: string;
          items?: Array<{ title?: string; domain?: string; rank_group?: number; rank_absolute?: number }>;
        }>;
      }>;
    }[];
  }>("/serp/google/local_finder/live/advanced", [task]);

  const result = json.tasks?.[0]?.result?.[0];
  if (!result) {
    return { keyword: params.keyword, locationKey: params.locationKey, rank: null, title: null };
  }
  const items = result.items ?? [];
  const localPack = items.find((i) => i.type === "local_pack");
  const entries = (localPack as { items?: Array<{ title?: string; domain?: string; rank_group?: number; rank_absolute?: number }> } | undefined)
    ?.items ?? [];
  const match = entries.find((e) =>
    matchesLocal(e, params.businessName, params.domain)
  );
  return {
    keyword: result.keyword ?? params.keyword,
    locationKey: params.locationKey,
    rank: match?.rank_group ?? match?.rank_absolute ?? null,
    title: match?.title ?? null,
  };
}

export interface AiModeResult {
  keyword: string;
  locationKey: string;
  mentioned: boolean;
  snippet: string | null;
}

function extractTextFromAiItem(item: {
  markdown?: string;
  text?: string;
  items?: Array<{ text?: string; markdown?: string }>;
}): string {
  const parts: string[] = [];
  if (item.markdown) parts.push(item.markdown);
  if (item.text) parts.push(item.text);
  (item.items ?? []).forEach((c) => {
    if (c.text) parts.push(c.text);
    if (c.markdown) parts.push(c.markdown);
  });
  return parts.join(" ");
}

export interface DataForSeoLocation {
  location_code: number;
  location_name: string;
  country_iso_code: string;
  location_type?: string;
}

export async function fetchLocations(country?: string): Promise<DataForSeoLocation[]> {
  const url = country
    ? `${BASE}/serp/google/locations/${country}`
    : `${BASE}/serp/google/locations`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${getAuth()}`,
      "Content-Type": "application/json",
    },
  });
  const json = (await res.json()) as {
    status_code?: number;
    tasks?: { result?: DataForSeoLocation[] }[];
  };
  if (!res.ok || (json.status_code !== undefined && json.status_code !== 20000)) {
    throw new Error("Failed to fetch DataForSEO locations");
  }
  return json.tasks?.[0]?.result ?? [];
}

export async function fetchAiModeLive(params: {
  keyword: string;
  locationKey: string;
  location: LocationParam;
  businessName: string;
  domain: string | null;
}): Promise<AiModeResult> {
  const task: Record<string, unknown> = {
    keyword: params.keyword,
    language_code: "en",
  };
  addLocationToTask(task, params.location);
  const json = await post<{
    tasks: {
      result?: Array<{
        keyword?: string;
        location_code?: number;
        items?: Array<{
          type?: string;
          markdown?: string;
          items?: Array<{ text?: string; markdown?: string }>;
        }>;
      }>;
    }[];
  }>("/serp/google/ai_mode/live/advanced", [task]);

  const result = json.tasks?.[0]?.result?.[0];
  if (!result) {
    return { keyword: params.keyword, locationKey: params.locationKey, mentioned: false, snippet: null };
  }
  const items = result.items ?? [];
  const aiOverview = items.find((i) => i.type === "ai_overview");
  const fullText = extractTextFromAiItem(aiOverview ?? {}).toLowerCase();
  const businessLower = params.businessName.toLowerCase();
  const domainClean = params.domain?.toLowerCase().replace(/^www\./, "") ?? "";
  const mentioned =
    Boolean(businessLower && fullText.includes(businessLower)) ||
    Boolean(domainClean && fullText.includes(domainClean));
  const snippet = mentioned && aiOverview?.markdown ? aiOverview.markdown.slice(0, 300) : null;
  return {
    keyword: result.keyword ?? params.keyword,
    locationKey: params.locationKey,
    mentioned,
    snippet,
  };
}
