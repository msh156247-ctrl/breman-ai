import { BellRing, CreditCard, Key, LayoutDashboard, ShieldCheck } from "lucide-react";

export type MyPageTab = "overview" | "session" | "keys" | "approval" | "billing";

export function normalizeMyPageTab(value: string | null): MyPageTab {
  return value === "keys" ||
    value === "approval" ||
    value === "billing" ||
    value === "overview" ||
    value === "session"
    ? value
    : "overview";
}

type MyPageTabsProps = {
  activeTab: MyPageTab;
  jwtOnlyMode: boolean;
  onChange: (tab: MyPageTab) => void;
};

export function MyPageTabs({ activeTab, jwtOnlyMode, onChange }: MyPageTabsProps) {
  const tabClass = (tab: MyPageTab) =>
    `flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold sm:justify-start sm:px-5 ${
      activeTab === tab ? "bg-white/10 text-white" : "text-gray-500"
    }`;

  return (
    <div className="mb-8 grid grid-cols-2 gap-1 rounded-2xl bg-[#111111] p-1 sm:flex sm:flex-wrap">
      <button type="button" onClick={() => onChange("overview")} className={tabClass("overview")}>
        <LayoutDashboard className="h-4 w-4" />
        개요
      </button>
      {!jwtOnlyMode ? (
        <button type="button" onClick={() => onChange("session")} className={tabClass("session")}>
          <ShieldCheck className="h-4 w-4" />
          세션
        </button>
      ) : null}
      <button type="button" onClick={() => onChange("keys")} className={tabClass("keys")}>
        <Key className="h-4 w-4" />
        API 키 관리
      </button>
      <button type="button" onClick={() => onChange("approval")} className={tabClass("approval")}>
        <BellRing className="h-4 w-4" />
        승인 채널
      </button>
      <button type="button" onClick={() => onChange("billing")} className={`col-span-2 ${tabClass("billing")} sm:col-span-1`}>
        <CreditCard className="h-4 w-4" />
        결제 · 크레딧
      </button>
    </div>
  );
}
