"use client";

import { useEffect, useState } from "react";

interface SourceConfig {
  webhookUrl: string;
  forwardEnabled: boolean;
  forwardUrl: string;
}

interface WebhooksConfig {
  hcp: SourceConfig;
  ghl: SourceConfig;
}

const SOURCES = [
  {
    key: "hcp" as const,
    name: "Housecall Pro",
    description: "Jobs, appointments, estimates. Use this URL in HCP → My Apps → Webhooks.",
  },
  {
    key: "ghl" as const,
    name: "GoHighLevel",
    description: "Call completion webhooks. Use in GHL workflow after call completion.",
  },
];

export function WebhooksSettingsClient() {
  const [config, setConfig] = useState<WebhooksConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/webhook-forwarding");
      if (!res.ok) throw new Error("Failed to load");
      const data: WebhooksConfig = await res.json();
      setConfig(data);
    } catch {
      setError("Failed to load webhook settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleCopy = async (url: string, key: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/webhook-forwarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hcp: {
            forwardEnabled: config.hcp.forwardEnabled,
            forwardUrl: config.hcp.forwardUrl,
          },
          ghl: {
            forwardEnabled: config.ghl.forwardEnabled,
            forwardUrl: config.ghl.forwardUrl,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const updateSource = (
    key: "hcp" | "ghl",
    field: "forwardEnabled" | "forwardUrl",
    value: boolean | string
  ) => {
    if (!config) return;
    setConfig({
      ...config,
      [key]: { ...config[key], [field]: value },
    });
  };

  if (loading) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading webhook settings…</p>
    );
  }
  if (error && !config) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
    );
  }
  if (!config) return null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Configure inbound webhook URLs and optionally forward webhooks to external sites (Zapier, Make, marketing tools).
        Use this app as a midpoint so you receive data here and can also send it elsewhere.
      </p>

      {SOURCES.map(({ key, name, description }) => {
        const c = config[key];
        return (
          <section
            key={key}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{name}</h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>

            {/* Inbound URL */}
            <div className="mt-4">
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Inbound webhook URL
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={c.webhookUrl}
                  className="flex-1 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-mono text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(c.webhookUrl, key)}
                  className="rounded border border-zinc-200 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {copied === key ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Forwarding */}
            <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={c.forwardEnabled}
                  onChange={(e) => updateSource(key, "forwardEnabled", e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-600"
                />
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Enable forwarding
                </span>
              </label>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Forward full headers and payload to an external URL (Zapier, Make, etc.)
              </p>
              {c.forwardEnabled && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Forward URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://hooks.zapier.com/..."
                    value={c.forwardUrl}
                    onChange={(e) => updateSource(key, "forwardUrl", e.target.value)}
                    className="mt-1 block w-full rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-mono text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  />
                </div>
              )}
            </div>
          </section>
        );
      })}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
