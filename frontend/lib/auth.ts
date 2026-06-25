export type SessionIdentity = {
  userId: string;
  role: SessionRole;
  jwt: string;
  expiresAt: string;
};

export type SessionRole = "owner" | "admin" | "supervisor" | "member" | "viewer";

export const SESSION_ROLES: SessionRole[] = ["owner", "admin", "supervisor", "member", "viewer"];

const DEFAULT_USER_ID = "local-owner";
const DEFAULT_ROLE: SessionRole = "owner";
const USER_ID_KEY = "bremen_user_id";
const ROLE_KEY = "bremen_user_role";
const JWT_KEY = "bremen_jwt";
const JWT_EXPIRES_AT_KEY = "bremen_jwt_expires_at";
export const SESSION_IDENTITY_CHANGED_EVENT = "bremen:session-identity-changed";

function normalizeRole(value: string | null): SessionRole {
  const role = (value || "").trim().toLowerCase();
  return SESSION_ROLES.includes(role as SessionRole) ? (role as SessionRole) : DEFAULT_ROLE;
}

export function readSessionIdentity(): SessionIdentity {
  if (typeof window === "undefined") {
    return { userId: DEFAULT_USER_ID, role: DEFAULT_ROLE, jwt: "", expiresAt: "" };
  }
  try {
    return {
      userId: localStorage.getItem(USER_ID_KEY) || DEFAULT_USER_ID,
      role: normalizeRole(localStorage.getItem(ROLE_KEY)),
      jwt: localStorage.getItem(JWT_KEY) || "",
      expiresAt: localStorage.getItem(JWT_EXPIRES_AT_KEY) || ""
    };
  } catch {
    return { userId: DEFAULT_USER_ID, role: DEFAULT_ROLE, jwt: "", expiresAt: "" };
  }
}

export function saveSessionIdentity(identity: {
  userId: string;
  role: SessionRole;
  jwt?: string;
  expiresAt?: string;
}): SessionIdentity {
  const previous = readSessionIdentity();
  const next: SessionIdentity = {
    userId: identity.userId.trim() || DEFAULT_USER_ID,
    role: normalizeRole(identity.role),
    jwt: identity.jwt?.trim() || "",
    expiresAt: identity.expiresAt?.trim() || ""
  };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(USER_ID_KEY, next.userId);
      localStorage.setItem(ROLE_KEY, next.role);
      if (next.jwt) {
        localStorage.setItem(JWT_KEY, next.jwt);
        localStorage.setItem(JWT_EXPIRES_AT_KEY, next.expiresAt);
      } else {
        localStorage.removeItem(JWT_KEY);
        localStorage.removeItem(JWT_EXPIRES_AT_KEY);
      }
    } catch {
      throw new Error("session_storage_unavailable");
    }
    window.dispatchEvent(
      new CustomEvent(SESSION_IDENTITY_CHANGED_EVENT, {
        detail: { previous, next }
      })
    );
  }
  return next;
}

export function clearSessionToken(): SessionIdentity {
  const current = readSessionIdentity();
  return saveSessionIdentity({ userId: current.userId, role: current.role, jwt: "", expiresAt: "" });
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
