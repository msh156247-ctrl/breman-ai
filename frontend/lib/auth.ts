export type SessionIdentity = {
  userId: string;
  role: string;
  jwt: string;
};

const DEFAULT_USER_ID = "local-owner";
const DEFAULT_ROLE = "owner";

export function readSessionIdentity(): SessionIdentity {
  if (typeof window === "undefined") {
    return { userId: DEFAULT_USER_ID, role: DEFAULT_ROLE, jwt: "" };
  }
  return {
    userId: localStorage.getItem("bremen_user_id") || DEFAULT_USER_ID,
    role: localStorage.getItem("bremen_user_role") || DEFAULT_ROLE,
    jwt: localStorage.getItem("bremen_jwt") || ""
  };
}

export function buildAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const identity = readSessionIdentity();
  const headers: Record<string, string> = {
    "X-User-Id": identity.userId,
    "X-User-Role": identity.role,
    ...extra
  };
  if (identity.jwt.trim()) {
    headers.Authorization = `Bearer ${identity.jwt.trim()}`;
  }
  return headers;
}

export function wsAuthQuery(): string {
  const identity = readSessionIdentity();
  const params = new URLSearchParams({
    user_id: identity.userId,
    user_role: identity.role
  });
  if (identity.jwt.trim()) {
    params.set("jwt", identity.jwt.trim());
  }
  return params.toString();
}
