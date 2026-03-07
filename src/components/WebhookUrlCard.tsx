"use client";

import { useState } from "react";

interface WebhookUrlCardProps {
  webhookUrl: string;
}

export function WebhookUrlCard({ webhookUrl }: WebhookUrlCardProps) {
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
        Webhook URL
      </h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Copy this URL into Housecall Pro (My Apps → App Store → Webhooks)
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
          {showTroubleshoot ? "Hide" : "Getting 401? Capture request for debugging"}
        </button>
        {showTroubleshoot && (
          <div className="mt-2 rounded bg-amber-50 p-3 text-xs text-zinc-700 dark:bg-amber-950/30 dark:text-zinc-300">
            <p className="font-medium">Capture what Housecall Pro sends:</p>
            <ol className="mt-1 list-inside list-decimal space-y-1">
              <li>Go to <a href="https://webhook.site" target="_blank" rel="noopener noreferrer" className="underline">webhook.site</a> and copy your unique URL</li>
              <li>In HCP Webhooks, paste the webhook.site URL (not your app URL) and click Save</li>
              <li>On webhook.site, click the request that appears</li>
              <li>Expand &quot;Request&quot; → &quot;Headers&quot; and copy the full header list</li>
              <li>Share those headers (you can redact the signature value) so we can fix verification</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
