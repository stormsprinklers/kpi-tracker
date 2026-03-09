import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTechnicianPhotos } from "@/lib/db/queries";

/** GET /api/technicians/photos?ids=id1,id2 - Returns photo URLs for technicians. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids") ?? "";
  const ids = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : [];

  if (ids.length === 0) {
    return NextResponse.json({ photos: {} });
  }

  try {
    const photos = await getTechnicianPhotos(session.user.organizationId, ids);
    return NextResponse.json({ photos });
  } catch (error) {
    console.error("[Technician Photos] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch technician photos" },
      { status: 500 }
    );
  }
}
