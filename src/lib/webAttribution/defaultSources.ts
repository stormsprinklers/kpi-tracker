import {
  createWebAttributionSource,
  listWebAttributionSources,
} from "@/lib/db/webAttributionQueries";
import { createSourceToken } from "@/lib/webAttribution";

/** Slug for catch-all web visits with no tracking token and no utm_source. */
export const ORGANIC_DIRECT_SLUG = "organic_direct";

export const WEB_ATTRIBUTION_DEFAULT_SOURCES: Array<{ slug: string; label: string }> = [
  { slug: "facebook", label: "Facebook" },
  { slug: "instagram", label: "Instagram" },
  { slug: "gbp", label: "GBP" },
  { slug: "lsa", label: "LSA" },
  { slug: "chatgpt.com", label: "ChatGPT" },
  {
    slug: ORGANIC_DIRECT_SLUG,
    label: "Organic (direct)",
  },
];

/** Create any built-in sources missing for this org (idempotent). */
export async function ensureWebAttributionDefaultSources(organizationId: string): Promise<void> {
  const current = await listWebAttributionSources(organizationId);
  const currentSlugs = new Set(current.map((s) => s.slug.toLowerCase()));
  for (const source of WEB_ATTRIBUTION_DEFAULT_SOURCES) {
    if (currentSlugs.has(source.slug.toLowerCase())) continue;
    await createWebAttributionSource({
      organizationId,
      slug: source.slug,
      label: source.label,
      publicToken: createSourceToken(),
    });
    currentSlugs.add(source.slug.toLowerCase());
  }
}
