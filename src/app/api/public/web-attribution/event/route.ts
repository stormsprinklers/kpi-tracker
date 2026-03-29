import { NextResponse } from "next/server";
import { initSchema } from "@/lib/db";
import {
  getWebAttributionInstallByKeyHash,
  getWebAttributionSourceByToken,
  insertWebAttributionEvents,
  touchWebAttributionEvent,
  type WebAttributionEventType,
} from "@/lib/db/webAttributionQueries";
import { hashIp, hashPublishableKey, normalizeOrigin } from "@/lib/webAttribution";

export const dynamic = "force-dynamic";

const EVENT_TYPES: WebAttributionEventType[] = [
  "landing",
  "page_view",
  "tel_click",
  "form_submit",
  "booking",
  "verify_ping",
];

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function withCors(origin: string | null, status = 200): NextResponse {
  const res = new NextResponse(null, { status });
  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  }
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

function consumeRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const state = rateBuckets.get(key);
  if (!state || state.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (state.count >= limit) return false;
  state.count += 1;
  return true;
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return withCors(origin, 204);
}

export async function POST(request: Request) {
  await initSchema();
  const originHeader = request.headers.get("origin");
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const body = (await request.json()) as {
    publishableKey?: string;
    events?: Array<{
      eventType?: string;
      visitorId?: string;
      sourceToken?: string | null;
      pageUrl?: string | null;
      referrer?: string | null;
      occurredAt?: string | null;
      metadata?: Record<string, unknown>;
    }>;
  };

  const publishableKey = body.publishableKey?.trim();
  if (!publishableKey) {
    return NextResponse.json({ error: "publishableKey is required" }, { status: 400 });
  }

  const install = await getWebAttributionInstallByKeyHash(hashPublishableKey(publishableKey));
  if (!install) {
    return NextResponse.json({ error: "Invalid publishable key" }, { status: 401 });
  }

  const normalizedOrigin = originHeader ? normalizeOrigin(originHeader) : null;
  if (install.allowed_origins.length > 0 && normalizedOrigin && !install.allowed_origins.includes(normalizedOrigin)) {
    return NextResponse.json({ error: "Origin is not allowed" }, { status: 403 });
  }

  const ipKey = hashIp(`${ipAddress}::${install.organization_id}`).slice(0, 24);
  if (!consumeRateLimit(`ip:${ipKey}`, 240, 60_000) || !consumeRateLimit(`org:${install.organization_id}`, 1500, 60_000)) {
    const res = NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    if (normalizedOrigin) {
      res.headers.set("Access-Control-Allow-Origin", normalizedOrigin);
      res.headers.set("Vary", "Origin");
    }
    return res;
  }

  const incoming = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  if (!incoming.length) {
    return NextResponse.json({ error: "events must be a non-empty array" }, { status: 400 });
  }

  const prepared = [];
  for (const event of incoming) {
    const eventType = (event.eventType ?? "").toString() as WebAttributionEventType;
    if (!EVENT_TYPES.includes(eventType)) continue;
    const visitorId = (event.visitorId ?? "").toString().trim().slice(0, 80);
    if (!visitorId) continue;
    let sourceId: string | null = null;
    const sourceToken = event.sourceToken?.toString().trim();
    if (sourceToken) {
      const source = await getWebAttributionSourceByToken(sourceToken);
      if (source?.organization_id === install.organization_id) sourceId = source.source_id;
    }
    prepared.push({
      organizationId: install.organization_id,
      sourceId,
      visitorId,
      eventType,
      occurredAt: event.occurredAt ?? null,
      pageUrl: event.pageUrl ?? null,
      referrer: event.referrer ?? null,
      userAgent: request.headers.get("user-agent"),
      ipHash: hashIp(ipAddress),
      country: request.headers.get("x-vercel-ip-country"),
      metadata: event.metadata ?? {},
    });
  }

  if (!prepared.length) {
    return NextResponse.json({ error: "No valid events submitted" }, { status: 400 });
  }

  await insertWebAttributionEvents(prepared);
  await touchWebAttributionEvent(install.organization_id);

  const res = NextResponse.json({ accepted: prepared.length });
  if (normalizedOrigin) {
    res.headers.set("Access-Control-Allow-Origin", normalizedOrigin);
    res.headers.set("Vary", "Origin");
  }
  return res;
}

