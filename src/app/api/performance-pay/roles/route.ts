import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { createPerformancePayRole } from "@/lib/db/queries";

/** POST /api/performance-pay/roles - Create custom role (admin only). */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await initSchema();
  const body = (await request.json()) as { name?: string };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const role = await createPerformancePayRole(session.user.organizationId, name);
  return NextResponse.json(role);
}
