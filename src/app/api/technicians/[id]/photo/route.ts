import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { put } from "@vercel/blob";
import { upsertTechnicianPhoto } from "@/lib/db/queries";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** POST /api/technicians/[id]/photo - Upload photo. Admin or self (technician). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: technicianId } = await params;
  if (!technicianId) {
    return NextResponse.json({ error: "Technician ID required" }, { status: 400 });
  }

  const isAdmin = session.user.role === "admin";
  const isSelf = session.user.hcpEmployeeId != null && String(session.user.hcpEmployeeId) === String(technicianId);
  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden: can only upload your own photo or admin can upload for any technician" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("photo") as File | null;
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No photo file provided" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type. Use JPEG, PNG, WebP, or GIF." }, { status: 400 });
  }

  try {
    const blob = await put(
      `technician-photos/${session.user.organizationId}/${technicianId}-${Date.now()}.${file.name.split(".").pop() ?? "jpg"}`,
      file,
      { access: "public" }
    );
    await upsertTechnicianPhoto(session.user.organizationId, technicianId, blob.url);
    return NextResponse.json({ photoUrl: blob.url });
  } catch (error) {
    console.error("[Technician Photo Upload] Error:", error);
    const msg = error instanceof Error ? error.message : "Upload failed";
    if (msg.includes("BLOB_READ_WRITE_TOKEN") || msg.includes("token")) {
      return NextResponse.json(
        { error: "Photo storage not configured. Add BLOB_READ_WRITE_TOKEN to your environment." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Failed to upload photo" }, { status: 500 });
  }
}
