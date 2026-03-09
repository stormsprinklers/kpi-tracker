import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getOrganizationById,
  getSeoConfig,
  getSeoServiceAreas,
  updateOrganizationSeoSettings,
  setSeoConfig,
  setSeoServiceAreas,
} from "@/lib/db/queries";

const MAX_KEYWORDS = 10;
const MAX_LOCATIONS = 50;

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await initSchema();
  const org = await getOrganizationById(session.user.organizationId);
  const seo = await getSeoConfig(session.user.organizationId);
  const serviceAreas = await getSeoServiceAreas(session.user.organizationId);
  return NextResponse.json({
    website: org?.website ?? "",
    seo_business_name: org?.seo_business_name ?? org?.name ?? "",
    keywords: seo.keywords,
    locations: seo.locations,
    serviceAreas: serviceAreas.map((a) => ({
      id: a.id,
      name: a.name,
      location_values: a.location_values,
    })),
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await initSchema();

  const body = (await request.json()) as {
    website?: string | null;
    seo_business_name?: string | null;
    keywords?: string[];
    locations?: (string | number)[];
    serviceAreas?: { id?: string; name: string; location_values: string[] }[];
  };

  const keywords = Array.isArray(body.keywords)
    ? body.keywords
        .map((k) => (typeof k === "string" ? k.trim() : String(k).trim()))
        .filter(Boolean)
    : undefined;
  const locations = Array.isArray(body.locations)
    ? body.locations.map((c) => (typeof c === "number" ? String(c) : c))
    : undefined;

  if (keywords && keywords.length > MAX_KEYWORDS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_KEYWORDS} keywords allowed` },
      { status: 400 }
    );
  }
  if (locations && locations.length > MAX_LOCATIONS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_LOCATIONS} locations allowed` },
      { status: 400 }
    );
  }

  const orgId = session.user.organizationId;

  if (
    body.website !== undefined ||
    body.seo_business_name !== undefined
  ) {
    await updateOrganizationSeoSettings(orgId, {
      website: body.website,
      seo_business_name: body.seo_business_name,
    });
  }

  if (keywords !== undefined || locations !== undefined) {
    const current = await import("@/lib/db/queries").then((q) =>
      q.getSeoConfig(orgId)
    );
    await setSeoConfig(orgId, {
      keywords: keywords ?? current.keywords,
      locations: locations ?? current.locations,
    });
  }

  if (body.serviceAreas !== undefined) {
    await setSeoServiceAreas(orgId, body.serviceAreas);
  }

  return NextResponse.json({ success: true });
}
