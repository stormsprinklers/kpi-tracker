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

  try {
    const res = await fetch("https://api.housecallpro.com/company", {
      headers: {
        Accept: "application/json",
        Authorization: token,
        "Content-Type": "application/json",
      },
    });

    const body = await res.text();
    let parsedBody: unknown = body;
    try {
      parsedBody = body ? JSON.parse(body) : null;
    } catch {
      /* keep as string */
    }

    return NextResponse.json({
      ...diagnostic,
      status: res.status,
      statusText: res.statusText,
      responseBody: parsedBody,
    });
  } catch (err) {
    return NextResponse.json({
      ...diagnostic,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
