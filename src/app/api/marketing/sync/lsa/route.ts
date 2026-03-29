import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { syncLsaAccountReportsForOrganization } from "@/lib/marketing/lsaSync";

export const dynamic = "force-dynamic";

function defaultRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 13);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { startDate?: string; endDate?: string } = {};
  try {
    body = (await request.json().catch(() => ({}))) as typeof body;
  } catch {
    /* ignore */
  }
  const dr = defaultRange();
  const startDate = body.startDate?.slice(0, 10) ?? dr.start;
  const endDate = body.endDate?.slice(0, 10) ?? dr.end;

  await initSchema();
  const result = await syncLsaAccountReportsForOrganization(
    session.user.organizationId,
    startDate,
    endDate
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }
  return NextResponse.json({ ok: true, startDate, endDate });
}
