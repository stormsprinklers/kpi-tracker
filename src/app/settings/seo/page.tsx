import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SeoSettingsClient } from "./SeoSettingsClient";

export default async function SeoSettingsPage() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    redirect("/login");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Back to Settings
        </Link>

        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Marketing & SEO
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Configure your website, keywords, and locations for SEO and Google Business Profile
          rankings. Up to 10 keywords and 20 locations.
        </p>

        <SeoSettingsClient />
      </main>
    </div>
  );
}
