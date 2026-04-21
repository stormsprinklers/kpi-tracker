import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getMarketingAdChannelVisibility,
  getMarketingOrgSettings,
  setMarketingAdChannelVisibility,
  upsertMarketingOrgSettings,
} from "@/lib/db/marketingQueries";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await initSchema();
  const [row, adChannels] = await Promise.all([
    getMarketingOrgSettings(session.user.organizationId),
    getMarketingAdChannelVisibility(session.user.organizationId),
  ]);
  return NextResponse.json({
    searchConsoleSiteUrl: row?.search_console_site_url ?? "",
    ga4PropertyId: row?.ga4_property_id ?? "",
    adChannels,
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    searchConsoleSiteUrl?: string | null;
    ga4PropertyId?: string | null;
    adChannelEnabled?: Record<string, boolean>;
  };

  await initSchema();
  const existing = await getMarketingOrgSettings(session.user.organizationId);
  await upsertMarketingOrgSettings({
    organizationId: session.user.organizationId,
    searchConsoleSiteUrl:
      body.searchConsoleSiteUrl !== undefined
        ? body.searchConsoleSiteUrl?.trim() || null
        : (existing?.search_console_site_url ?? null),
    ga4PropertyId:
      body.ga4PropertyId !== undefined
        ? body.ga4PropertyId?.trim() || null
        : (existing?.ga4_property_id ?? null),
  });
  if (body.adChannelEnabled && typeof body.adChannelEnabled === "object") {
    const allowed = await getMarketingAdChannelVisibility(session.user.organizationId);
    const allowedSet = new Set(allowed.map((c) => c.slug));
    for (const [slug, enabled] of Object.entries(body.adChannelEnabled)) {
      if (!allowedSet.has(slug)) continue;
      await setMarketingAdChannelVisibility(
        session.user.organizationId,
        slug,
        enabled === true
      );
    }
  }

  const [row, adChannels] = await Promise.all([
    getMarketingOrgSettings(session.user.organizationId),
    getMarketingAdChannelVisibility(session.user.organizationId),
  ]);
  return NextResponse.json({
    searchConsoleSiteUrl: row?.search_console_site_url ?? "",
    ga4PropertyId: row?.ga4_property_id ?? "",
    adChannels,
  });
}
