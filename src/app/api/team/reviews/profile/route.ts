import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import {
  getGoogleBusinessProfile,
  upsertGoogleBusinessProfile,
} from "@/lib/db/queries";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await initSchema();
  const profile = await getGoogleBusinessProfile(session.user.organizationId);
  return NextResponse.json({ profile });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { accountId?: string; locationId?: string; locationName?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const accountId = String(body.accountId ?? "").trim();
  const locationId = String(body.locationId ?? "").trim();
  const locationName =
    body.locationName == null ? null : String(body.locationName).trim() || null;

  if (!accountId || !locationId) {
    return NextResponse.json(
      { error: "accountId and locationId are required" },
      { status: 400 }
    );
  }

  await initSchema();
  await upsertGoogleBusinessProfile({
    organization_id: session.user.organizationId,
    account_id: accountId,
    location_id: locationId,
    location_name: locationName,
  });

  return NextResponse.json({ ok: true });
}
