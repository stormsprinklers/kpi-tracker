import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getNotificationsForUser, getUnreadNotificationCount } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/** GET /api/notifications - List notifications for current user. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const countOnly = searchParams.get("count") === "true";

  await initSchema();
  if (countOnly) {
    const count = await getUnreadNotificationCount(session.user.id);
    return NextResponse.json({ count });
  }

  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 100);
  const notifications = await getNotificationsForUser(session.user.id, limit);
  const count = await getUnreadNotificationCount(session.user.id);

  return NextResponse.json({ notifications, unreadCount: count });
}
