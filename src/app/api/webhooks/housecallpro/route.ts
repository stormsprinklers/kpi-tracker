import { NextResponse } from "next/server";

const GONE_MESSAGE = {
  error: "Webhook URL has changed",
  message:
    "Use your organization-specific URL from Settings. Format: {baseUrl}/api/webhooks/{organizationId}",
};

export async function GET() {
  return NextResponse.json(GONE_MESSAGE, { status: 410 });
}

export async function HEAD() {
  return new NextResponse(null, { status: 410 });
}

export async function OPTIONS() {
  return NextResponse.json(GONE_MESSAGE, { status: 410 });
}

export async function POST() {
  return NextResponse.json(GONE_MESSAGE, { status: 410 });
}
