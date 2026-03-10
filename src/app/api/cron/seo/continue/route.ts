import { NextResponse } from "next/server";
import { initSchema } from "@/lib/db";
import { fetchAndCacheSeoForOrg } from "@/lib/seo/fetchSeoForOrg";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth === `Bearer ${secret}`) return true;
  }
  return false;
}

/** POST /api/cron/seo/continue - Process next chunk of SEO fetch. Called by fetchAndCacheSeoForOrg. */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { orgId?: string; fingerprint?: string; nextChunkIndex?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { orgId, fingerprint, nextChunkIndex } = body;
  if (!orgId || typeof nextChunkIndex !== "number" || nextChunkIndex < 1) {
    return NextResponse.json(
      { error: "Missing orgId or nextChunkIndex" },
      { status: 400 }
    );
  }

  await initSchema();

  const result = await fetchAndCacheSeoForOrg(orgId, {
    chunkIndex: nextChunkIndex,
    triggerContinue: true,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Fetch failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, chunkIndex: nextChunkIndex });
}
