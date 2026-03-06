const HCP_API_BASE = "https://api.housecallpro.com/v1";

function getHeaders(): HeadersInit {
  const token = process.env.HOUSECALLPRO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("HOUSECALLPRO_ACCESS_TOKEN is not set");
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function getCompany() {
  const res = await fetch(`${HCP_API_BASE}/company`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getJobs(params?: { per_page?: number; page?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.per_page) searchParams.set("per_page", String(params.per_page));
  if (params?.page) searchParams.set("page", String(params.page));
  const query = searchParams.toString();
  const url = `${HCP_API_BASE}/jobs${query ? `?${query}` : ""}`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    throw new Error(`Housecall Pro API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function isConfigured(): boolean {
  return !!process.env.HOUSECALLPRO_ACCESS_TOKEN;
}
