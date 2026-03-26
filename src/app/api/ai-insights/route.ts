export async function GET(request: Request) {
  // AI insights temporarily disabled.
  // Keep route in place so existing clients don't 404, but return a clear error.
  void request;
  const { NextResponse } = await import("next/server");
  return NextResponse.json({ error: "AI insights disabled" }, { status: 400 });
}
