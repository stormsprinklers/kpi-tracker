import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { bulkAssignGoogleBusinessReviews } from "@/lib/db/queries";

const MAX_ITEMS = 500;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { items?: { reviewId?: string; hcpEmployeeId?: string | null }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) {
    return NextResponse.json({ error: "items array is required" }, { status: 400 });
  }
  if (rawItems.length > MAX_ITEMS) {
    return NextResponse.json({ error: `At most ${MAX_ITEMS} assignments per request` }, { status: 400 });
  }

  const items: { review_id: string; hcp_employee_id: string | null }[] = [];
  for (const row of rawItems) {
    const review_id = typeof row.reviewId === "string" ? row.reviewId.trim() : "";
    if (!review_id) {
      return NextResponse.json({ error: "Each item must include reviewId" }, { status: 400 });
    }
    const hcp =
      row.hcpEmployeeId === null || row.hcpEmployeeId === undefined
        ? null
        : typeof row.hcpEmployeeId === "string"
          ? row.hcpEmployeeId.trim() || null
          : null;
    items.push({ review_id, hcp_employee_id: hcp });
  }

  try {
    await initSchema();
    await bulkAssignGoogleBusinessReviews(session.user.organizationId, items);
    return NextResponse.json({ ok: true, saved: items.length });
  } catch (err) {
    console.error("[bulk-assign reviews]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save assignments" },
      { status: 500 }
    );
  }
}
