"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { useAppStore } from "../../stores/app.store";

export default function Navigation() {
  const pathname = usePathname();
  const hiredCount = useAppStore((s) => s.hiredAgents.length);
  const runCount = useAppStore((s) => s.nodes.length);
  const onLanding = pathname === "/";

  return (
    <nav className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between border-b border-white/5 bg-[#0A0A0A]/95 px-4 backdrop-blur-xl md:px-6">
      <Link href="/" className="group flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-sm font-black transition-colors group-hover:bg-blue-500">
          B
        </div>
        <span className="text-xl font-black tracking-tight">Bremen</span>
        {onLanding ? (
          <span className="hidden rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-gray-400 sm:inline">
            Workforce Runtime OS
          </span>
        ) : null}
      </Link>

      <div className="flex flex-wrap items-center justify-end gap-1.5 text-[10px] sm:gap-2 sm:text-xs">
        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-gray-300">
          Credits <span className="font-bold text-yellow-300">12,450</span>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-900/20 px-2 py-1 text-emerald-200">
          Runtime <span className="font-bold">Healthy</span>
        </div>
        <div className="hidden rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-gray-300 sm:block">
          Active Runs <span className="font-bold text-green-300">{runCount}</span>
        </div>
        <div className="hidden rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-gray-300 md:block">
          팀원 <span className="font-bold text-cyan-300">{hiredCount}</span>
        </div>
        <button
          type="button"
          className="rounded-lg border border-white/10 bg-white/5 p-2 text-gray-300 hover:bg-white/10"
          aria-label="알림"
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
