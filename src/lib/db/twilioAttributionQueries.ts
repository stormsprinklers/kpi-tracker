import { sql } from "./index";

export interface WebAttributionPhoneNumberRow {
  id: string;
  organization_id: string;
  source_id: string;
  twilio_phone_number_sid: string;
  phone_e164: string;
  forward_to_e164: string;
  search_snapshot: Record<string, unknown>;
  created_at: string;
  released_at: string | null;
}

export async function findActivePhoneNumberByE164(
  phoneE164: string
): Promise<WebAttributionPhoneNumberRow | null> {
  const normalized = phoneE164.trim();
  const result = await sql`
    SELECT id, organization_id, source_id, twilio_phone_number_sid, phone_e164, forward_to_e164,
           search_snapshot, created_at, released_at
    FROM web_attribution_phone_numbers
    WHERE phone_e164 = ${normalized} AND released_at IS NULL
    LIMIT 1
  `;
  const row = (result.rows ?? [])[0] as WebAttributionPhoneNumberRow | undefined;
  if (!row) return null;
  return {
    ...row,
    search_snapshot:
      row.search_snapshot && typeof row.search_snapshot === "object"
        ? (row.search_snapshot as Record<string, unknown>)
        : {},
  };
}

export async function listActivePhoneNumbersForOrg(
  organizationId: string
): Promise<WebAttributionPhoneNumberRow[]> {
  const result = await sql`
    SELECT p.id, p.organization_id, p.source_id, p.twilio_phone_number_sid, p.phone_e164, p.forward_to_e164,
           p.search_snapshot, p.created_at, p.released_at
    FROM web_attribution_phone_numbers p
    WHERE p.organization_id = ${organizationId}::uuid AND p.released_at IS NULL
    ORDER BY p.created_at ASC
  `;
  return (result.rows ?? []).map((row) => {
    const r = row as WebAttributionPhoneNumberRow;
    return {
      ...r,
      search_snapshot:
        r.search_snapshot && typeof r.search_snapshot === "object"
          ? (r.search_snapshot as Record<string, unknown>)
          : {},
    };
  });
}

export async function insertWebAttributionPhoneNumber(params: {
  organizationId: string;
  sourceId: string;
  twilioPhoneNumberSid: string;
  phoneE164: string;
  forwardToE164: string;
  searchSnapshot: Record<string, unknown>;
}): Promise<WebAttributionPhoneNumberRow> {
  const result = await sql`
    INSERT INTO web_attribution_phone_numbers (
      organization_id, source_id, twilio_phone_number_sid, phone_e164, forward_to_e164, search_snapshot
    )
    VALUES (
      ${params.organizationId}::uuid,
      ${params.sourceId}::uuid,
      ${params.twilioPhoneNumberSid},
      ${params.phoneE164},
      ${params.forwardToE164},
      ${JSON.stringify(params.searchSnapshot)}::jsonb
    )
    RETURNING id, organization_id, source_id, twilio_phone_number_sid, phone_e164, forward_to_e164,
              search_snapshot, created_at, released_at
  `;
  const row = result.rows[0] as WebAttributionPhoneNumberRow;
  return {
    ...row,
    search_snapshot:
      row.search_snapshot && typeof row.search_snapshot === "object"
        ? (row.search_snapshot as Record<string, unknown>)
        : {},
  };
}

export async function releaseWebAttributionPhoneNumber(params: {
  organizationId: string;
  phoneNumberId: string;
}): Promise<void> {
  await sql`
    UPDATE web_attribution_phone_numbers
    SET released_at = NOW()
    WHERE organization_id = ${params.organizationId}::uuid
      AND id = ${params.phoneNumberId}::uuid
      AND released_at IS NULL
  `;
}

export async function getActivePhoneForSource(params: {
  organizationId: string;
  sourceId: string;
}): Promise<WebAttributionPhoneNumberRow | null> {
  const result = await sql`
    SELECT id, organization_id, source_id, twilio_phone_number_sid, phone_e164, forward_to_e164,
           search_snapshot, created_at, released_at
    FROM web_attribution_phone_numbers
    WHERE organization_id = ${params.organizationId}::uuid
      AND source_id = ${params.sourceId}::uuid
      AND released_at IS NULL
    LIMIT 1
  `;
  const row = (result.rows ?? [])[0] as WebAttributionPhoneNumberRow | undefined;
  if (!row) return null;
  return {
    ...row,
    search_snapshot:
      row.search_snapshot && typeof row.search_snapshot === "object"
        ? (row.search_snapshot as Record<string, unknown>)
        : {},
  };
}

export async function upsertTwilioTrackingCallFromRecording(params: {
  organizationId: string;
  sourceId: string | null;
  phoneNumberId: string | null;
  callSid: string;
  recordingSid: string | null;
  fromE164: string | null;
  toE164: string | null;
  durationSeconds: number | null;
  callbackPayload: Record<string, unknown>;
}): Promise<string> {
  const result = await sql`
    INSERT INTO twilio_tracking_calls (
      organization_id, source_id, phone_number_id, call_sid, recording_sid,
      from_e164, to_e164, duration_seconds, transcript_status, raw_callbacks
    )
    VALUES (
      ${params.organizationId}::uuid,
      ${params.sourceId ? `${params.sourceId}` : null}::uuid,
      ${params.phoneNumberId ? `${params.phoneNumberId}` : null}::uuid,
      ${params.callSid},
      ${params.recordingSid},
      ${params.fromE164},
      ${params.toE164},
      ${params.durationSeconds},
      'pending',
      ${JSON.stringify({ recording: params.callbackPayload })}::jsonb
    )
    ON CONFLICT (call_sid) DO UPDATE SET
      recording_sid = COALESCE(EXCLUDED.recording_sid, twilio_tracking_calls.recording_sid),
      duration_seconds = COALESCE(EXCLUDED.duration_seconds, twilio_tracking_calls.duration_seconds)
    RETURNING id
  `;
  return (result.rows[0] as { id: string }).id;
}

export async function updateTwilioTrackingCallTranscript(params: {
  callSid: string;
  intelligenceTranscriptSid: string | null;
  transcriptStatus: string;
  transcriptText?: string | null;
}): Promise<void> {
  await sql`
    UPDATE twilio_tracking_calls
    SET
      intelligence_transcript_sid = COALESCE(${params.intelligenceTranscriptSid}, intelligence_transcript_sid),
      transcript_status = ${params.transcriptStatus},
      transcript_text = COALESCE(${params.transcriptText ?? null}, transcript_text)
    WHERE call_sid = ${params.callSid}
  `;
}

export async function listTwilioTrackingCallsForOrg(
  organizationId: string,
  limit = 50
): Promise<
  Array<{
    id: string;
    call_sid: string;
    recording_sid: string | null;
    from_e164: string | null;
    to_e164: string | null;
    duration_seconds: number | null;
    transcript_status: string;
    transcript_preview: string | null;
    created_at: string;
    source_label: string | null;
  }>
> {
  const lim = Math.min(200, Math.max(1, limit));
  const result = await sql`
    SELECT
      t.id,
      t.call_sid,
      t.recording_sid,
      t.from_e164,
      t.to_e164,
      t.duration_seconds,
      t.transcript_status,
      LEFT(t.transcript_text, 200) AS transcript_preview,
      t.created_at,
      s.label AS source_label
    FROM twilio_tracking_calls t
    LEFT JOIN web_attribution_sources s ON s.id = t.source_id
    WHERE t.organization_id = ${organizationId}::uuid
    ORDER BY t.created_at DESC
    LIMIT ${lim}
  `;
  return (result.rows ?? []) as Array<{
    id: string;
    call_sid: string;
    recording_sid: string | null;
    from_e164: string | null;
    to_e164: string | null;
    duration_seconds: number | null;
    transcript_status: string;
    transcript_preview: string | null;
    created_at: string;
    source_label: string | null;
  }>;
}

export async function listTwilioCallsPendingTranscript(limit = 30): Promise<
  Array<{
    id: string;
    call_sid: string;
    recording_sid: string | null;
    intelligence_transcript_sid: string | null;
    transcript_status: string;
    organization_id: string;
  }>
> {
  const result = await sql`
    SELECT id, call_sid, recording_sid, intelligence_transcript_sid, transcript_status, organization_id
    FROM twilio_tracking_calls
    WHERE transcript_status IN ('pending', 'queued', 'in-progress')
      AND recording_sid IS NOT NULL
      AND created_at > NOW() - INTERVAL '7 days'
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
  return (result.rows ?? []) as Array<{
    id: string;
    call_sid: string;
    recording_sid: string | null;
    intelligence_transcript_sid: string | null;
    transcript_status: string;
    organization_id: string;
  }>;
}
