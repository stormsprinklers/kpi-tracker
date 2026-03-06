import { WebhookUrlCard } from "@/components/WebhookUrlCard";

function getWebhookUrl(): string {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  return `${baseUrl}/api/webhooks/housecallpro`;
}

function isConnected(): boolean {
  return !!process.env.HOUSECALLPRO_ACCESS_TOKEN;
}

export default function Home() {
  const webhookUrl = getWebhookUrl();
  const connected = isConnected();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          KPI Tracker
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Home services metrics and insights
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-6">
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Connection Status
          </h2>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                connected ? "bg-emerald-500" : "bg-amber-500"
              }`}
              aria-hidden
            />
            <span className="text-zinc-900 dark:text-zinc-50">
              {connected ? "Housecall Pro connected" : "Housecall Pro not configured"}
            </span>
          </div>
          {!connected && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Add HOUSECALLPRO_ACCESS_TOKEN to your environment variables.
            </p>
          )}
        </section>

        <WebhookUrlCard webhookUrl={webhookUrl} />

        <section>
          <h2 className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Key Metrics
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Jobs This Week
              </h3>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                —
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Connect Housecall Pro to sync
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Revenue
              </h3>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                —
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Connect Housecall Pro to sync
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Avg. Job Value
              </h3>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                —
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Connect Housecall Pro to sync
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
