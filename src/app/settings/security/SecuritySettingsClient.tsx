"use client";

import { useEffect, useState } from "react";

export function SecuritySettingsClient() {
  const [hasPassword, setHasPassword] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);
  const [channel, setChannel] = useState<"sms" | "email" | "">("");
  const [phone, setPhone] = useState("");
  const [smsVerified, setSmsVerified] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/settings/security");
        if (!res.ok) throw new Error("Failed to load");
        const data = (await res.json()) as {
          hasPassword: boolean;
          two_factor_enabled: boolean;
          two_factor_channel: string | null;
          phone_e164: string;
          two_factor_sms_verified?: boolean;
          two_factor_email_verified?: boolean;
        };
        setHasPassword(data.hasPassword);
        setTwoFactorEnabled(true);
        setChannel((data.two_factor_channel === "sms" || data.two_factor_channel === "email" ? data.two_factor_channel : "") as "" | "sms" | "email");
        setPhone(data.phone_e164 ?? "");
        setSmsVerified(Boolean(data.two_factor_sms_verified));
        setEmailVerified(Boolean(data.two_factor_email_verified));
      } catch {
        setError("Could not load security settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      if (twoFactorEnabled) {
        if (channel !== "sms" && channel !== "email") {
          setError("Choose SMS or email for two-factor delivery.");
          setSaving(false);
          return;
        }
        if (channel === "sms" && !/^\+[1-9]\d{6,14}$/.test(phone.trim())) {
          setError("Enter a valid E.164 mobile number for SMS (e.g. +15551234567).");
          setSaving(false);
          return;
        }
      }
      const res = await fetch("/api/settings/security", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          two_factor_enabled: true,
          two_factor_channel: channel || null,
          phone_e164: phone.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        two_factor_enabled?: boolean;
        two_factor_channel?: string | null;
        phone_e164?: string;
        two_factor_sms_verified?: boolean;
        two_factor_email_verified?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }
      if (data.two_factor_enabled !== undefined) setTwoFactorEnabled(data.two_factor_enabled);
      if (data.two_factor_channel !== undefined) {
        setChannel((data.two_factor_channel === "sms" || data.two_factor_channel === "email" ? data.two_factor_channel : "") as "" | "sms" | "email");
      }
      if (data.phone_e164 !== undefined) setPhone(data.phone_e164 ?? "");
      if (data.two_factor_sms_verified !== undefined) setSmsVerified(Boolean(data.two_factor_sms_verified));
      if (data.two_factor_email_verified !== undefined) setEmailVerified(Boolean(data.two_factor_email_verified));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <div className="max-w-lg space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {!hasPassword ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          Your account does not have a password (you may use Google or Apple only). Two-factor for email/password sign-in is
          unavailable until you set a password.
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">Two-factor at sign-in</span>
          <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">
            Required for all users. After your password, you will enter a one-time code from Twilio Verify.
          </span>
        </div>

        <div className="mt-5 space-y-4 border-t border-zinc-100 pt-5 dark:border-zinc-800">
          <div>
            <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">Delivery method</label>
            <select
              value={channel}
              disabled={!hasPassword}
              onChange={(e) => setChannel(e.target.value as "" | "sms" | "email")}
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Select…</option>
              <option value="sms">SMS (mobile)</option>
              <option value="email">Email (your login address)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">Mobile (E.164)</label>
            <p className="mt-0.5 text-xs text-zinc-500">Required for SMS. Example: +15551234567</p>
            <input
              type="tel"
              value={phone}
              disabled={!hasPassword}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+15551234567"
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <p className="mt-1 text-xs text-zinc-500">
              SMS verification: {smsVerified ? "verified" : "not verified"}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Email verification: {emailVerified ? "verified" : "not verified"}
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        Configure a{" "}
        <a
          href="https://www.twilio.com/docs/verify/api"
          className="underline hover:text-zinc-700"
          target="_blank"
          rel="noreferrer"
        >
          Twilio Verify
        </a>{" "}
        service and set <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">TWILIO_VERIFY_SERVICE_SID</code> in the
        environment. Email codes require enabling the email channel for Verify in the Twilio console (often with SendGrid).
      </p>

      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={saving || !hasPassword || !twoFactorEnabled}
          onClick={() => void save()}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved ? <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved</span> : null}
      </div>
    </div>
  );
}
