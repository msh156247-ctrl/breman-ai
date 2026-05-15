"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import {
  BookOpen,
  Building2,
  CreditCard,
  History,
  Home,
  Key,
  Layers,
  Link2,
  UserCircle,
  Users
} from "lucide-react";

type ShellLink = {
  href: string;
  label: string;
  icon: typeof Home;
};

const PRIMARY_LINKS: ShellLink[] = [
  { href: "/", label: "홈 · 철학", icon: Home },
  { href: "/market?tab=agents", label: "팀원 마켓", icon: Users },
  { href: "/market?tab=teams", label: "팀 마켓", icon: Building2 },
  { href: "/mypage?tab=overview", label: "내 공간", icon: UserCircle },
  { href: "/studio", label: "내 팀 (스튜디오)", icon: Layers },
  { href: "/studio?graph=organization", label: "연결된 팀", icon: Link2 },
  { href: "/runs", label: "실행 기록", icon: History },
  { href: "/mypage?tab=keys", label: "API 키 관리", icon: Key },
  { href: "/mypage?tab=billing", label: "결제 및 크레딧", icon: CreditCard },
  { href: "/guide", label: "사용 가이드", icon: BookOpen }
];

function linkMatches(pathname: string, searchParams: URLSearchParams, href: string): boolean {
  const [path, rawQs] = href.split("?");
  if (pathname !== path) return false;

  if (path === "/market") {
    const want = new URLSearchParams(rawQs || "").get("tab") || "agents";
    const cur = searchParams.get("tab") || "agents";
    return want === cur;
  }

  if (path === "/studio") {
    const wantOrg = new URLSearchParams(rawQs || "").get("graph") === "organization";
    const curOrg = searchParams.get("graph") === "organization";
    return wantOrg === curOrg;
  }

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

  if (pathname === "/") {
    return <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto">{children}</div>;
  }

  return (
    <div className="flex min-h-0 w-full flex-1 max-md:flex-col md:flex-row">
      <aside className="sticky top-16 z-20 flex w-full shrink-0 flex-row gap-1 overflow-x-auto border-b border-white/5 bg-[#060606] p-2 md:top-16 md:w-56 md:flex-col md:gap-0 md:self-start md:overflow-y-auto md:border-b-0 md:border-r md:p-3 md:pt-4 md:[max-height:calc(100vh-4rem)]">
        <div className="mb-0 hidden px-2 text-[10px] font-semibold uppercase tracking-wide text-gray-600 md:mb-3 md:block">
          조직 운영 콘솔
        </div>
        <div className="flex flex-1 flex-row gap-1 md:flex-col md:gap-0.5">
          {PRIMARY_LINKS.map((item) => {
            const active = linkMatches(pathname, searchParams, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors max-md:whitespace-nowrap ${
                  active ? "bg-white/10 text-white" : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                <span className="leading-snug">{item.label}</span>
              </Link>
            );
          })}
        </div>
        <div className="hidden border-t border-white/5 p-3 text-[10px] leading-relaxed text-gray-600 md:block">
          Marketplace → Runtime → Observability 한 흐름으로 실행 조직을 운영합니다.
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">{children}</main>
    </div>
  );
}
