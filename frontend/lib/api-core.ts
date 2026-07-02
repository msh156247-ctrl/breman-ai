const API_REQUEST_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("api_request_timeout"), API_REQUEST_TIMEOUT_MS);
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) abortFromExternal();
    else externalSignal.addEventListener("abort", abortFromExternal, { once: true });
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

export function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function asStringList(value: unknown, fallback: string[] = []): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : fallback;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function apiErrorMessage(res: Response, code: string): Promise<string> {
  let detail = "";
  try {
    const body = asRecord(await res.clone().json());
    const rawDetail = body.detail ?? body.error ?? body.message;
    detail = asText(rawDetail) || (rawDetail !== undefined ? JSON.stringify(rawDetail) : "");
  } catch {
    try {
      detail = (await res.clone().text()).trim();
    } catch {
      detail = "";
    }
  }
  return [code, String(res.status), detail].filter(Boolean).join(":");
}
