"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchHealth } from "../../lib/api";
import { isDemoModeEnabled } from "../../lib/demo-mode";
import { useAppStoreHydrated } from "../../hooks/useAppStoreHydrated";
import { useAppStore } from "../../stores/app.store";

export default function Navigation() {
  const pathname = usePathname();
  const hiredCount = useAppStore((s) => s.hiredAgents.length);
  const runCount = useAppStore((s) => s.nodes.length);
  const workspaceHydrated = useAppStoreHydrated();
  const onLanding = pathname === "/";
  const isDemoMode = isDemoModeEnabled();
  const [runtimeStatus, setRuntimeStatus] = useState<"checking" | "healthy" | "degraded" | "offline">("checking");

  useEffect(() => {
    if (isDemoMode) {
      setRuntimeStatus("healthy");
      return;
    }
    let cancelled = false;
    setRuntimeStatus("checking");
    fetchHealth()
      .then((health) => {
        if (cancelled) return;
        setRuntimeStatus(health.status === "healthy" ? "healthy" : "degraded");
      })
      .catch(() => {
        if (!cancelled) setRuntimeStatus("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [isDemoMode]);

  const runtimeTone =
    runtimeStatus === "healthy"
      ? "border-emerald-500/30 bg-emerald-900/20 text-emerald-200"
      : runtimeStatus === "degraded"
        ? "border-amber-500/30 bg-amber-900/20 text-amber-100"
      : runtimeStatus === "checking"
        ? "border-yellow-500/30 bg-yellow-900/20 text-yellow-100"
        : "border-rose-500/30 bg-rose-900/20 text-rose-200";
  const runtimeLabel = isDemoMode
    ? "Demo"
    : runtimeStatus === "checking"
      ? "Checking"
      : runtimeStatus === "healthy"
        ? "Healthy"
        : runtimeStatus === "degraded"
          ? "Degraded"
          : "Offline";

  return (
    <nav className="top-nav-glass sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between border-b px-4 backdrop-blur-xl md:px-6">
      <Link href="/" className="group flex min-h-9 items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-cyan-500 to-emerald-400 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition-transform group-hover:scale-105">
          B
        </div>
        <span className="text-xl font-black tracking-tight text-white">Bremen</span>
        {onLanding ? (
          <span className="hidden rounded-lg border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-gray-400 sm:inline">
            Workforce Runtime OS
          </span>
        ) : null}
      </Link>

      <div className="flex flex-wrap items-center justify-end gap-1.5 text-[10px] sm:gap-2 sm:text-xs">
        <div
          className="rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-gray-300 shadow-sm shadow-black/20"
          title={`Mode ${isDemoMode ? "Demo" : "Live"}`}
          aria-label={`Mode ${isDemoMode ? "Demo" : "Live"}`}
        >
          Mode <span className="font-bold text-yellow-300">{isDemoMode ? "Demo" : "Live"}</span>
        </div>
        <div
          className={`rounded-lg border px-2 py-1 shadow-sm shadow-black/20 ${runtimeTone}`}
          title={`Runtime ${runtimeLabel}`}
          aria-label={`Runtime ${runtimeLabel}`}
        >
          Runtime <span className="font-bold">{runtimeLabel}</span>
        </div>
        <div
          className="hidden rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-gray-300 shadow-sm shadow-black/20 sm:block"
          title={`실행 단계 ${workspaceHydrated ? runCount : "loading"}`}
          aria-label={`실행 단계 ${workspaceHydrated ? runCount : "loading"}`}
        >
          실행 단계 <span className="font-bold text-green-300">{workspaceHydrated ? runCount : "..."}</span>
        </div>
        <div
          className="hidden rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-gray-300 shadow-sm shadow-black/20 md:block"
          title={`에이전트 ${workspaceHydrated ? hiredCount : "loading"}`}
          aria-label={`에이전트 ${workspaceHydrated ? hiredCount : "loading"}`}
        >
          에이전트 <span className="font-bold text-cyan-300">{workspaceHydrated ? hiredCount : "..."}</span>
        </div>
      </div>
    </nav>
  );
}
