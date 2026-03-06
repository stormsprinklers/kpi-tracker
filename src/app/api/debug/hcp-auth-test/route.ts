import { NextResponse } from "next/server";

/**
 * Debug route to diagnose Housecall Pro 401 auth issues.
 * Returns request config and API response without exposing the token.
 * GET /api/debug/hcp-auth-test
 */
export async function GET() {
  const token = process.env.HOUSECALLPRO_ACCESS_TOKEN;

  const diagnostic: Record<string, unknown> = {
    tokenPresent: !!token,
    tokenLength: token?.length ?? 0,
    authFormat: "raw",
    url: "https://api.housecallpro.com/company",
  };

  if (!token) {
    return NextResponse.json({
      ...diagnostic,
      error: "HOUSECALLPRO_ACCESS_TOKEN is not set",
    });
  }

  const url = "https://api.housecallpro.com/company";
  const baseHeaders = { Accept: "application/json", "Content-Type": "application/json" };

  try {
    // Try raw token (current format)
    const resRaw = await fetch(url, {
      headers: { ...baseHeaders, Authorization: token },
    });
    const bodyRaw = await resRaw.text();
    let parsedRaw: unknown = bodyRaw;
    try {
      parsedRaw = bodyRaw ? JSON.parse(bodyRaw) : null;
    } catch {
      /* keep as string */
    }

    // Try Bearer token (alternative format)
    const resBearer = await fetch(url, {
      headers: { ...baseHeaders, Authorization: `Bearer ${token}` },
    });
    const bodyBearer = await resBearer.text();
    let parsedBearer: unknown = bodyBearer;
    try {
      parsedBearer = bodyBearer ? JSON.parse(bodyBearer) : null;
    } catch {
      /* keep as string */
    }

    return NextResponse.json({
      ...diagnostic,
      raw: { status: resRaw.status, statusText: resRaw.statusText, responseBody: parsedRaw },
      bearer: { status: resBearer.status, statusText: resBearer.statusText, responseBody: parsedBearer },
    });
  } catch (err) {
    return NextResponse.json({
      ...diagnostic,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
