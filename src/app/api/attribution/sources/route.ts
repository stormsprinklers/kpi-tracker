import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  archiveWebAttributionSource,
  createWebAttributionSource,
  listWebAttributionSources,
} from "@/lib/db/webAttributionQueries";
import { ensureWebAttributionDefaultSources } from "@/lib/webAttribution/defaultSources";
import { createSourceToken } from "@/lib/webAttribution";

export const dynamic = "force-dynamic";

function normalizeLabel(input: string): string {
  return input.trim().slice(0, 60);
}

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await initSchema();
  const orgId = session.user.organizationId;
  await ensureWebAttributionDefaultSources(orgId);
  const rows = await listWebAttributionSources(orgId);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  await initSchema();
  const body = (await request.json()) as { label?: string; slug?: string };
  const label = normalizeLabel(body.label ?? "");
  if (!label) {
    return NextResponse.json({ error: "Label is required." }, { status: 400 });
  }
  const slug = normalizeSlug(body.slug || label || "custom");
  if (!slug) {
    return NextResponse.json({ error: "Invalid slug." }, { status: 400 });
  }
  const created = await createWebAttributionSource({
    organizationId: session.user.organizationId,
    slug,
    label,
    publicToken: createSourceToken(),
  });
  return NextResponse.json(created);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  await initSchema();
  const { searchParams } = new URL(request.url);
  const sourceId = searchParams.get("sourceId");
  if (!sourceId) {
    return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
  }
  await archiveWebAttributionSource({
    organizationId: session.user.organizationId,
    sourceId,
  });
  return NextResponse.json({ success: true });
}

