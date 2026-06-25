"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  CreditCard,
  History,
  Home,
  Key,
  Layers
} from "lucide-react";
import { useWorkspaceSettingsSync } from "../../hooks/useWorkspaceSettingsSync";

type ShellLink = {
  href: string;
  label: string;
  icon: typeof Home;
};

const PRIMARY_LINKS: ShellLink[] = [
  { href: "/studio", label: "홈", icon: Layers },
  { href: "/runs", label: "실행 기록", icon: History },
  { href: "/mypage?tab=keys", label: "API 키 관리", icon: Key },
  { href: "/mypage?tab=billing", label: "결제 및 크레딧", icon: CreditCard },
  { href: "/guide", label: "사용 가이드", icon: BookOpen }
];

const MOBILE_PRIMARY_LINKS: ShellLink[] = [
  { href: "/studio", label: "홈", icon: Layers },
  { href: "/runs", label: "실행", icon: History },
  { href: "/mypage?tab=keys", label: "API 키", icon: Key },
  { href: "/mypage?tab=billing", label: "결제", icon: CreditCard },
  { href: "/guide", label: "가이드", icon: BookOpen }
];

function linkMatches(pathname: string, searchParams: URLSearchParams, href: string): boolean {
  const [path, rawQs] = href.split("?");
  if (pathname !== path) return false;

  if (path === "/mypage") {
    const want = new URLSearchParams(rawQs || "").get("tab") || "overview";
    const cur = searchParams.get("tab") || "overview";
    return want === cur;
  }

  if (!rawQs) return true;
  const want = new URLSearchParams(rawQs);
  for (const [k, v] of want.entries()) {
    if (searchParams.get(k) !== v) return false;
  }
  return true;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [shellHeight, setShellHeight] = useState<string>("calc(100dvh - 4rem)");
  useWorkspaceSettingsSync();

  useEffect(() => {
    const updateShellHeight = () => {
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      setShellHeight(`${Math.max(360, Math.round(viewportHeight - 64))}px`);
    };

    updateShellHeight();
    window.addEventListener("resize", updateShellHeight);
    window.visualViewport?.addEventListener("resize", updateShellHeight);
    return () => {
      window.removeEventListener("resize", updateShellHeight);
      window.visualViewport?.removeEventListener("resize", updateShellHeight);
    };
  }, []);

  if (pathname === "/") {
    return <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto">{children}</div>;
  }

  return (
    <div className="flex min-h-0 w-full flex-1 max-md:flex-col md:flex-row" style={{ height: shellHeight }}>
      <aside
        aria-label="모바일 작업 운영 콘솔"
        className="side-rail sticky top-16 z-20 w-full shrink-0 border-b p-2 md:hidden"
      >
        <div className="grid grid-cols-5 gap-1">
          {MOBILE_PRIMARY_LINKS.map((item) => {
            const active = linkMatches(pathname, searchParams, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold transition-colors ${
                  active
                    ? "border border-blue-400/25 bg-blue-500/15 text-white shadow-sm shadow-blue-500/10"
                    : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                <span className="w-full truncate text-center leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </aside>

      <aside className="side-rail sticky top-16 z-20 hidden w-52 shrink-0 flex-col gap-0 self-start overflow-y-auto border-r p-3 pt-4 md:flex md:[max-height:calc(100vh-4rem)] xl:w-56">
        <div className="mb-0 hidden px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 md:mb-3 md:block">
          작업 콘솔
        </div>
        <div className="flex flex-1 flex-row gap-1 md:flex-col md:gap-0.5">
          {PRIMARY_LINKS.map((item) => {
            const active = linkMatches(pathname, searchParams, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`group flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all max-md:whitespace-nowrap ${
                  active
                    ? "border-blue-400/25 bg-gradient-to-r from-blue-500/[0.18] to-cyan-500/10 text-white shadow-sm shadow-blue-500/10"
                    : "border-transparent text-gray-500 hover:border-white/[0.08] hover:bg-white/[0.045] hover:text-gray-300"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 transition-colors ${active ? "text-blue-200" : "opacity-80 group-hover:text-gray-300"}`} />
                <span className="leading-snug">{item.label}</span>
              </Link>
            );
          })}
        </div>
        <div className="hidden border-t border-white/5 p-3 md:block">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/80">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-sm shadow-emerald-300/50" />
              Flow Ops
            </div>
            <div className="text-[10px] leading-relaxed text-gray-500">
              설계 → 실행 → 관측
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">{children}</main>
    </div>
  );
}
