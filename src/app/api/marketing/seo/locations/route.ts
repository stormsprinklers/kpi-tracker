import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initSchema } from "@/lib/db";
import { getLocationsCache, setLocationsCache } from "@/lib/db/queries";
import { fetchLocations } from "@/lib/dataforseo";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") ?? "us";
  const cacheKey = `locations:${country}`;

  await initSchema();
  const cached = await getLocationsCache(cacheKey);
  if (cached != null) {
    return NextResponse.json(cached);
  }

  try {
    const locations = await fetchLocations(country);
    await setLocationsCache(cacheKey, locations);
    return NextResponse.json(locations);
  } catch (err) {
    console.error("DataForSEO locations error:", err);
    return NextResponse.json(
      { error: "Failed to load locations. Ensure DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are set." },
      { status: 500 }
    );
  }
}
