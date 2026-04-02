import { getWebAttributionSourceBySlugOrLabel } from "@/lib/db/webAttributionQueries";

/** Try `utm_source` values that should map to the same web attribution source (slug/label in DB). */
export function utmSourceLookupCandidates(raw: string): string[] {
  const t = raw.trim().toLowerCase();
  if (!t) return [];
  const out: string[] = [];
  const add = (s: string) => {
    const x = s.trim().toLowerCase();
    if (x && !out.includes(x)) out.push(x);
  };
  add(t);
  if (t.startsWith("www.")) add(t.slice(4));

  if (t === "chatgpt.com" || t === "www.chatgpt.com") {
    add("chatgpt");
  } else if (t === "chatgpt") {
    add("chatgpt.com");
  } else if (t === "openai.com" || t === "www.openai.com") {
    add("chatgpt.com");
    add("chatgpt");
  }
  return out;
}

export function extractUtmSourceFromPageUrl(pageUrl: string | null | undefined): string | null {
  if (!pageUrl?.trim()) return null;
  try {
    const u = new URL(pageUrl);
    const v = u.searchParams.get("utm_source")?.trim();
    return v || null;
  } catch {
    const m = pageUrl.match(/[?&]utm_source=([^&]+)/i);
    if (!m?.[1]) return null;
    try {
      return decodeURIComponent(m[1].replace(/\+/g, " ")).trim() || null;
    } catch {
      return m[1].trim() || null;
    }
  }
}

export async function resolveWebAttributionSourceIdForUtm(
  organizationId: string,
  rawUtm: string
): Promise<string | null> {
  const candidates = utmSourceLookupCandidates(rawUtm);
  for (const c of candidates) {
    const row = await getWebAttributionSourceBySlugOrLabel({ organizationId, value: c });
    if (row?.source_id) return row.source_id;
  }
  return null;
}

/** Friendly label when `source_id` was missing but `metadata.utm_source` is set. */
export function displayLabelFromUtmSource(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim().toLowerCase();
  if (
    t === "chatgpt.com" ||
    t === "www.chatgpt.com" ||
    t === "chatgpt" ||
    t === "openai.com" ||
    t === "www.openai.com"
  ) {
    return "ChatGPT";
  }
  return null;
}
