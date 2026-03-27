import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { assignGoogleBusinessReview } from "@/lib/db/queries";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { reviewId } = await params;
  if (!reviewId) {
    return NextResponse.json({ error: "reviewId required" }, { status: 400 });
  }

  let body: { hcpEmployeeId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hcpEmployeeId =
    body.hcpEmployeeId === null
      ? null
      : typeof body.hcpEmployeeId === "string"
      ? body.hcpEmployeeId.trim() || null
      : null;

  await initSchema();
  await assignGoogleBusinessReview({
    organization_id: session.user.organizationId,
    review_id: reviewId,
    assigned_hcp_employee_id: hcpEmployeeId,
  });

  return NextResponse.json({ ok: true });
}
