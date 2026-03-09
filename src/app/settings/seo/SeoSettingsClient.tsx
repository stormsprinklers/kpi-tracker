"use client";

import { useEffect, useState } from "react";

interface LocationOption {
  location_code: number;
  location_name: string;
  location_type?: string;
}

const MAX_KEYWORDS = 10;
const MAX_LOCATIONS = 20;

export function SeoSettingsClient() {
  const [website, setWebsite] = useState("");
  const [seoBusinessName, setSeoBusinessName] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [locations, setLocations] = useState<number[]>([]);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [locationSearch, setLocationSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [configRes, locationsRes] = await Promise.all([
          fetch("/api/settings/seo"),
          fetch("/api/marketing/seo/locations?country=us"),
        ]);
        if (!configRes.ok) throw new Error("Failed to load config");
        const config = (await configRes.json()) as {
          website: string;
          seo_business_name: string;
          keywords: string[];
          locations: number[];
        };
        setWebsite(config.website ?? "");
        setSeoBusinessName(config.seo_business_name ?? "");
        setKeywords(config.keywords ?? []);
        setLocations(config.locations ?? []);

        if (locationsRes.ok) {
          const locs = (await locationsRes.json()) as LocationOption[];
          setLocationOptions(locs);
        }
      } catch {
        setError("Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const addKeyword = () => {
    const k = newKeyword.trim();
    if (!k || keywords.length >= MAX_KEYWORDS) return;
    if (keywords.includes(k)) return;
    setKeywords((prev) => [...prev, k]);
    setNewKeyword("");
  };

  const removeKeyword = (i: number) => {
    setKeywords((prev) => prev.filter((_, j) => j !== i));
  };

  const toggleLocation = (code: number) => {
    setLocations((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= MAX_LOCATIONS) return prev;
      return [...prev, code];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/seo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website: website.trim() || null,
          seo_business_name: seoBusinessName.trim() || null,
          keywords,
          locations,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Website
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Domain to track (e.g. mycompany.com, no https://)
        </p>
        <input
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="example.com"
          className="mt-2 block w-full max-w-md rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Business name for local pack
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Used to match your listing in Google Business Profile / Local Finder results
        </p>
        <input
          type="text"
          value={seoBusinessName}
          onChange={(e) => setSeoBusinessName(e.target.value)}
          placeholder="Your business name"
          className="mt-2 block w-full max-w-md rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Keywords ({keywords.length}/{MAX_KEYWORDS})
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Keywords to monitor in organic search and local pack
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {keywords.map((k, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded bg-zinc-200 px-2 py-1 text-sm dark:bg-zinc-700"
            >
              {k}
              <button
                type="button"
                onClick={() => removeKeyword(i)}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                aria-label={`Remove ${k}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
            placeholder="Add keyword"
            className="block max-w-xs flex-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            disabled={keywords.length >= MAX_KEYWORDS}
          />
          <button
            type="button"
            onClick={addKeyword}
            disabled={!newKeyword.trim() || keywords.length >= MAX_KEYWORDS}
            className="rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Locations ({locations.length}/{MAX_LOCATIONS})
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Search and select specific cities or states to monitor
        </p>
        <input
          type="text"
          value={locationSearch}
          onChange={(e) => setLocationSearch(e.target.value)}
          placeholder="Search cities (e.g. Austin, Denver, Phoenix)..."
          className="mt-2 block w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <div className="mt-2 max-h-64 overflow-y-auto rounded border border-zinc-200 p-2 dark:border-zinc-700">
          {locationOptions.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to load locations.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {locationOptions
                .filter((l) => l.location_type !== "Country")
                .filter(
                  (l) =>
                    !locationSearch.trim() ||
                    l.location_name
                      .toLowerCase()
                      .includes(locationSearch.trim().toLowerCase())
                )
                .sort((a, b) => {
                  const aParts = a.location_name.split(",").length;
                  const bParts = b.location_name.split(",").length;
                  if (aParts !== bParts) return bParts - aParts;
                  return a.location_name.localeCompare(b.location_name);
                })
                .slice(0, locationSearch.trim() ? 300 : 100)
                .map((loc) => (
                  <label
                    key={loc.location_code}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <input
                      type="checkbox"
                      checked={locations.includes(loc.location_code)}
                      onChange={() => toggleLocation(loc.location_code)}
                      disabled={
                        !locations.includes(loc.location_code) &&
                        locations.length >= MAX_LOCATIONS
                      }
                      className="rounded border-zinc-300 dark:border-zinc-600"
                    />
                    <span className="text-sm text-zinc-900 dark:text-zinc-50">
                      {loc.location_name}
                    </span>
                  </label>
                ))}
              {locationOptions.filter(
                (l) =>
                  l.location_type !== "Country" &&
                  (!locationSearch.trim() ||
                    l.location_name
                      .toLowerCase()
                      .includes(locationSearch.trim().toLowerCase()))
              ).length > (locationSearch.trim() ? 300 : 100) && (
                <p className="py-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Refine your search to see more matches
                </p>
              )}
            </div>
          )}
        </div>
        {locations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {locations.map((code) => {
              const loc = locationOptions.find((l) => l.location_code === code);
              return (
                <span
                  key={code}
                  className="inline-flex items-center gap-1 rounded bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-700"
                >
                  {loc?.location_name ?? `#${code}`}
                  <button
                    type="button"
                    onClick={() => toggleLocation(code)}
                    className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                    aria-label={`Remove ${loc?.location_name ?? code}`}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </section>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
