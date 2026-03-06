import { DeveloperConsole } from "@/components/DeveloperConsole";

export default function DebugPage() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          KPI Tracker — Developer Console
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Test API endpoints and inspect responses
        </p>
      </header>

      <main className="p-6">
        <DeveloperConsole />
      </main>
    </div>
  );
}
