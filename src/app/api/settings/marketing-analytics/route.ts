import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getMarketingOrgSettings,
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
  const row = await getMarketingOrgSettings(session.user.organizationId);
  return NextResponse.json({
    searchConsoleSiteUrl: row?.search_console_site_url ?? "",
    ga4PropertyId: row?.ga4_property_id ?? "",
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

  const row = await getMarketingOrgSettings(session.user.organizationId);
  return NextResponse.json({
    searchConsoleSiteUrl: row?.search_console_site_url ?? "",
    ga4PropertyId: row?.ga4_property_id ?? "",
  });
}
