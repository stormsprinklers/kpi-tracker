import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { getOrganizationById } from "@/lib/db/queries";
import { SettingsPageClient } from "./SettingsPageClient";
import { CompanyLogoSection } from "@/components/CompanyLogoSection";
import { SyncStatusSection } from "@/components/SyncStatusSection";
import { NightShiftToggle } from "@/components/NightShiftToggle";

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

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <a
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Back to Dashboard
        </a>

        <CompanyLogoSection
          organizationId={session.user.organizationId}
          initialLogoUrl={org?.logo_url ?? null}
        />

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

        <NightShiftToggle />

        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Performance Pay</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Configure pay structures for roles and employees. Expected pay is calculated from timesheets and metrics.
          </p>
          <Link
            href="/team/performance-pay"
            className="mt-3 inline-block text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-100"
          >
            Edit Performance Pay →
          </Link>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Webhooks</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Inbound URLs for Housecall Pro and GoHighLevel, plus optional forwarding to Zapier, Make, or other tools.
          </p>
          <Link
            href="/settings/webhooks"
            className="mt-3 inline-block text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-100"
          >
            Configure webhooks →
          </Link>
        </section>

        <SyncStatusSection />

        <SettingsPageClient />
      </main>
    </div>
  );
}
