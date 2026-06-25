const DEFAULT_API_BASE_URL = "http://localhost:8000";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function apiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BREMEN_API_BASE_URL;
  return trimTrailingSlash(configured && configured.trim() ? configured : DEFAULT_API_BASE_URL);
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBaseUrl()}${normalizedPath}`;
}

export function wsBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BREMEN_WS_BASE_URL;
  if (configured && configured.trim()) {
    return trimTrailingSlash(configured.trim());
  }
  return apiBaseUrl().replace(/^http/i, "ws");
}

export function wsUrl(path: string, query?: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const cleanQuery = query ? query.replace(/^\?/, "") : "";
  return `${wsBaseUrl()}${normalizedPath}${cleanQuery ? `?${cleanQuery}` : ""}`;
}
