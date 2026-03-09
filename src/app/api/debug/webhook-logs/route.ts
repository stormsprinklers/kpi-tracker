import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getWebhookLogs } from "@/lib/db/queries";

/**
 * GET /api/debug/webhook-logs
 * Returns recent webhook logs (raw payload, headers) for the current organization.
 * Requires auth. Used by Developer Console for debugging GHL/webhook issues.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 100);

  try {
    await initSchema(); // Ensure table exists before query
    const logs = await getWebhookLogs(session.user.organizationId, limit);
    // #region agent log
    console.log("[WH-DBG] H3 API returning logs", JSON.stringify({ hypothesisId: "H3", organizationId: session.user.organizationId, logCount: logs.length }));
    // #endregion
    return NextResponse.json({
      logs,
      organizationId: session.user.organizationId,
      ok: true,
    });
  } catch (err) {
    console.error("[webhook-logs] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch webhook logs" },
      { status: 500 }
    );
  }
}
