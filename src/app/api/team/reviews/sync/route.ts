import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
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

export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await initSchema();
  const profile = await getGoogleBusinessProfile(session.user.organizationId);
  if (!profile?.google_account_connected) {
    return NextResponse.json(
      { error: "Connect a Google account with access to your Business Profile first." },
      { status: 400 }
    );
  }
  const accountId = profile.account_id?.trim();
  const locationId = profile.location_id?.trim();
  if (!accountId || !locationId) {
    return NextResponse.json(
      { error: "Select a Business Profile location before syncing." },
      { status: 400 }
    );
  }

  let accessToken: string;
  try {
    accessToken = await getGoogleBusinessAccessTokenForOrg(session.user.organizationId);
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Could not refresh Google access token";
    return NextResponse.json({ error: msg }, { status: 502 });
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
      return NextResponse.json(
        { error: "Google API sync failed", details: text || `HTTP ${res.status}` },
        { status: 502 }
      );
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
        organization_id: session.user.organizationId,
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

  return NextResponse.json({ ok: true, synced });
}
