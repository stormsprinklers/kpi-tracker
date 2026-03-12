import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { markNotificationRead } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/** POST /api/notifications/[id]/read - Mark notification as read. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Notification id required" }, { status: 400 });

  await initSchema();
  await markNotificationRead(id, session.user.id);
  return NextResponse.json({ ok: true });
}
