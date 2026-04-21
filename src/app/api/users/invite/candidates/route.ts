import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getEmployeeInviteCandidates } from "@/lib/db/queries";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    await initSchema();
    const candidates = await getEmployeeInviteCandidates(session.user.organizationId);
    return NextResponse.json({ candidates });
  } catch (err) {
    console.error("[users/invite/candidates]", err);
    return NextResponse.json({ error: "Failed to load candidates" }, { status: 500 });
  }
}
