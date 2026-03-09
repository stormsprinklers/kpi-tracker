"use client";

import { useEffect, useState } from "react";

interface LocationOption {
  location_code: number;
  location_name: string;
  location_type?: string;
}

interface ServiceArea {
  id?: string;
  name: string;
  location_values: string[];
}

const MAX_KEYWORDS = 10;
const MAX_LOCATIONS = 50;

function getLocationDisplay(value: string, locationOptions: LocationOption[]): string {
  if (value.startsWith("zip:")) {
    const parts = value.split(":");
    if (parts.length >= 2) return `ZIP ${parts[1]}`;
    return value;
  }
  const code = parseInt(value, 10);
  if (!Number.isNaN(code)) {
    const loc = locationOptions.find((l) => l.location_code === code);
    return loc?.location_name ?? `#${code}`;
  }
  return value;
}

export function SeoSettingsClient() {
  const [website, setWebsite] = useState("");
  const [seoBusinessName, setSeoBusinessName] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [locationSearch, setLocationSearch] = useState("");
  const [zipInput, setZipInput] = useState("");
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
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
          locations: (string | number)[];
          serviceAreas?: { id: string; name: string; location_values: string[] }[];
        };
        setWebsite(config.website ?? "");
        setSeoBusinessName(config.seo_business_name ?? "");
        setKeywords(config.keywords ?? []);
        setLocations(
          (config.locations ?? []).map((l) =>
            typeof l === "number" ? String(l) : l
          )
        );
        setServiceAreas(
          config.serviceAreas?.map((a) => ({
            id: a.id,
            name: a.name,
            location_values: a.location_values ?? [],
          })) ?? []
        );

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

  const addZipCode = async () => {
    const zip = zipInput.replace(/\D/g, "").slice(0, 5);
    if (!zip || zip.length !== 5) {
      setZipError("Enter a 5-digit US zip code");
      return;
    }
    const value = `zip:${zip}:0,0`;
    if (locations.includes(value) || locations.some((l) => l.startsWith(`zip:${zip}:`))) {
      setZipError("Zip code already added");
      return;
    }
    if (locations.length >= MAX_LOCATIONS) {
      setZipError(`Maximum ${MAX_LOCATIONS} locations`);
      return;
    }
    setZipLoading(true);
    setZipError(null);
    try {
      const res = await fetch(`/api/marketing/seo/zip-lookup?zip=${zip}`);
      const data = (await res.json()) as { error?: string; zip?: string; lat?: number; lng?: number };
      if (!res.ok) {
        setZipError(data.error ?? "Zip code not found");
        return;
      }
      const locValue = `zip:${data.zip}:${data.lat},${data.lng}`;
      if (locations.includes(locValue)) {
        setZipError("Zip code already added");
        return;
      }
      setLocations((prev) => [...prev, locValue]);
      setZipInput("");
    } catch {
      setZipError("Failed to look up zip code");
    } finally {
      setZipLoading(false);
    }
  };

  const toggleLocation = (value: string) => {
    setLocations((prev) => {
      if (prev.includes(value)) return prev.filter((c) => c !== value);
      if (prev.length >= MAX_LOCATIONS) return prev;
      return [...prev, value];
    });
  };

  const removeLocation = (value: string) => {
    setLocations((prev) => prev.filter((c) => c !== value));
    setServiceAreas((prev) =>
      prev.map((a) => ({
        ...a,
        location_values: a.location_values.filter((v) => v !== value),
      }))
    );
  };

  const addServiceArea = () => {
    setServiceAreas((prev) => [
      ...prev,
      { name: `Area ${prev.length + 1}`, location_values: [] },
    ]);
  };

  const updateServiceArea = (idx: number, patch: Partial<ServiceArea>) => {
    setServiceAreas((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, ...patch } : a))
    );
  };

  const removeServiceArea = (idx: number) => {
    setServiceAreas((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleServiceAreaLocation = (areaIdx: number, locValue: string) => {
    setServiceAreas((prev) =>
      prev.map((a, i) => {
        if (i !== areaIdx) return a;
        const has = a.location_values.includes(locValue);
        return {
          ...a,
          location_values: has
            ? a.location_values.filter((v) => v !== locValue)
            : [...a.location_values, locValue],
        };
      })
    );
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
          serviceAreas,
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
          Add cities or zip codes to monitor. Combine them into service areas below for average rankings.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            type="text"
            value={zipInput}
            onChange={(e) => {
              setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5));
              setZipError(null);
            }}
            placeholder="Add zip (e.g. 75201)"
            className="block w-28 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="button"
            onClick={addZipCode}
            disabled={zipLoading}
            className="rounded bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
          >
            {zipLoading ? "…" : "Add zip"}
          </button>
        </div>
        {zipError && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{zipError}</p>
        )}
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
                .map((loc) => {
                  const value = String(loc.location_code);
                  return (
                    <label
                      key={loc.location_code}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <input
                        type="checkbox"
                        checked={locations.includes(value)}
                        onChange={() => toggleLocation(value)}
                        disabled={
                          !locations.includes(value) &&
                          locations.length >= MAX_LOCATIONS
                        }
                        className="rounded border-zinc-300 dark:border-zinc-600"
                      />
                      <span className="text-sm text-zinc-900 dark:text-zinc-50">
                        {loc.location_name}
                      </span>
                    </label>
                  );
                })}
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
            {locations.map((val) => (
              <span
                key={val}
                className="inline-flex items-center gap-1 rounded bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-700"
              >
                {getLocationDisplay(val, locationOptions)}
                <button
                  type="button"
                  onClick={() => removeLocation(val)}
                  className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                  aria-label={`Remove ${getLocationDisplay(val, locationOptions)}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Service areas
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Group locations into service areas. Reports will show average ranking across all cities/zips in each area.
        </p>
        <div className="mt-2 space-y-3">
          {serviceAreas.map((area, idx) => (
            <div
              key={idx}
              className="rounded border border-zinc-200 p-3 dark:border-zinc-700"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={area.name}
                  onChange={(e) => updateServiceArea(idx, { name: e.target.value })}
                  placeholder="Area name (e.g. North Texas)"
                  className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                />
                <button
                  type="button"
                  onClick={() => removeServiceArea(idx)}
                  className="text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                  aria-label="Remove area"
                >
                  ×
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {locations.length === 0 ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Add locations above first
                  </p>
                ) : (
                  locations.map((val) => {
                    const checked = area.location_values.includes(val);
                    return (
                      <label
                        key={val}
                        className="flex cursor-pointer items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-xs hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleServiceAreaLocation(idx, val)}
                          className="rounded border-zinc-300 dark:border-zinc-600"
                        />
                        {getLocationDisplay(val, locationOptions)}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addServiceArea}
          className="mt-2 rounded border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
        >
          + Add service area
        </button>
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
