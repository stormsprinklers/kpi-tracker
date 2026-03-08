import {
  handleWebhookGET,
  handleWebhookHEAD,
  handleWebhookOPTIONS,
  handleWebhookPOST,
} from "@/lib/webhookHandler";

/** Allow up to 60s for webhook processing (cold start can be slow). */
export const maxDuration = 60;

export async function GET() {
  return handleWebhookGET();
}

export async function HEAD() {
  return handleWebhookHEAD();
}

export async function OPTIONS() {
  return handleWebhookOPTIONS();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  console.log("[WH-LIVE-CHECK] MAIN route /api/webhooks/[organizationId] version 2026-03-08-01");
  const { organizationId } = await params;
  return handleWebhookPOST(request, organizationId);
}
