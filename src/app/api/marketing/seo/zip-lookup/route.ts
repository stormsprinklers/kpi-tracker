import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export interface ZipLookupResult {
  zip: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const zip = searchParams.get("zip")?.trim();
  if (!zip || !/^\d{5}(-\d{4})?$/.test(zip)) {
    return NextResponse.json(
      { error: "Valid 5-digit US zip code required" },
      { status: 400 }
    );
  }
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip.replace(/-\d{4}$/, "")}`);
    if (!res.ok) {
      return NextResponse.json(
        { error: "Zip code not found" },
        { status: 404 }
      );
    }
    const data = (await res.json()) as {
      "post code": string;
      places: Array<{
        "place name": string;
        "state abbreviation": string;
        latitude: string;
        longitude: string;
      }>;
    };
    const place = data.places?.[0];
    if (!place) {
      return NextResponse.json({ error: "Zip code not found" }, { status: 404 });
    }
    const result: ZipLookupResult = {
      zip: data["post code"],
      city: place["place name"],
      state: place["state abbreviation"],
      lat: parseFloat(place.latitude),
      lng: parseFloat(place.longitude),
    };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to look up zip code" },
      { status: 500 }
    );
  }
}
