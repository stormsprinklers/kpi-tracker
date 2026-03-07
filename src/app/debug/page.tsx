import { DeveloperConsole } from "@/components/DeveloperConsole";

export default function DebugPage() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            KPI Tracker — Developer Console
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Test API endpoints and inspect responses
          </p>
        </div>
        <a
          href="/"
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Back to Dashboard
        </a>
      </header>

      <main className="p-6">
        <DeveloperConsole />
      </main>
    </div>
  );
}
