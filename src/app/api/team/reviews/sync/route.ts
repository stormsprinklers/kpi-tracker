import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getGoogleBusinessProfile,
  upsertGoogleBusinessReview,
} from "@/lib/db/queries";

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

function parseStarRating(value: string | number | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value) return null;
  const s = String(value).trim().toUpperCase();
  if (!s) return null;
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
  if (!profile) {
    return NextResponse.json(
      { error: "Google Business Profile not linked" },
      { status: 400 }
    );
  }

  const accessToken = process.env.GOOGLE_BUSINESS_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing GOOGLE_BUSINESS_ACCESS_TOKEN" },
      { status: 500 }
    );
  }

  const baseUrl = `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(
    profile.account_id
  )}/locations/${encodeURIComponent(profile.location_id)}/reviews`;

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
