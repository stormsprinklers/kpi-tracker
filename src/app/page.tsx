import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getOrganizationById } from "@/lib/db/queries";
import { KeyMetricsSection } from "@/components/KeyMetricsSection";
import { TechnicianRevenueSection } from "@/components/TechnicianRevenueSection";
import { LandingPage } from "@/components/LandingPage";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return <LandingPage />;
  }
  if (!session.user.organizationId) {
    redirect("/setup");
  }
  const org = await getOrganizationById(session.user.organizationId);
  const connected = !!org?.hcp_access_token;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <KeyMetricsSection connected={connected} />
        {connected && <TechnicianRevenueSection />}
      </main>
    </div>
  );
}
