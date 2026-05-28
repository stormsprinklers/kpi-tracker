import type { Metadata } from "next";
import { DemoDashboardClient } from "@/components/demo/DemoDashboardClient";

export const metadata: Metadata = {
  title: "Live demo | Home Services Analytics",
  description:
    "Explore a sample Home Services Analytics dashboard with fictional data — revenue, technician KPIs, crews, and CSR metrics.",
};

export default function DemoPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 flex-col gap-6 p-6">
        <DemoDashboardClient />
      </main>
    </div>
  );
}
