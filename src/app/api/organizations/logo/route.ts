import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { put } from "@vercel/blob";
import { getOrganizationById, upsertOrganizationLogo } from "@/lib/db/queries";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB for logo
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** GET /api/organizations/logo - Get current org logo URL. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const org = await getOrganizationById(session.user.organizationId);
  return NextResponse.json({ logoUrl: org?.logo_url ?? null });
}

/** POST /api/organizations/logo - Upload company logo. Admin only. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("photo") as File | null;
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No photo file provided" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type. Use JPEG, PNG, WebP, or GIF." }, { status: 400 });
  }

  try {
    const blob = await put(
      `org-logos/${session.user.organizationId}-${Date.now()}.${file.name.split(".").pop() ?? "jpg"}`,
      file,
      { access: "public" }
    );
    await upsertOrganizationLogo(session.user.organizationId, blob.url);
    return NextResponse.json({ logoUrl: blob.url });
  } catch (error) {
    console.error("[Org Logo Upload] Error:", error);
    const msg = error instanceof Error ? error.message : "Upload failed";
    if (msg.includes("BLOB_READ_WRITE_TOKEN") || msg.includes("token")) {
      return NextResponse.json(
        { error: "Photo storage not configured. Add BLOB_READ_WRITE_TOKEN to your environment." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Failed to upload logo" }, { status: 500 });
  }
}
