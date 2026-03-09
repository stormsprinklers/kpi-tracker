import { WebhooksSettingsClient } from "../webhooks/WebhooksSettingsClient";

export default function IntegrationsSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Integrations
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Inbound webhook URLs for Housecall Pro and GoHighLevel, plus optional forwarding to Zapier, Make, or other tools.
        </p>
      </div>

      <WebhooksSettingsClient />
    </div>
  );
}
