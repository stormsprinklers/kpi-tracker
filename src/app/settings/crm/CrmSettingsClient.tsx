"use client";

import { useState } from "react";

export function CrmSettingsClient() {
  const [hcpToken, setHcpToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [hcpError, setHcpError] = useState<string | null>(null);
  const [hcpLoading, setHcpLoading] = useState(false);

  async function handleSaveHcp(e: React.FormEvent) {
    e.preventDefault();
    setHcpError(null);
    setHcpLoading(true);
    try {
      const res = await fetch("/api/organizations/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hcp_access_token: hcpToken.trim() || undefined,
          hcp_webhook_secret: webhookSecret.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setHcpError(data.error ?? "Failed to save");
        setHcpLoading(false);
        return;
      }
      setHcpToken("");
      setWebhookSecret("");
      window.location.reload();
    } catch {
      setHcpError("Something went wrong");
    } finally {
      setHcpLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Housecall Pro
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Update access token and webhook signing secret. Leave blank to keep current.
      </p>
      <form onSubmit={handleSaveHcp} className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Access token
          </label>
          <input
            type="password"
            placeholder="••••••••"
            value={hcpToken}
            onChange={(e) => setHcpToken(e.target.value)}
            className="mt-1 block w-full max-w-md rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Webhook signing secret
          </label>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            <strong>Do this first:</strong> In Housecall Pro → My Apps → Webhooks, the signing secret is shown before you add a URL. Copy it, paste here, and Save. Then copy the webhook URL from Integrations and add it in HCP.
          </p>
          <input
            type="password"
            placeholder="••••••••"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            className="mt-1 block w-full max-w-md rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
        <button
          type="submit"
          disabled={hcpLoading}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {hcpLoading ? "Saving..." : "Save"}
        </button>
      </form>
      {hcpError && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{hcpError}</p>
      )}
    </section>
  );
}
