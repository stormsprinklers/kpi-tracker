import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { markAllNotificationsRead } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/** POST /api/notifications/read-all - Mark all notifications as read. */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initSchema();
  await markAllNotificationsRead(session.user.id);
  return NextResponse.json({ ok: true });
}
