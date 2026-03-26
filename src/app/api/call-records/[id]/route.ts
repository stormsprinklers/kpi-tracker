import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { updateCallRecordForAdmin } from "@/lib/db/queries";

const VALID_BOOKING = new Set(["won", "lost", "non-opportunity"]);

/** PATCH /api/call-records/[id] - Admin-only: update CSR assignment + booking type. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: { hcpEmployeeId?: string | null; bookingValue?: string | null };
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
        : undefined;
  const bookingValueRaw =
    body.bookingValue == null ? undefined : String(body.bookingValue).trim();
  const bookingValue =
    bookingValueRaw === undefined
      ? undefined
      : VALID_BOOKING.has(bookingValueRaw)
        ? (bookingValueRaw as "won" | "lost" | "non-opportunity")
        : null;

  if (bookingValue === null) {
    return NextResponse.json(
      { error: "bookingValue must be won, lost, or non-opportunity" },
      { status: 400 }
    );
  }
  if (hcpEmployeeId === undefined && bookingValue === undefined) {
    return NextResponse.json(
      { error: "hcpEmployeeId or bookingValue required" },
      { status: 400 }
    );
  }

  await initSchema();
  await updateCallRecordForAdmin(session.user.organizationId, id, {
    ...(hcpEmployeeId !== undefined ? { hcp_employee_id: hcpEmployeeId } : {}),
    ...(bookingValue !== undefined ? { booking_value: bookingValue } : {}),
  });

  return NextResponse.json({ ok: true });
}

