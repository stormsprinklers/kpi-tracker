import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { setMarketingSyncSuccess } from "@/lib/db/marketingQueries";

export const dynamic = "force-dynamic";

/**
 * Placeholder: Search Console OAuth + daily pull is not wired yet.
 * Returns 200 with `skipped: true` so the UI can offer "Sync" without failing.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await initSchema();
  await setMarketingSyncSuccess({
    organizationId: session.user.organizationId,
    integration: "search_console",
    cursorJson: {
      skipped: true,
      message:
        "Search Console API sync is not enabled yet. Configure site URL under Settings → SEO → Marketing analytics; OAuth coming later.",
    },
  });

  return NextResponse.json({
    ok: true,
    skipped: true,
    message:
      "Search Console automated sync is not enabled yet. Organic visibility still uses SEO rankings; GSC clicks can be added in a future release.",
  });
}
