"use client";

import { useRef, useState } from "react";

export function CompanyLogoSection({
  organizationId,
  initialLogoUrl,
}: {
  organizationId: string;
  initialLogoUrl: string | null;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/organizations/logo", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as { logoUrl?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }
      setLogoUrl(data.logoUrl ?? null);
      window.dispatchEvent(new CustomEvent("logoUpdated", { detail: { logoUrl: data.logoUrl } }));
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Company Profile Picture
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Shown in the header next to your company name.
      </p>
      <div className="mt-3 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Company logo" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl font-semibold text-zinc-500 dark:text-zinc-400">?</span>
          )}
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
          {error && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      </div>
    </section>
  );
}
