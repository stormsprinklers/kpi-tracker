import type { MarketingChannelSlug } from "./types";

export type AttributionConfidence = "explicit" | "inferred" | "rule" | "model";

export interface JobAttributionResult {
  channelSlug: MarketingChannelSlug;
  confidence: AttributionConfidence;
  ruleType: string;
  matchedValue: string | null;
}

export interface MarketingSourceRuleRow {
  pattern: string;
  channel_slug: string;
  priority: number;
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** Collect searchable text and UTM params from HCP job raw JSON. */
export function extractAttributionSignals(job: Record<string, unknown>): {
  haystack: string;
  utmSource?: string;
  utmMedium?: string;
} {
  const parts: string[] = [];
  const add = (v: unknown) => {
    if (v == null) return;
    if (typeof v === "string" && v.trim()) parts.push(v);
    else if (typeof v === "number" || typeof v === "boolean") parts.push(String(v));
  };

  add(job.lead_source);
  add(job.source);
  add(job.referral_source);
  add(job.description);
  add(job.notes);
  add(job.job_source);
  add((job as Record<string, unknown>).campaign);

  const customer = job.customer;
  if (customer && typeof customer === "object") {
    const c = customer as Record<string, unknown>;
    add(c.lead_source);
    add(c.source);
    add(c.referral_source);
    add(c.notes);
  }

  const tags = job.tags;
  if (Array.isArray(tags)) {
    for (const t of tags) add(typeof t === "string" ? t : (t as Record<string, unknown>)?.name);
  }

  const custom = job.custom_fields ?? job.customFields;
  if (Array.isArray(custom)) {
    for (const f of custom) {
      if (f && typeof f === "object") {
        const o = f as Record<string, unknown>;
        add(o.name);
        add(o.value);
        add(o.label);
      }
    }
  }

  let utmSource: string | undefined;
  let utmMedium: string | undefined;
  const combined = parts.join(" | ");
  const utmSrc = combined.match(/utm_source=([^&\s|]+)/i);
  const utmMed = combined.match(/utm_medium=([^&\s|]+)/i);
  if (utmSrc?.[1]) utmSource = decodeURIComponent(utmSrc[1].trim());
  if (utmMed?.[1]) utmMedium = decodeURIComponent(utmMed[1].trim());

  return { haystack: norm(combined), utmSource: utmSource ? norm(utmSource) : undefined, utmMedium: utmMedium ? norm(utmMedium) : undefined };
}

function matchDefaultHeuristics(
  haystack: string,
  utmSource: string | undefined,
  utmMedium: string | undefined
): JobAttributionResult | null {
  const uS = utmSource ?? "";
  const uM = utmMedium ?? "";

  if (uS.includes("google") && (uM.includes("cpc") || uM.includes("ppc") || uM === "paid")) {
    return {
      channelSlug: "google_ads",
      confidence: "inferred",
      ruleType: "utm_google_paid",
      matchedValue: `utm_source=${uS};utm_medium=${uM}`,
    };
  }
  if (
    haystack.includes("local service") ||
    haystack.includes("local services") ||
    haystack.includes("lsa") ||
    haystack.includes("google local services")
  ) {
    return {
      channelSlug: "google_lsa",
      confidence: "inferred",
      ruleType: "text_lsa",
      matchedValue: "lsa_keywords",
    };
  }
  if (
    haystack.includes("business profile") ||
    haystack.includes("google my business") ||
    haystack.includes("gbp") ||
    haystack.includes("maps listing")
  ) {
    return {
      channelSlug: "google_business_profile",
      confidence: "inferred",
      ruleType: "text_gbp",
      matchedValue: "gbp_keywords",
    };
  }
  if (
    uM.includes("organic") ||
    haystack.includes("organic") ||
    haystack.includes("seo") ||
    haystack.includes("search (organic)")
  ) {
    return {
      channelSlug: "organic_search",
      confidence: "inferred",
      ruleType: "organic",
      matchedValue: "organic_keywords",
    };
  }
  if (
    haystack.includes("facebook") ||
    haystack.includes("meta") ||
    haystack.includes("instagram") ||
    uS.includes("facebook") ||
    uS.includes("fb") ||
    uS.includes("instagram")
  ) {
    return {
      channelSlug: "meta_ads",
      confidence: "inferred",
      ruleType: "text_meta",
      matchedValue: "meta_keywords",
    };
  }
  if (
    haystack.includes("refer") ||
    haystack.includes("friend") ||
    haystack.includes("neighbor") ||
    haystack.includes("word of mouth")
  ) {
    return {
      channelSlug: "referrals",
      confidence: "inferred",
      ruleType: "text_referral",
      matchedValue: "referral_keywords",
    };
  }
  if (haystack.includes("website") || haystack.includes("web form") || haystack.includes("online booking")) {
    return {
      channelSlug: "website",
      confidence: "inferred",
      ruleType: "text_website",
      matchedValue: "website_keywords",
    };
  }
  return null;
}

/**
 * Apply org-specific regex/substring rules (priority desc), then default heuristics, else unassigned.
 */
export function attributeJobFromRaw(
  job: Record<string, unknown>,
  orgRules: MarketingSourceRuleRow[]
): JobAttributionResult {
  const { haystack, utmSource, utmMedium } = extractAttributionSignals(job);

  const sorted = [...orgRules].sort((a, b) => b.priority - a.priority);
  for (const r of sorted) {
    const p = norm(r.pattern);
    if (!p) continue;
    try {
      const re = new RegExp(p, "i");
      if (re.test(haystack) || re.test(`${utmSource ?? ""} ${utmMedium ?? ""}`)) {
        return {
          channelSlug: r.channel_slug as MarketingChannelSlug,
          confidence: "rule",
          ruleType: "custom_pattern",
          matchedValue: r.pattern,
        };
      }
    } catch {
      if (haystack.includes(p)) {
        return {
          channelSlug: r.channel_slug as MarketingChannelSlug,
          confidence: "rule",
          ruleType: "custom_substring",
          matchedValue: r.pattern,
        };
      }
    }
  }

  const def = matchDefaultHeuristics(haystack, utmSource, utmMedium);
  if (def) return def;

  return {
    channelSlug: "unassigned",
    confidence: "inferred",
    ruleType: "default_unassigned",
    matchedValue: null,
  };
}
