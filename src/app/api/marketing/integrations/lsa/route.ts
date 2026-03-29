import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { upsertMarketingOAuthCredentials, getMarketingOAuthRefreshToken } from "@/lib/db/marketingQueries";

export const dynamic = "force-dynamic";

/** Admin: store Google OAuth refresh token for Local Services / Ads API (scope must include adwords). */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    refreshToken?: string;
    metadata?: Record<string, unknown>;
  };
  const token = body.refreshToken?.trim();
  if (!token) {
    return NextResponse.json({ error: "refreshToken is required" }, { status: 400 });
  }

  await initSchema();
  await upsertMarketingOAuthCredentials({
    organizationId: session.user.organizationId,
    integration: "lsa",
    refreshToken: token,
    metadata: body.metadata ?? {},
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await initSchema();
  const connected = !!(await getMarketingOAuthRefreshToken(session.user.organizationId, "lsa"));
  return NextResponse.json({ connected });
}
