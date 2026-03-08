import {
  handleWebhookGET,
  handleWebhookHEAD,
  handleWebhookOPTIONS,
  handleWebhookPOST,
} from "@/lib/webhookHandler";
import { getOrganizationById, insertWebhookLog } from "@/lib/db/queries";
import { initSchema } from "@/lib/db";

/** Allow up to 60s for webhook processing (cold start can be slow). */
export const maxDuration = 60;

async function logWebhookInRoute(organizationId: string, rawBody: string, request: Request) {
  console.log("[WH-DBG] ROUTE logWebhookInRoute", JSON.stringify({ organizationId, rawBodyLen: rawBody?.length }));
  try {
    await initSchema();
    const headersObj: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      headersObj[k] = v;
    });
    await insertWebhookLog({
      organizationId,
      source: "hcp",
      rawBody: rawBody || null,
      headers: headersObj,
      status: "processed",
      skipReason: null,
    });
    console.log("[WH-DBG] ROUTE insertWebhookLog succeeded", JSON.stringify({ organizationId }));
  } catch (err) {
    console.error("[WH-DBG] ROUTE insertWebhookLog FAILED", err);
  }
}

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
  const { organizationId } = await params;

  const rawBody = await request.text();
  const org = await getOrganizationById(organizationId);
  if (org) {
    await logWebhookInRoute(organizationId, rawBody, request);
  }

  const newRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: rawBody,
  });
  return handleWebhookPOST(newRequest, organizationId);
}
