import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getOrganizationById } from "@/lib/db/queries";
import { getWebhookUrl } from "@/lib/webhook";
import { SettingsPageClient } from "./SettingsPageClient";
import { WebhookUrlCard } from "@/components/WebhookUrlCard";
import { SyncStatusSection } from "@/components/SyncStatusSection";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    redirect("/login");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  const org = await getOrganizationById(session.user.organizationId);
  const connected = !!org?.hcp_access_token;
  const webhookUrl = getWebhookUrl(session.user.organizationId);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <a
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Back to Dashboard
        </a>

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
              Add an access token below to connect Housecall Pro.
            </p>
          )}
        </section>

        <WebhookUrlCard webhookUrl={webhookUrl} />

        <SyncStatusSection />

        <SettingsPageClient
          organizationId={session.user.organizationId}
          currentUserId={session.user.id}
        />
      </main>
    </div>
  );
}
