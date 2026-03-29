import type twilio from "twilio";

export async function createTranscriptFromRecording(params: {
  client: twilio.Twilio;
  recordingSid: string;
  serviceSid: string;
  customerKey?: string;
}): Promise<{ sid: string; status: string }> {
  const created = await params.client.intelligence.v2.transcripts.create({
    serviceSid: params.serviceSid,
    channel: {
      media_properties: {
        source_sid: params.recordingSid,
      },
    },
    customerKey: params.customerKey,
  });
  return { sid: created.sid, status: created.status ?? "queued" };
}

export async function fetchTranscriptStatus(
  client: twilio.Twilio,
  transcriptSid: string
): Promise<string> {
  const t = await client.intelligence.v2.transcripts(transcriptSid).fetch();
  return t.status ?? "unknown";
}

export async function fetchTranscriptFullText(
  client: twilio.Twilio,
  transcriptSid: string
): Promise<string> {
  const lines: string[] = [];
  let page = await client.intelligence.v2.transcripts(transcriptSid).sentences.page({ pageSize: 100 });
  for (;;) {
    for (const sentence of page.instances) {
      if (sentence.transcript) lines.push(sentence.transcript);
    }
    if (!page.nextPageUrl) break;
    const next = await page.nextPage();
    if (!next) break;
    page = next as typeof page;
  }
  return lines.join("\n").trim();
}
