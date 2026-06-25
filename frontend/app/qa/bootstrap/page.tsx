"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSessionIdentity, type SessionRole, SESSION_ROLES } from "../../../lib/auth";

export default function QaBootstrapPage() {
  const router = useRouter();
  const [message, setMessage] = useState("격리 QA 세션을 준비하는 중입니다.");
  const enabled = process.env.NEXT_PUBLIC_BREMEN_E2E_MODE === "true";

  useEffect(() => {
    if (!enabled) {
      setMessage("이 경로는 격리 E2E 환경에서만 사용할 수 있습니다.");
      return;
    }

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const userId = (params.get("user_id") || "").trim();
    const role = (params.get("role") || "").trim().toLowerCase() as SessionRole;
    const jwt = (params.get("jwt") || "").trim();
    const expiresAt = (params.get("expires_at") || "").trim();
    const nextPath = params.get("next") || "/studio";

    if (!userId || !jwt || !SESSION_ROLES.includes(role)) {
      setMessage("유효한 QA 세션 정보가 없습니다.");
      return;
    }

    saveSessionIdentity({ userId, role, jwt, expiresAt });
    window.history.replaceState(null, "", "/qa/bootstrap");
    router.replace(nextPath.startsWith("/") ? nextPath : "/studio");
  }, [enabled, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07090d] px-6 text-center text-sm text-gray-400">
      {message}
    </main>
  );
}
