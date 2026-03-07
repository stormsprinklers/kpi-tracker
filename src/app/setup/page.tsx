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
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ backgroundColor: "#F8FAFC" }}>
      <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm" style={{ borderColor: "#0B1F33" }}>
        <h1 className="text-xl font-semibold" style={{ color: "#0B1F33" }}>
          Set up Home Services Analytics
        </h1>
        <p className="mt-1 text-sm opacity-80" style={{ color: "#0B1F33" }}>
          Create your organization and admin account
        </p>
        <SetupForm envToken={envToken} />
      </div>
    </div>
  );
}
