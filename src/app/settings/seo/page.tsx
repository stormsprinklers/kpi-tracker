import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          SEO
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Configure website, keywords, and locations for SEO and Google Business Profile rankings.
        </p>
      </div>

      <SeoSettingsClient />
    </div>
  );
}
