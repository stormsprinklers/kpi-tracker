"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_IVR_PROMPT_TEMPLATE } from "@/lib/twilio/ivrSayText";

type Source = {
  id: string;
  slug: string;
  label: string;
  public_token: string;
};

type InstallResponse = {
  publishableKey: string | null;
  allowedOrigins: string[];
  verifiedAt: string | null;
  lastEventAt: string | null;
  website: string;
  defaultForwardE164: string | null;
  twilioIntelligenceServiceSid: string | null;
  twilioSubaccountSid: string | null;
  twilioSubaccountCreatedAt: string | null;
  callTrackingIvrEnabled?: boolean;
  callTrackingIvrPrompt?: string | null;
};

type EventsResponse = {
  recentEvents: Array<{
    id: string;
    source_label: string | null;
    event_type: string;
    occurred_at: string;
    page_url: string | null;
  }>;
  counts30d: Record<string, number>;
};

type ActivePhone = {
  id: string;
  source_id: string;
  phone_e164: string;
  forward_to_e164: string;
};

type TwilioCallRow = {
  id: string;
  call_sid: string;
  recording_sid: string | null;
  recording_media_url: string | null;
  phone_number_id: string | null;
  tracking_number_e164: string | null;
  forward_to_e164: string | null;
  from_e164: string | null;
  to_e164: string | null;
  duration_seconds: number | null;
  transcript_status: string;
  transcript_preview: string | null;
  created_at: string;
  source_label: string | null;
};

type SearchNumber = { phone_number: string; friendly_name?: string; locality?: string; region?: string };

type UnassignedTwilioNumber = { sid: string; phone_number: string; friendly_name: string | null };

const WIZARD_STEPS = [
  {
    title: "How attribution works",
    short: "Overview",
  },
  {
    title: "Your website & allowed origins",
    short: "Site security",
  },
  {
    title: "Install the tracking snippet",
    short: "Snippet",
  },
  {
    title: "Tracking links per channel",
    short: "Links",
  },
  {
    title: "Call tracking (Twilio)",
    short: "Phones",
  },
  {
    title: "Verify & monitor",
    short: "Verify",
  },
] as const;

const WIZARD_STEP_STORAGE_KEY = "kpi-attribution-wizard-step-v1";

function readStoredWizardStep(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(WIZARD_STEP_STORAGE_KEY);
  const n = raw != null ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isInteger(n) || n < 0 || n >= WIZARD_STEPS.length) return null;
  return n;
}

function normalizeWebsite(input: string): string {
  if (!input.trim()) return "";
  const value = input.trim();
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://${value}`;
}

export function AttributionInsightsClient() {
  const [step, setStep] = useState(0);
  const [install, setInstall] = useState<InstallResponse | null>(null);
  const [newPublishableKey, setNewPublishableKey] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [events, setEvents] = useState<EventsResponse | null>(null);
  const [newSourceName, setNewSourceName] = useState("");
  const [allowedOriginsText, setAllowedOriginsText] = useState("");
  const [savingOrigins, setSavingOrigins] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePhones, setActivePhones] = useState<ActivePhone[]>([]);
  const [twilioCalls, setTwilioCalls] = useState<TwilioCallRow[]>([]);
  const [defaultForwardInput, setDefaultForwardInput] = useState("");
  const [intelligenceSidInput, setIntelligenceSidInput] = useState("");
  const [callTrackingIvrEnabledInput, setCallTrackingIvrEnabledInput] = useState(false);
  const [callTrackingIvrPromptInput, setCallTrackingIvrPromptInput] = useState("");
  const [savingCallSettings, setSavingCallSettings] = useState(false);
  const [searchAreaCode, setSearchAreaCode] = useState("");
  const [searchLocality, setSearchLocality] = useState("");
  const [searchRegion, setSearchRegion] = useState("");
  const [searchResults, setSearchResults] = useState<SearchNumber[]>([]);
  const [provisionSourceId, setProvisionSourceId] = useState("");
  const [provisionForwardOverride, setProvisionForwardOverride] = useState("");
  /** Twilio incoming numbers on the account not yet linked in web_attribution_phone_numbers (admin). */
  const [unassignedTwilio, setUnassignedTwilio] = useState<UnassignedTwilioNumber[]>([]);
  /** From unassigned API: helps tell “wrong Twilio account” vs “all numbers already linked”. */
  const [unassignedTwilioListedCount, setUnassignedTwilioListedCount] = useState<number | null>(null);
  const [subaccountBusy, setSubaccountBusy] = useState(false);
  /** Optional: Twilio Console subaccount Auth Token when API-only parent cannot auto-issue a webhook token. */
  const [manualSubaccountAuthToken, setManualSubaccountAuthToken] = useState("");
  /** First load finished (success or failure). Without this, a failed load left install=null and UI stuck on loading forever. */
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const [expandedCallIds, setExpandedCallIds] = useState<Set<string>>(() => new Set());
  const [callDetails, setCallDetails] = useState<
    Record<string, { transcript_text: string | null; error?: string }>
  >({});
  const detailLoadedRef = useRef<Set<string>>(new Set());

  const setWizardStep = useCallback((next: number | ((prev: number) => number)) => {
    setStep((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      const clamped = Math.max(0, Math.min(WIZARD_STEPS.length - 1, resolved));
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(WIZARD_STEP_STORAGE_KEY, String(clamped));
        } catch {
          /* quota / private mode */
        }
      }
      return clamped;
    });
  }, []);

  const LOAD_TIMEOUT_MS = 60_000;

  async function loadAll() {
    setError(null);
    const controller = new AbortController();
    const timeoutId =
      typeof window !== "undefined" ? window.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS) : 0;
    const fetchOpts: RequestInit = { cache: "no-store", signal: controller.signal };

    async function responseErrorMessage(res: Response, label: string): Promise<string> {
      try {
        const j = (await res.clone().json()) as { error?: string };
        if (j?.error && typeof j.error === "string") return `${label}: ${j.error}`;
      } catch {
        /* ignore */
      }
      return `${label} failed (HTTP ${res.status})`;
    }

    try {
      const [installRes, sourceRes, eventsRes, activeRes, callsRes, unassignedRes] = await Promise.all([
        fetch("/api/attribution/install", fetchOpts),
        fetch("/api/attribution/sources", fetchOpts),
        fetch("/api/attribution/events", fetchOpts),
        fetch("/api/attribution/phone-numbers/active", fetchOpts),
        fetch("/api/attribution/twilio-calls?limit=150", fetchOpts),
        fetch("/api/attribution/phone-numbers/unassigned", fetchOpts),
      ]);

      if (!installRes.ok) {
        throw new Error(await responseErrorMessage(installRes, "Attribution install"));
      }
      if (!sourceRes.ok) {
        throw new Error(await responseErrorMessage(sourceRes, "Sources"));
      }
      if (!eventsRes.ok) {
        throw new Error(await responseErrorMessage(eventsRes, "Events"));
      }

      const installJson = (await installRes.json()) as InstallResponse & {
        twilioSubaccountSid?: string | null;
        twilioSubaccountCreatedAt?: string | null;
      };
      setInstall({
        ...installJson,
        twilioSubaccountSid: installJson.twilioSubaccountSid ?? null,
        twilioSubaccountCreatedAt: installJson.twilioSubaccountCreatedAt ?? null,
        callTrackingIvrEnabled: installJson.callTrackingIvrEnabled ?? false,
        callTrackingIvrPrompt: installJson.callTrackingIvrPrompt ?? null,
      });
      setAllowedOriginsText((installJson.allowedOrigins ?? []).join("\n"));
      setDefaultForwardInput(installJson.defaultForwardE164 ?? "");
      setIntelligenceSidInput(installJson.twilioIntelligenceServiceSid ?? "");
      setCallTrackingIvrEnabledInput(Boolean(installJson.callTrackingIvrEnabled));
      setCallTrackingIvrPromptInput(installJson.callTrackingIvrPrompt ?? "");
      if (installJson.publishableKey) setNewPublishableKey(installJson.publishableKey);
      setSources((await sourceRes.json()) as Source[]);
      setEvents((await eventsRes.json()) as EventsResponse);
      let activeList: ActivePhone[] = [];
      if (activeRes.ok) {
        const a = (await activeRes.json()) as { active: ActivePhone[] };
        activeList = a.active ?? [];
        setActivePhones(activeList);
      } else {
        setActivePhones([]);
      }
      if (callsRes.ok) {
        const c = (await callsRes.json()) as { calls: TwilioCallRow[] };
        setTwilioCalls(c.calls ?? []);
      } else {
        setTwilioCalls([]);
      }
      if (unassignedRes.ok) {
        const u = (await unassignedRes.json()) as {
          unassigned?: UnassignedTwilioNumber[];
          twilioListedCount?: number;
        };
        setUnassignedTwilio(u.unassigned ?? []);
        setUnassignedTwilioListedCount(typeof u.twilioListedCount === "number" ? u.twilioListedCount : null);
      } else {
        setUnassignedTwilio([]);
        setUnassignedTwilioListedCount(null);
      }
      detailLoadedRef.current.clear();
      setCallDetails({});
      setExpandedCallIds(new Set());

      const storedStep = readStoredWizardStep();
      if (storedStep !== null) {
        setStep(storedStep);
      } else if (activeList.length > 0 || installJson.twilioSubaccountSid) {
        const last = WIZARD_STEPS.length - 1;
        setStep(last);
        try {
          window.localStorage.setItem(WIZARD_STEP_STORAGE_KEY, String(last));
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      const aborted =
        e instanceof DOMException
          ? e.name === "AbortError"
          : e instanceof Error && (e.name === "AbortError" || e.message.includes("aborted"));
      const msg = aborted
        ? "Loading took too long or was cancelled. Check your connection and try again."
        : e instanceof Error
          ? e.message
          : "Failed to load attribution.";
      setError(msg);
      throw e;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      setInitialLoadComplete(true);
    }
  }

  useEffect(() => {
    void loadAll().catch(() => {
      /* error already in state */
    });
  }, []);

  const websiteBase = useMemo(() => normalizeWebsite(install?.website ?? ""), [install?.website]);
  const snippet = useMemo(() => {
    const appUrl =
      ((process.env.NEXT_PUBLIC_APP_URL as string | undefined) ||
        (typeof window !== "undefined" ? window.location.origin : ""))
        .replace(/\/$/, "");
    const key = newPublishableKey ?? "REPLACE_WITH_PUBLISHABLE_KEY";
    return `<script defer src="${appUrl}/attribution.js" data-key="${key}"></script>`;
  }, [newPublishableKey]);

  const hasOrigins = allowedOriginsText.split("\n").some((s) => s.trim());
  const hasReceivedEvents = !!install?.lastEventAt;

  const phonesBySourceId = useMemo(() => {
    const m = new Map<string, ActivePhone[]>();
    for (const p of activePhones) {
      const list = m.get(p.source_id) ?? [];
      list.push(p);
      m.set(p.source_id, list);
    }
    return m;
  }, [activePhones]);

  const callsGrouped = useMemo(() => {
    const byPhone = new Map<string, TwilioCallRow[]>();
    const unassigned: TwilioCallRow[] = [];
    const sortCalls = (a: TwilioCallRow, b: TwilioCallRow) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    for (const c of twilioCalls) {
      if (c.phone_number_id) {
        const arr = byPhone.get(c.phone_number_id) ?? [];
        arr.push(c);
        byPhone.set(c.phone_number_id, arr);
      } else {
        unassigned.push(c);
      }
    }
    for (const arr of byPhone.values()) arr.sort(sortCalls);
    unassigned.sort(sortCalls);
    return { byPhone, unassigned };
  }, [twilioCalls]);

  const toggleExpandedCall = useCallback((callId: string) => {
    setExpandedCallIds((prev) => {
      const next = new Set(prev);
      const wasOpen = next.has(callId);
      if (wasOpen) {
        next.delete(callId);
        return next;
      }
      next.add(callId);
      if (!detailLoadedRef.current.has(callId)) {
        detailLoadedRef.current.add(callId);
        void (async () => {
          try {
            const res = await fetch(`/api/attribution/twilio-calls/${callId}`, { credentials: "include" });
            const data = res.ok
              ? ((await res.json()) as { call?: { transcript_text: string | null } })
              : null;
            setCallDetails((d) => ({
              ...d,
              [callId]: {
                transcript_text: data?.call?.transcript_text ?? null,
                error: res.ok ? undefined : "Could not load transcript",
              },
            }));
          } catch {
            setCallDetails((d) => ({
              ...d,
              [callId]: { transcript_text: null, error: "Could not load transcript" },
            }));
          }
        })();
      }
      return next;
    });
  }, []);

  async function copyAttributionText(text: string) {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  async function saveOrigins() {
    setSavingOrigins(true);
    setError(null);
    try {
      const allowedOrigins = allowedOriginsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/attribution/install", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedOrigins }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to save origins");
      setInstall((prev) =>
        prev
          ? {
              ...prev,
              allowedOrigins: data.allowedOrigins,
              verifiedAt: data.verifiedAt,
              lastEventAt: data.lastEventAt,
              defaultForwardE164: data.defaultForwardE164 ?? prev.defaultForwardE164,
              twilioIntelligenceServiceSid: data.twilioIntelligenceServiceSid ?? prev.twilioIntelligenceServiceSid,
              twilioSubaccountSid: data.twilioSubaccountSid ?? prev.twilioSubaccountSid,
              twilioSubaccountCreatedAt: data.twilioSubaccountCreatedAt ?? prev.twilioSubaccountCreatedAt,
              callTrackingIvrEnabled: data.callTrackingIvrEnabled ?? prev.callTrackingIvrEnabled,
              callTrackingIvrPrompt: data.callTrackingIvrPrompt ?? prev.callTrackingIvrPrompt,
            }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save origins");
    } finally {
      setSavingOrigins(false);
    }
  }

  async function rotateKey() {
    setBusy(true);
    setError(null);
    try {
      const allowedOrigins = allowedOriginsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/attribution/install", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotateKey: true, allowedOrigins }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to rotate key");
      setNewPublishableKey(data.publishableKey ?? null);
      setInstall((prev) =>
        prev
          ? {
              ...prev,
              allowedOrigins: data.allowedOrigins,
              verifiedAt: data.verifiedAt,
              lastEventAt: data.lastEventAt,
              defaultForwardE164: data.defaultForwardE164 ?? prev.defaultForwardE164,
              twilioIntelligenceServiceSid: data.twilioIntelligenceServiceSid ?? prev.twilioIntelligenceServiceSid,
              twilioSubaccountSid: data.twilioSubaccountSid ?? prev.twilioSubaccountSid,
              twilioSubaccountCreatedAt: data.twilioSubaccountCreatedAt ?? prev.twilioSubaccountCreatedAt,
              callTrackingIvrEnabled: data.callTrackingIvrEnabled ?? prev.callTrackingIvrEnabled,
              callTrackingIvrPrompt: data.callTrackingIvrPrompt ?? prev.callTrackingIvrPrompt,
            }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rotate key");
    } finally {
      setBusy(false);
    }
  }

  async function createSource() {
    if (!newSourceName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/attribution/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newSourceName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to create source");
      setSources((prev) => [...prev, data as Source]);
      setNewSourceName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create source");
    } finally {
      setBusy(false);
    }
  }

  async function removeSource(sourceId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/attribution/sources?sourceId=${encodeURIComponent(sourceId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to archive source");
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to archive source");
    } finally {
      setBusy(false);
    }
  }

  async function saveCallTrackingSettings() {
    setSavingCallSettings(true);
    setError(null);
    try {
      const res = await fetch("/api/attribution/install", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultForwardE164: defaultForwardInput.trim() || null,
          twilioIntelligenceServiceSid: intelligenceSidInput.trim() || null,
          callTrackingIvrEnabled: callTrackingIvrEnabledInput,
          callTrackingIvrPrompt: callTrackingIvrPromptInput.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to save call tracking settings");
      setInstall((prev) =>
        prev
          ? {
              ...prev,
              defaultForwardE164: data.defaultForwardE164 ?? null,
              twilioIntelligenceServiceSid: data.twilioIntelligenceServiceSid ?? null,
              twilioSubaccountSid: data.twilioSubaccountSid ?? prev.twilioSubaccountSid,
              twilioSubaccountCreatedAt: data.twilioSubaccountCreatedAt ?? prev.twilioSubaccountCreatedAt,
              callTrackingIvrEnabled: data.callTrackingIvrEnabled ?? false,
              callTrackingIvrPrompt: data.callTrackingIvrPrompt ?? null,
            }
          : prev
      );
      setCallTrackingIvrEnabledInput(Boolean(data.callTrackingIvrEnabled));
      setCallTrackingIvrPromptInput(data.callTrackingIvrPrompt ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save call tracking settings");
    } finally {
      setSavingCallSettings(false);
    }
  }

  async function createTwilioSubaccount() {
    setSubaccountBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/attribution/twilio-subaccount", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manualAuthToken: manualSubaccountAuthToken.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to create Twilio workspace");
      setManualSubaccountAuthToken("");
      setInstall((prev) =>
        prev
          ? {
              ...prev,
              twilioSubaccountSid: data.twilioSubaccountSid ?? prev.twilioSubaccountSid,
              twilioSubaccountCreatedAt: data.twilioSubaccountCreatedAt ?? prev.twilioSubaccountCreatedAt,
            }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create Twilio workspace");
    } finally {
      setSubaccountBusy(false);
    }
  }

  async function searchTwilioNumbers() {
    setBusy(true);
    setError(null);
    setSearchResults([]);
    try {
      const q = new URLSearchParams({ country: "US", voiceEnabled: "true" });
      if (searchAreaCode.trim()) q.set("areaCode", searchAreaCode.trim());
      if (searchLocality.trim()) q.set("inLocality", searchLocality.trim());
      if (searchRegion.trim()) q.set("inRegion", searchRegion.trim());
      const res = await fetch(`/api/attribution/phone-numbers?${q}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Search failed");
      setSearchResults((data.numbers ?? []) as SearchNumber[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function provisionTwilioNumber(phoneNumber: string) {
    if (!provisionSourceId) {
      setError("Select a channel (source) first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/attribution/phone-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: provisionSourceId,
          phoneNumber,
          forwardToE164: provisionForwardOverride.trim() || undefined,
          searchSnapshot: {
            areaCode: searchAreaCode,
            locality: searchLocality,
            region: searchRegion,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Provisioning failed");
      await loadAll();
      setSearchResults([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Provisioning failed");
    } finally {
      setBusy(false);
    }
  }

  async function assignExistingTwilioNumber(twilioPhoneNumberSid: string) {
    if (!provisionSourceId) {
      setError("Select a channel (source) first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/attribution/phone-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: provisionSourceId,
          twilioPhoneNumberSid,
          forwardToE164: provisionForwardOverride.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Assign failed");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  }

  async function releaseTwilioNumber(phoneNumberId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/attribution/phone-numbers?phoneNumberId=${encodeURIComponent(phoneNumberId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Release failed");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Release failed");
    } finally {
      setBusy(false);
    }
  }

  function goNext() {
    setWizardStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  }

  function goBack() {
    setWizardStep((s) => Math.max(s - 1, 0));
  }

  if (!initialLoadComplete) {
    return <div className="text-sm text-zinc-600 dark:text-zinc-400">Loading Attribution setup…</div>;
  }

  if (!install) {
    return (
      <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Couldn&apos;t load Attribution</p>
        {error ? (
          <p className="text-sm text-amber-800 dark:text-amber-300">{error}</p>
        ) : (
          <p className="text-sm text-amber-800 dark:text-amber-300">Something went wrong. Try again.</p>
        )}
        <button
          type="button"
          onClick={() => {
            setInitialLoadComplete(false);
            void loadAll().catch(() => {
              /* error in state */
            });
          }}
          className="rounded bg-amber-900 px-3 py-2 text-xs font-medium text-white dark:bg-amber-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <section
        aria-labelledby="attribution-channels-heading"
        className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20 md:p-5"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="attribution-channels-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Your channels — links &amp; tracking numbers
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              These are your marketing sources (Facebook, Instagram, GBP, LSA, and any custom ones). Use the tracking link
              in each ad or profile; provision a Twilio number in the Phones step to tie calls to the same source.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setWizardStep(3)}
              className="rounded border border-emerald-700/30 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 dark:border-emerald-600/40 dark:bg-emerald-950/50 dark:text-emerald-100"
            >
              Edit links (wizard)
            </button>
            <button
              type="button"
              onClick={() => setWizardStep(4)}
              className="rounded border border-emerald-700/30 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 dark:border-emerald-600/40 dark:bg-emerald-950/50 dark:text-emerald-100"
            >
              Phones (wizard)
            </button>
          </div>
        </div>
        {!websiteBase ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            Set your website under <strong className="font-medium">Settings → SEO</strong> to generate full tracking URLs
            below.
          </p>
        ) : null}
        <div className="mt-4 overflow-x-auto rounded-lg border border-emerald-200/80 bg-white dark:border-emerald-900/30 dark:bg-zinc-900">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-emerald-100/80 dark:bg-emerald-950/40">
              <tr>
                <th className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">Source</th>
                <th className="py-2 font-medium text-zinc-800 dark:text-zinc-200">Tracking link</th>
                <th className="py-2 font-medium text-zinc-800 dark:text-zinc-200">Tracking #</th>
                <th className="py-2 font-medium text-zinc-800 dark:text-zinc-200">Forwards to</th>
              </tr>
            </thead>
            <tbody>
              {sources.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-zinc-500">
                    No sources yet. Open <strong className="text-zinc-700 dark:text-zinc-300">Edit links</strong> to add
                    channels.
                  </td>
                </tr>
              ) : (
                sources.map((source) => {
                  const link =
                    websiteBase && source.public_token
                      ? `${websiteBase}?hsa_c=${encodeURIComponent(source.public_token)}`
                      : websiteBase
                        ? `${websiteBase}?hsa_c=…`
                        : "(Set website in SEO settings)";
                  const phones = phonesBySourceId.get(source.id) ?? [];
                  const phoneDisplay =
                    phones.length > 0 ? phones.map((p) => p.phone_e164).join(", ") : "—";
                  const forwardDisplay =
                    phones.length > 0
                      ? phones.map((p) => p.forward_to_e164).join(", ")
                      : install?.defaultForwardE164?.trim()
                        ? `${install.defaultForwardE164} (default)`
                        : "—";
                  return (
                    <tr key={source.id} className="border-t border-emerald-100 dark:border-emerald-900/30">
                      <td className="px-3 py-2 align-top font-medium text-zinc-900 dark:text-zinc-50">{source.label}</td>
                      <td className="max-w-xs py-2 align-top">
                        <p className="break-all font-mono text-zinc-700 dark:text-zinc-300">{link}</p>
                        {websiteBase && source.public_token ? (
                          <button
                            type="button"
                            onClick={() => void copyAttributionText(link)}
                            className="mt-1 text-emerald-800 underline decoration-emerald-600/50 hover:decoration-emerald-700 dark:text-emerald-400"
                          >
                            Copy link
                          </button>
                        ) : null}
                      </td>
                      <td className="py-2 align-top font-mono text-zinc-700 dark:text-zinc-300">{phoneDisplay}</td>
                      <td className="py-2 align-top font-mono text-zinc-700 dark:text-zinc-300">{forwardDisplay}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {install.defaultForwardE164?.trim() ? (
          <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
            <strong className="font-medium text-zinc-800 dark:text-zinc-200">Default forward</strong> (used when a
            number has no per-number override):{" "}
            <span className="font-mono">{install.defaultForwardE164}</span>
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="attribution-call-history-heading"
        className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:p-5"
      >
        <h2 id="attribution-call-history-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Call history by tracking number
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          Each row is stored when a call completes recording. Audio plays in the browser via a short-lived proxy
          (you must be logged in). Expand a row to load the full transcript once Intelligence has finished.
        </p>

        {twilioCalls.length === 0 && activePhones.length === 0 ? (
          <p className="mt-4 text-xs text-zinc-500">No tracking numbers or calls yet.</p>
        ) : null}

        {activePhones.map((p) => {
          const label = sources.find((s) => s.id === p.source_id)?.label ?? "Channel";
          const callsFor = callsGrouped.byPhone.get(p.id) ?? [];
          return (
            <div
              key={p.id}
              className="mt-6 border-t border-zinc-100 pt-5 first:mt-4 first:border-t-0 first:pt-0 dark:border-zinc-800"
            >
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {label}{" "}
                <span className="font-normal text-zinc-600 dark:text-zinc-400">·</span>{" "}
                <span className="font-mono font-normal">{p.phone_e164}</span>
              </h3>
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                Forwards to <span className="font-mono text-zinc-800 dark:text-zinc-200">{p.forward_to_e164}</span>
              </p>
              {callsFor.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500">No calls logged to this number yet.</p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                      <tr>
                        <th className="px-2 py-2">Time</th>
                        <th className="py-2">From</th>
                        <th className="py-2">Duration</th>
                        <th className="py-2">Recording</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Transcript</th>
                      </tr>
                    </thead>
                    <tbody>
                      {callsFor.map((c) => (
                        <Fragment key={c.id}>
                          <tr className="border-t border-zinc-100 dark:border-zinc-800">
                            <td className="px-2 py-2 text-zinc-600 dark:text-zinc-400">
                              {new Date(c.created_at).toLocaleString()}
                            </td>
                            <td className="py-2 font-mono text-zinc-800 dark:text-zinc-200">{c.from_e164 ?? "—"}</td>
                            <td className="py-2">{c.duration_seconds != null ? `${c.duration_seconds}s` : "—"}</td>
                            <td className="py-2">
                              {c.recording_sid ? (
                                <audio
                                  controls
                                  preload="none"
                                  className="h-8 max-w-[220px] align-middle"
                                  src={`/api/attribution/twilio-recordings/${c.id}`}
                                />
                              ) : (
                                <span className="text-zinc-500">—</span>
                              )}
                            </td>
                            <td className="py-2 text-zinc-600 dark:text-zinc-400">{c.transcript_status}</td>
                            <td className="py-2">
                              <button
                                type="button"
                                onClick={() => toggleExpandedCall(c.id)}
                                className="text-violet-700 underline decoration-violet-600/40 hover:decoration-violet-800 dark:text-violet-400"
                              >
                                {expandedCallIds.has(c.id) ? "Hide" : "Show"} full transcript
                              </button>
                              {c.transcript_preview && !expandedCallIds.has(c.id) ? (
                                <p className="mt-1 line-clamp-2 text-zinc-500" title={c.transcript_preview}>
                                  {c.transcript_preview}
                                </p>
                              ) : null}
                            </td>
                          </tr>
                          {expandedCallIds.has(c.id) ? (
                            <tr className="border-t border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40">
                              <td colSpan={6} className="px-3 py-3 text-zinc-800 dark:text-zinc-200">
                                {callDetails[c.id]?.error ? (
                                  <p className="text-amber-800 dark:text-amber-200">{callDetails[c.id].error}</p>
                                ) : callDetails[c.id] && "transcript_text" in callDetails[c.id] ? (
                                  callDetails[c.id].transcript_text ? (
                                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed">
                                      {callDetails[c.id].transcript_text}
                                    </pre>
                                  ) : (
                                    <p className="text-zinc-500">No transcript text yet — Intelligence may still be processing.</p>
                                  )
                                ) : (
                                  <p className="text-zinc-500">Loading transcript…</p>
                                )}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {callsGrouped.unassigned.length > 0 ? (
          <div className="mt-6 border-t border-zinc-200 pt-5 dark:border-zinc-800">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Calls without a matched tracking number</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Older or edge-case calls where the dialed number did not match an active tracking line in our database.
            </p>
            <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                  <tr>
                    <th className="px-2 py-2">Time</th>
                    <th className="py-2">To</th>
                    <th className="py-2">From</th>
                    <th className="py-2">Duration</th>
                    <th className="py-2">Recording</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Transcript</th>
                  </tr>
                </thead>
                <tbody>
                  {callsGrouped.unassigned.map((c) => (
                    <Fragment key={c.id}>
                      <tr className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="px-2 py-2 text-zinc-600 dark:text-zinc-400">
                          {new Date(c.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 font-mono text-zinc-800 dark:text-zinc-200">{c.to_e164 ?? c.tracking_number_e164 ?? "—"}</td>
                        <td className="py-2 font-mono text-zinc-800 dark:text-zinc-200">{c.from_e164 ?? "—"}</td>
                        <td className="py-2">{c.duration_seconds != null ? `${c.duration_seconds}s` : "—"}</td>
                        <td className="py-2">
                          {c.recording_sid ? (
                            <audio
                              controls
                              preload="none"
                              className="h-8 max-w-[220px] align-middle"
                              src={`/api/attribution/twilio-recordings/${c.id}`}
                            />
                          ) : (
                            <span className="text-zinc-500">—</span>
                          )}
                        </td>
                        <td className="py-2 text-zinc-600 dark:text-zinc-400">{c.transcript_status}</td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => toggleExpandedCall(c.id)}
                            className="text-violet-700 underline dark:text-violet-400"
                          >
                            {expandedCallIds.has(c.id) ? "Hide" : "Show"} full transcript
                          </button>
                        </td>
                      </tr>
                      {expandedCallIds.has(c.id) ? (
                        <tr className="border-t border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40">
                          <td colSpan={7} className="px-3 py-3 text-zinc-800 dark:text-zinc-200">
                            {callDetails[c.id]?.error ? (
                              <p className="text-amber-800 dark:text-amber-200">{callDetails[c.id].error}</p>
                            ) : callDetails[c.id] && "transcript_text" in callDetails[c.id] ? (
                              callDetails[c.id].transcript_text ? (
                                <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed">
                                  {callDetails[c.id].transcript_text}
                                </pre>
                              ) : (
                                <p className="text-zinc-500">No transcript text yet.</p>
                              )
                            ) : (
                              <p className="text-zinc-500">Loading transcript…</p>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {/* Step indicator */}
      <nav aria-label="Setup progress" className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <ol className="flex flex-wrap items-center gap-2 md:gap-0 md:justify-between">
          {WIZARD_STEPS.map((s, i) => (
            <li key={s.title} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWizardStep(i)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors md:px-3 ${
                  i === step
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : i < step
                      ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      : "text-zinc-500 hover:bg-zinc-50 dark:text-zinc-500 dark:hover:bg-zinc-800/50"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    i === step
                      ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900"
                      : i < step
                        ? "bg-emerald-600 text-white dark:bg-emerald-500"
                        : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400"
                  }`}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                <span className="hidden text-xs font-medium sm:inline">{s.short}</span>
              </button>
              {i < WIZARD_STEPS.length - 1 ? (
                <span className="hidden text-zinc-300 dark:text-zinc-600 md:mx-1 md:inline" aria-hidden>
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Step {step + 1} of {WIZARD_STEPS.length}: {WIZARD_STEPS[step].title}
        </p>
      </nav>

      {/* Step content */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:p-6">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{WIZARD_STEPS[0].title}</h2>
            <div className="space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              <p>
                This setup connects your <strong className="text-zinc-800 dark:text-zinc-200">marketing channels</strong> to
                what actually happens on your website: visits, phone link taps, and form submissions. You are not using a
                redirect service—visitors still land on your real homepage URL, which is better for trust and SEO.
              </p>
              <p>
                <strong className="text-zinc-800 dark:text-zinc-200">What you will do:</strong> (1) Tell us which website
                origins may send data (security). (2) Paste a small script on your site. (3) Use a unique link for each
                channel (Facebook, Instagram, Google Business Profile, Local Services Ads, etc.). (4) Optionally provision a
                Twilio tracking number per channel that forwards to your main line and records calls for transcription. (5)
                Confirm we are receiving web events (and poll transcripts for calls if using Twilio).
              </p>
              <p>
                <strong className="text-zinc-800 dark:text-zinc-200">What the script tracks:</strong> When someone opens a
                link that includes our tracking parameter, we remember which channel they came from for that visit. We also
                record <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">tel:</code> clicks and form submits as
                contact attempts. Later, this can be combined with your call data and jobs to measure booking rate and
                revenue by source.
              </p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{WIZARD_STEPS[1].title}</h2>
            <div className="space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              <p>
                <strong className="text-zinc-800 dark:text-zinc-200">Homepage URL for link building.</strong> We use your
                organization&apos;s website from <strong>Settings → SEO</strong> to build the full tracking links in the
                next steps (e.g. <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">https://yoursite.com</code>
                ). If it is missing or wrong, update it there first so copied links point to the correct domain.
              </p>
              <p>
                Current website on file:{" "}
                {install.website?.trim() ? (
                  <code className="rounded bg-zinc-100 px-1 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                    {install.website}
                  </code>
                ) : (
                  <span className="text-amber-700 dark:text-amber-300">Not set — add it under Settings → SEO.</span>
                )}
              </p>
              <p>
                <strong className="text-zinc-800 dark:text-zinc-200">Allowed origins (required for security).</strong>{" "}
                Browsers only let your site send tracking data to our app if you explicitly allow your site&apos;s origin
                (scheme + host, e.g. <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">https://www.example.com</code>
                ). List every variant visitors use: often both <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">https://example.com</code> and{" "}
                <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">https://www.example.com</code>. We seed this from
                your SEO website when you first open Attribution; review and save.
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/40">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Allowed origins (one per line)</label>
              <textarea
                className="mt-2 h-28 w-full rounded border border-zinc-300 bg-white p-2 font-mono text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                value={allowedOriginsText}
                onChange={(e) => setAllowedOriginsText(e.target.value)}
                placeholder="https://www.yourbusiness.com"
              />
              <button
                type="button"
                onClick={saveOrigins}
                disabled={savingOrigins}
                className="mt-3 rounded bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {savingOrigins ? "Saving…" : "Save allowed origins"}
              </button>
              {hasOrigins ? (
                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">Origins saved or entered — you can continue.</p>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">Add at least one origin before installing the snippet so events are accepted.</p>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{WIZARD_STEPS[2].title}</h2>
            <div className="space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              <p>
                Copy the line below and paste it on <strong className="text-zinc-800 dark:text-zinc-200">every page</strong>{" "}
                where you want tracking—typically once in your site template, just before the closing{" "}
                <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">&lt;/body&gt;</code> tag.
              </p>
              <p>
                The script loads from our app and uses a <strong className="text-zinc-800 dark:text-zinc-200">publishable key</strong>{" "}
                (not a secret password). Anyone could see it in your HTML; that is why we restrict which websites can use it
                via allowed origins. If the key is ever exposed in an unwanted place, use &quot;Rotate key&quot; and update the
                snippet everywhere.
              </p>
              <p>
                <strong className="text-zinc-800 dark:text-zinc-200">Content Security Policy:</strong> If your site uses CSP,
                allow our hostname in <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">script-src</code> and allow
                connections to the same host for the event API (or use <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">data-endpoint</code> on the script if you proxy).
              </p>
            </div>
            <textarea
              className="h-24 w-full rounded border border-zinc-300 bg-zinc-50 p-3 font-mono text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              value={snippet}
              readOnly
            />
            {newPublishableKey ? (
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Important:</strong> Copy and store this key somewhere safe. After you leave this page or rotate again,
                we only store a hash server-side—you will not see the full key repeated.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={rotateKey}
                disabled={busy}
                className="rounded border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                Rotate publishable key
              </button>
              <button
                type="button"
                onClick={() => loadAll().catch((e) => setError(e instanceof Error ? e.message : "Failed to refresh"))}
                className="rounded border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              >
                Refresh data
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{WIZARD_STEPS[3].title}</h2>
            <div className="space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              <p>
                Each row below is a <strong className="text-zinc-800 dark:text-zinc-200">channel</strong> (Facebook,
                Instagram, GBP, LSA, or a custom name you add). The URL is your normal homepage with a query parameter{" "}
                <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">hsa_c=…</code> — we are{" "}
                <strong className="text-zinc-800 dark:text-zinc-200">not</strong> sending people through a redirect on our
                servers. When someone clicks that link, your site loads, the snippet reads the parameter, and we attribute
                the session to that channel.
              </p>
              <p>
                <strong className="text-zinc-800 dark:text-zinc-200">Where to paste each link:</strong> Use the Facebook URL
                in Meta ads or page buttons; the Instagram URL in your bio or ads; the GBP URL as your website link if you
                want GBP traffic labeled; the LSA URL as the landing page where allowed. For anything else, add a custom
                source and use that link in that placement.
              </p>
            </div>
            {!websiteBase ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                Set your website under Settings → SEO to generate full URLs here.
              </p>
            ) : null}
            <div className="space-y-2">
              {sources.map((source) => {
                const link = websiteBase
                  ? `${websiteBase}?hsa_c=${encodeURIComponent(source.public_token)}`
                  : "(Set website in SEO settings)";
                return (
                  <div key={source.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{source.label}</p>
                        <p className="mt-1 break-all font-mono text-xs text-zinc-600 dark:text-zinc-400">{link}</p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                        onClick={() => removeSource(source.id)}
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Add custom channel</label>
                <input
                  type="text"
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  placeholder="e.g. Yard signs, Radio"
                  className="mt-1 rounded border border-zinc-300 bg-white px-2 py-2 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                />
              </div>
              <button
                type="button"
                onClick={createSource}
                disabled={busy}
                className="rounded bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Add source
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{WIZARD_STEPS[4].title}</h2>
            <div className="space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              <p>
                Pair each marketing <strong className="text-zinc-800 dark:text-zinc-200">source</strong> with a dedicated
                local Twilio number. When someone dials that number, we forward the call to your main business line and
                record the conversation (dual-channel). After the call, we request a transcript via Twilio{" "}
                <strong className="text-zinc-800 dark:text-zinc-200">Conversational Intelligence</strong> (not the legacy
                2-minute Record transcription). Use the same source list as your tracking links so reporting stays aligned.
              </p>
              <p>
                <strong className="text-zinc-800 dark:text-zinc-200">Forwarding:</strong> Set a default E.164 number (your
                office cell or main line). Each purchased tracking number dials that destination. You can override per
                purchase if needed.
              </p>
              <p>
                <strong className="text-zinc-800 dark:text-zinc-200">Legal:</strong> Recording laws vary by state and
                country—obtain consent where required. Twilio bills number rental, minutes, recording, and Intelligence
                separately.
              </p>
              <p className="text-xs text-zinc-500">
                <strong className="text-zinc-600 dark:text-zinc-400">Platform:</strong> Your app uses a{" "}
                <strong className="text-zinc-700 dark:text-zinc-300">parent</strong> Twilio API key to create a{" "}
                <strong className="text-zinc-700 dark:text-zinc-300">subaccount per company</strong> so usage bills to that
                segment. Subaccount auth token + API key are stored encrypted in Postgres. Webhook signatures use each
                subaccount&apos;s auth token automatically. Also set{" "}
                <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">TWILIO_WEBHOOK_BASE_URL</code>,{" "}
                <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">TWILIO_SUBACCOUNT_CREDENTIALS_ENCRYPTION_KEY</code>
                , and <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">CRON_SECRET</code> for the daily{" "}
                <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/api/sync</code> cron (also polls transcripts).
                Legacy
                single-account mode still works if you only set{" "}
                <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">TWILIO_ACCOUNT_SID</code> + token/API key and skip
                subaccount setup.
              </p>
            </div>

            <div className="rounded-lg border border-violet-200 bg-violet-50/80 p-4 dark:border-violet-900/50 dark:bg-violet-950/30">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">1. Company Twilio workspace (admin)</h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                Create a dedicated Twilio subaccount for this organization. Numbers you buy afterward live in that
                subaccount; Twilio usage rolls up separately for billing. This only needs to be done once per company.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                If you use a <strong className="text-zinc-800 dark:text-zinc-200">parent API key</strong> only, add{" "}
                <code className="rounded bg-zinc-100 px-1 font-mono dark:bg-zinc-800">TWILIO_AUTH_TOKEN</code> (or{" "}
                <code className="rounded bg-zinc-100 px-1 font-mono dark:bg-zinc-800">TWILIO_MASTER_AUTH_TOKEN</code>) for
                the same parent account in Vercel so we can create a webhook signing token automatically. Alternatively,
                paste the subaccount Auth Token from Twilio Console after the subaccount exists.
              </p>
              {install?.twilioSubaccountSid ? (
                <p className="mt-2 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                  Subaccount: {install.twilioSubaccountSid}
                  {install.twilioSubaccountCreatedAt
                    ? ` · since ${new Date(install.twilioSubaccountCreatedAt).toLocaleString()}`
                    : null}
                </p>
              ) : (
                <>
                  <label className="mt-3 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Subaccount Auth Token (optional)
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={manualSubaccountAuthToken}
                    onChange={(e) => setManualSubaccountAuthToken(e.target.value)}
                    placeholder="Only if auto-setup fails — from Twilio Console for this subaccount"
                    className="mt-1 w-full max-w-md rounded border border-violet-200 bg-white px-2 py-2 font-mono text-xs dark:border-violet-900/50 dark:bg-zinc-950 dark:text-zinc-200"
                  />
                  <button
                    type="button"
                    onClick={createTwilioSubaccount}
                    disabled={subaccountBusy}
                    className="mt-3 rounded bg-violet-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-60 dark:bg-violet-600"
                  >
                    {subaccountBusy ? "Creating workspace…" : "Create Twilio workspace for this company"}
                  </button>
                </>
              )}
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/40">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">2. Default forwarding &amp; Intelligence</h3>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Conversational Intelligence Service SID (starts with <code className="font-mono">GA</code>) — can also be set
                in env <code className="font-mono">TWILIO_INTELLIGENCE_SERVICE_SID</code> for all orgs.
              </p>
              <label className="mt-3 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Default forward-to (E.164)</label>
              <input
                type="text"
                value={defaultForwardInput}
                onChange={(e) => setDefaultForwardInput(e.target.value)}
                placeholder="+15551234567"
                className="mt-1 w-full max-w-md rounded border border-zinc-300 bg-white px-2 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              />
              <label className="mt-3 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Intelligence Service SID (optional)</label>
              <input
                type="text"
                value={intelligenceSidInput}
                onChange={(e) => setIntelligenceSidInput(e.target.value)}
                placeholder="GAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="mt-1 w-full max-w-md rounded border border-zinc-300 bg-white px-2 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              />

              <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-700">
                <label className="flex cursor-pointer items-start gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    checked={callTrackingIvrEnabledInput}
                    onChange={(e) => setCallTrackingIvrEnabledInput(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Enable IVR before connecting callers (press <strong className="font-semibold">1</strong> to reach your
                    forward-to number)
                  </span>
                </label>
                <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  When on, callers hear your message first; only digit <strong className="text-zinc-800 dark:text-zinc-200">1</strong>{" "}
                  continues to the same forwarded call and recording as today. Other keys or silence end the call politely.
                </p>
                <label className="mt-3 block text-xs font-medium text-zinc-700 dark:text-zinc-300">IVR message (spoken)</label>
                <textarea
                  value={callTrackingIvrPromptInput}
                  onChange={(e) => setCallTrackingIvrPromptInput(e.target.value)}
                  disabled={!callTrackingIvrEnabledInput}
                  rows={3}
                  placeholder={DEFAULT_IVR_PROMPT_TEMPLATE}
                  className="mt-1 w-full max-w-lg rounded border border-zinc-300 bg-white px-2 py-2 text-xs text-zinc-800 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Use <code className="rounded bg-zinc-100 px-1 font-mono dark:bg-zinc-800">{"{company}"}</code> or{" "}
                  <code className="rounded bg-zinc-100 px-1 font-mono dark:bg-zinc-800">{"{company_name}"}</code> for your
                  organization name. Leave blank to use the default sentence above.
                </p>
              </div>

              <button
                type="button"
                onClick={saveCallTrackingSettings}
                disabled={savingCallSettings}
                className="mt-3 rounded bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {savingCallSettings ? "Saving…" : "Save call tracking settings (admin)"}
              </button>
            </div>

            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">3. Search &amp; buy a number (admin)</h3>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                US local search: area code and/or city (locality) and state (region code, e.g. CA).
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  type="text"
                  value={searchAreaCode}
                  onChange={(e) => setSearchAreaCode(e.target.value)}
                  placeholder="Area code e.g. 415"
                  className="w-28 rounded border border-zinc-300 px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                />
                <input
                  type="text"
                  value={searchLocality}
                  onChange={(e) => setSearchLocality(e.target.value)}
                  placeholder="City / locality"
                  className="w-40 rounded border border-zinc-300 px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                />
                <input
                  type="text"
                  value={searchRegion}
                  onChange={(e) => setSearchRegion(e.target.value)}
                  placeholder="State e.g. CA"
                  className="w-24 rounded border border-zinc-300 px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                />
                <button
                  type="button"
                  onClick={searchTwilioNumbers}
                  disabled={busy}
                  className="rounded bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Search numbers
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-xs text-zinc-600 dark:text-zinc-400">Attach to source</label>
                  <select
                    value={provisionSourceId}
                    onChange={(e) => setProvisionSourceId(e.target.value)}
                    className="mt-1 rounded border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                  >
                    <option value="">Select channel…</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-600 dark:text-zinc-400">Forward override (optional)</label>
                  <input
                    type="text"
                    value={provisionForwardOverride}
                    onChange={(e) => setProvisionForwardOverride(e.target.value)}
                    placeholder="Uses default if empty"
                    className="mt-1 w-44 rounded border border-zinc-300 px-2 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                  />
                </div>
              </div>
              {searchResults.length > 0 ? (
                <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs">
                  {searchResults.map((n) => (
                    <li
                      key={n.phone_number}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-200 px-2 py-1 dark:border-zinc-700"
                    >
                      <span className="font-mono">{n.phone_number}</span>
                      <span className="text-zinc-500">
                        {[n.locality, n.region].filter(Boolean).join(", ")}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => provisionTwilioNumber(n.phone_number)}
                        className="rounded border border-zinc-400 px-2 py-0.5 text-zinc-800 dark:border-zinc-500 dark:text-zinc-200"
                      >
                        Buy &amp; attach
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900/40 dark:bg-violet-950/20">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Assign unused numbers already in Twilio (admin)</h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                These lines exist on your company Twilio account but are not linked to a channel in this app (for example
                purchased in Twilio Console or left over after a partial setup). Choose <strong className="text-zinc-800 dark:text-zinc-200">Attach to source</strong>{" "}
                and optional forward override above, then assign — we update the Voice webhook to this app and store the
                mapping.
              </p>
              {unassignedTwilio.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500">
                  {unassignedTwilioListedCount === 0 ? (
                    <>
                      Twilio returned no incoming numbers for this company workspace. Numbers bought on the subaccount
                      were not visible — usually fixed by server env (master Twilio API key or auth token that can act on
                      the subaccount) or by saving subaccount API keys in Attribution setup.
                    </>
                  ) : unassignedTwilioListedCount != null && unassignedTwilioListedCount > 0 ? (
                    <>
                      All {unassignedTwilioListedCount} number{unassignedTwilioListedCount === 1 ? "" : "s"} on this
                      Twilio account already have an active link below.
                    </>
                  ) : (
                    <>
                      No unlinked numbers found. If you are not an admin, this list is empty. Otherwise every number on
                      the account is already linked below.
                    </>
                  )}
                </p>
              ) : (
                <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-xs">
                  {unassignedTwilio.map((n) => (
                    <li
                      key={n.sid}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-violet-200/90 px-2 py-1.5 dark:border-violet-800/60"
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-zinc-800 dark:text-zinc-200">{n.phone_number}</span>
                        {n.friendly_name ? (
                          <span className="ml-2 text-zinc-500 dark:text-zinc-400">{n.friendly_name}</span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => assignExistingTwilioNumber(n.sid)}
                        className="shrink-0 rounded border border-violet-600 bg-white px-2 py-1 text-violet-900 disabled:opacity-50 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-100"
                      >
                        Assign to selected source
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Active tracking numbers</h3>
              {activePhones.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500">None yet.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-xs">
                  {activePhones.map((p) => {
                    const label = sources.find((s) => s.id === p.source_id)?.label ?? p.source_id;
                    return (
                      <li
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-200 p-2 dark:border-zinc-700"
                      >
                        <div>
                          <p className="font-medium text-zinc-900 dark:text-zinc-50">{label}</p>
                          <p className="font-mono text-zinc-600 dark:text-zinc-400">{p.phone_e164}</p>
                          <p className="text-zinc-500">→ {p.forward_to_e164}</p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => releaseTwilioNumber(p.id)}
                          className="rounded border border-red-300 px-2 py-1 text-red-800 dark:border-red-800 dark:text-red-300"
                        >
                          Release (admin)
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Call history, recordings &amp; transcripts</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Full history is in the <strong className="text-zinc-700 dark:text-zinc-300">Call history by tracking number</strong>{" "}
                section at the top of this page (per-number tables, audio playback, and expandable transcripts).
                Transcripts fill after Intelligence completes; the daily <code className="font-mono">/api/sync</code> cron
                polls pending calls, or use <code className="font-mono">GET /api/cron/twilio-transcripts</code> with your
                bearer secret.
              </p>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{WIZARD_STEPS[5].title}</h2>
            <div className="space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              <p>
                After the snippet is live, open your site using one of the tracking links (or browse normally). Then return
                here and click <strong className="text-zinc-800 dark:text-zinc-200">Refresh data</strong>. If setup is
                correct, you should see <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">landing</code> or{" "}
                <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">page_view</code> events and a recent timestamp.
              </p>
              <p>
                <strong className="text-zinc-800 dark:text-zinc-200">Contact attempts</strong> in the table appear as{" "}
                <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">tel_click</code> when someone taps a phone link
                and <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">form_submit</code> when a form is submitted.
                They are tied to the last known channel for that visitor when they arrived via a tracking link.
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                Next phase: match these events to <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">call_records</code>{" "}
                (phone + time) and jobs for booking rate, conversion, revenue, and average ticket by source.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loadAll().catch((e) => setError(e instanceof Error ? e.message : "Failed to refresh"))}
                className="rounded bg-zinc-900 px-3 py-2 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Refresh data
              </button>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/40">
              <p className="text-sm text-zinc-800 dark:text-zinc-200">
                <strong>Status:</strong>{" "}
                {hasReceivedEvents ? (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    Receiving data — last event {new Date(install.lastEventAt!).toLocaleString()}
                  </span>
                ) : (
                  <span className="text-zinc-600 dark:text-zinc-400">No events yet — check snippet, origins, and try a test visit.</span>
                )}
              </p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Verified marker: {install.verifiedAt ? new Date(install.verifiedAt).toLocaleString() : "Set after first accepted event"}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Last 30 days (by event type)</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                {Object.keys(events?.counts30d ?? {}).length === 0 ? (
                  <p className="col-span-full text-zinc-500">No counts yet.</p>
                ) : (
                  Object.entries(events?.counts30d ?? {}).map(([k, v]) => (
                    <div key={k} className="rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
                      <p className="font-medium text-zinc-900 dark:text-zinc-50">{k}</p>
                      <p className="text-zinc-600 dark:text-zinc-400">{v}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Recent events</h3>
              <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full min-w-[680px] text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-2 py-2 pr-3">Time</th>
                      <th className="py-2 pr-3">Event</th>
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3">Page</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(events?.recentEvents ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-2 py-4 text-zinc-500">
                          No rows yet.
                        </td>
                      </tr>
                    ) : (
                      (events?.recentEvents ?? []).map((event) => (
                        <tr key={event.id} className="border-t border-zinc-100 dark:border-zinc-800">
                          <td className="px-2 py-2 pr-3 text-zinc-600 dark:text-zinc-400">
                            {new Date(event.occurred_at).toLocaleString()}
                          </td>
                          <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-50">{event.event_type}</td>
                          <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-50">{event.source_label ?? "—"}</td>
                          <td className="py-2 pr-3 break-all text-zinc-600 dark:text-zinc-400">{event.page_url ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Wizard navigation */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0}
            className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300"
          >
            Back
          </button>
          <div className="flex gap-2">
            {step < WIZARD_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setWizardStep(0)}
                className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
              >
                Review from start
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
