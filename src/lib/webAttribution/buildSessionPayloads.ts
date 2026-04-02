import type { WebAttributionSessionEventRow } from "@/lib/db/webAttributionQueries";

export type RecentWebAttributionSessionEvent = {
  id: string;
  event_type: string;
  occurred_at: string;
  page_url: string | null;
  source_label: string | null;
  referrer: string | null;
  metadata: Record<string, unknown>;
};

export type RecentWebAttributionSession = {
  visitor_id: string;
  started_at: string;
  last_activity_at: string;
  entry_source_label: string | null;
  entry_page_url: string | null;
  has_call: boolean;
  has_form: boolean;
  has_booking: boolean;
  event_count: number;
  events: RecentWebAttributionSessionEvent[];
};

export function buildRecentWebAttributionSessions(
  rows: WebAttributionSessionEventRow[]
): RecentWebAttributionSession[] {
  const map = new Map<string, WebAttributionSessionEventRow[]>();
  for (const r of rows) {
    const list = map.get(r.visitor_id) ?? [];
    list.push(r);
    map.set(r.visitor_id, list);
  }

  const sessions: RecentWebAttributionSession[] = [];

  for (const events of map.values()) {
    events.sort(
      (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
    );
    const first = events[0];
    const last = events[events.length - 1];
    const entrySource =
      events.find((e) => (e.source_label ?? "").trim().length > 0)?.source_label ?? null;

    const entryPage =
      events.find((e) => (e.page_url ?? "").trim().length > 0)?.page_url ?? null;

    sessions.push({
      visitor_id: first.visitor_id,
      started_at: first.occurred_at,
      last_activity_at: last.occurred_at,
      entry_source_label: entrySource,
      entry_page_url: entryPage,
      has_call: events.some((e) => e.event_type === "tel_click"),
      has_form: events.some((e) => e.event_type === "form_submit"),
      has_booking: events.some((e) => e.event_type === "booking"),
      event_count: events.length,
      events: events.map((e) => ({
        id: e.id,
        event_type: e.event_type,
        occurred_at: e.occurred_at,
        page_url: e.page_url,
        source_label: e.source_label,
        referrer: e.referrer,
        metadata: e.metadata,
      })),
    });
  }

  sessions.sort(
    (a, b) =>
      new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
  );

  return sessions;
}
