import { redirect } from "next/navigation";
import { initSchema } from "@/lib/db";
import { getOrganizationsCount } from "@/lib/db/queries";
import SetupForm from "./SetupForm";

export default async function SetupPage() {
  await initSchema();
  const count = await getOrganizationsCount();
  if (count > 0) {
    redirect("/login");
  }

  const envToken = process.env.HOUSECALLPRO_ACCESS_TOKEN ?? "";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Set up KPI Tracker
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Create your organization and admin account
        </p>
        <SetupForm envToken={envToken} />
      </div>
    </div>
  );
}
