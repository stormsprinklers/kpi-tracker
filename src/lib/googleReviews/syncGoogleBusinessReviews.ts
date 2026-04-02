import {
  getGoogleBusinessProfile,
  upsertGoogleBusinessReview,
} from "@/lib/db/queries";
import { getGoogleBusinessAccessTokenForOrg } from "@/lib/googleBusinessTokens";

interface GoogleReviewApiItem {
  name?: string;
  reviewer?: { displayName?: string };
  starRating?: string | number;
  comment?: string;
  createTime?: string;
  updateTime?: string;
}

function parseReviewId(name: string | undefined): string | null {
  if (!name) return null;
  const parts = name.split("/");
  const id = parts[parts.length - 1];
  return id?.trim() || null;
}

const GOOGLE_STAR_WORDS: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

function parseStarRating(value: string | number | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value) return null;
  const s = String(value).trim().toUpperCase();
  if (!s) return null;
  if (GOOGLE_STAR_WORDS[s] != null) return GOOGLE_STAR_WORDS[s];
  const m = s.match(/^(\d)/);
  return m ? Number(m[1]) : null;
}

export type SyncGoogleReviewsResult =
  | { ok: true; synced: number }
  | { ok: false; error: string; status?: number };

/**
 * Pull reviews from Google Business Profile API into `google_business_reviews`.
 * Caller should run `initSchema` first if needed.
 */
export async function syncGoogleBusinessReviewsForOrganization(
  organizationId: string
): Promise<SyncGoogleReviewsResult> {
  const profile = await getGoogleBusinessProfile(organizationId);
  if (!profile?.google_account_connected) {
    return { ok: false, error: "Google account not connected" };
  }
  const accountId = profile.account_id?.trim();
  const locationId = profile.location_id?.trim();
  if (!accountId || !locationId) {
    return { ok: false, error: "Business Profile location not configured" };
  }

  let accessToken: string;
  try {
    accessToken = await getGoogleBusinessAccessTokenForOrg(organizationId);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not refresh Google access token",
    };
  }

  const baseUrl = `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(
    accountId
  )}/locations/${encodeURIComponent(locationId)}/reviews`;

  let nextPageToken: string | null = null;
  let synced = 0;
  for (let page = 0; page < 20; page++) {
    const url = new URL(baseUrl);
    url.searchParams.set("pageSize", "50");
    if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: text || `Google API HTTP ${res.status}`,
        status: 502,
      };
    }
    const payload = (await res.json()) as {
      reviews?: GoogleReviewApiItem[];
      nextPageToken?: string;
    };
    const reviews = payload.reviews ?? [];
    for (const r of reviews) {
      const reviewId = parseReviewId(r.name);
      if (!reviewId) continue;
      await upsertGoogleBusinessReview({
        organization_id: organizationId,
        review_id: reviewId,
        reviewer_name: r.reviewer?.displayName ?? null,
        star_rating: parseStarRating(r.starRating),
        comment: r.comment ?? null,
        create_time: r.createTime ?? null,
        update_time: r.updateTime ?? null,
        raw: r as Record<string, unknown>,
      });
      synced++;
    }
    nextPageToken = payload.nextPageToken ?? null;
    if (!nextPageToken) break;
  }

  return { ok: true, synced };
}
