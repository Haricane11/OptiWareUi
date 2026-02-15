const DEFAULT_BASE = "http://127.0.0.1:8000";

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_BASE;
}

function buildUrl(path) {
  const base = getApiBaseUrl().replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function parseError(res) {
  try {
    const data = await res.json();
    if (data?.detail) {
      return typeof data.detail === "string" ? data.detail : "Request failed";
    }
  } catch {}
  return `Request failed: ${res.status}`;
}

export async function httpGetJson(path) {
  const res = await fetch(buildUrl(path), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function httpPostJson(path, body) {
  const res = await fetch(buildUrl(path), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
