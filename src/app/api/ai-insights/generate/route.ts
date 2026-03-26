export async function POST(request: Request) {
  // AI insights temporarily disabled.
  void request;
  const { NextResponse } = await import("next/server");
  return NextResponse.json({ error: "AI insights disabled" }, { status: 400 });
}
