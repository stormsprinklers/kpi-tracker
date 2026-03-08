"use client";

import { useState } from "react";

interface WebhookUrlCardProps {
  webhookUrl: string;
  title?: string;
  description?: string;
}

export function WebhookUrlCard({
  webhookUrl,
  title = "Webhook URL",
  description = "Use in Housecall Pro, GoHighLevel, Zapier, Make, or any automation platform",
}: WebhookUrlCardProps) {
  const [copied, setCopied] = useState(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {title}
      </h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          readOnly
          value={webhookUrl}
          className="flex-1 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-mono text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="rounded border border-zinc-200 bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowTroubleshoot(!showTroubleshoot)}
          className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
        >
          {showTroubleshoot ? "Hide" : "Getting 401? Troubleshooting steps"}
        </button>
        {showTroubleshoot && (
          <div className="mt-2 rounded bg-amber-50 p-3 text-xs text-zinc-700 dark:bg-amber-950/30 dark:text-zinc-300">
            <p className="font-medium">If HCP shows 401 when saving the webhook URL:</p>
            <ol className="mt-1 list-inside list-decimal space-y-1">
              <li><strong>Vercel bypass:</strong> The URL above includes <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-700">x-vercel-protection-bypass</code> when configured. Ensure you created a bypass secret in Vercel → Project Settings → Deployment Protection → Protection Bypass for Automation. Vercel sets <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-700">VERCEL_AUTOMATION_BYPASS_SECRET</code> automatically.</li>
              <li><strong>Redeploy:</strong> After creating the bypass secret, redeploy so the env var is available when the URL is generated.</li>
              <li><strong>Test reachability:</strong> Open the webhook URL (or <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-700">/api/webhooks/hcp/ping</code>) in your browser. If it returns 401, the bypass may not be configured.</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
