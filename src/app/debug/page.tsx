import { DeveloperConsole } from "@/components/DeveloperConsole";

export default function DebugPage() {
  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: "#F8FAFC" }}>
      <header className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "#0B1F33", backgroundColor: "#F8FAFC" }}>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "#0B1F33" }}>
            Home Services Analytics — Developer Console
          </h1>
          <p className="mt-1 text-sm opacity-80" style={{ color: "#0B1F33" }}>
            Test API endpoints and inspect responses
          </p>
        </div>
      </header>

      <main className="p-6">
        <DeveloperConsole />
      </main>
    </div>
  );
}
