import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { RoomStatus, SideTab } from "./chat-runtime-model";
import type { PrimaryRuntimeAction } from "./chat-main-panel-model";

type ChatRunCurrentActionCardProps = {
  primaryRuntimeAction: PrimaryRuntimeAction;
  setSideTab: (tab: SideTab) => void;
  approvalGateOpen: boolean;
  status: RoomStatus;
};

export function ChatRunCurrentActionCard({
  primaryRuntimeAction,
  setSideTab,
  approvalGateOpen,
  status
}: ChatRunCurrentActionCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d1117] p-3 text-sm shadow-lg shadow-black/10">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-gray-300">
              현재 액션
            </span>
            <span className="font-black text-white">{primaryRuntimeAction.label}</span>
          </div>
          <div className="mt-1 break-words text-xs leading-relaxed text-gray-400">
            {primaryRuntimeAction.caption}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSideTab(primaryRuntimeAction.tab)}
            className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition-colors ${primaryRuntimeAction.className}`}
          >
            {primaryRuntimeAction.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          {approvalGateOpen ? (
            <Link
              href="/runs"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
            >
              승인 큐
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : status === "completed" ? (
            <button
              type="button"
              onClick={() => setSideTab("cost")}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-yellow-300/20 bg-yellow-500/10 px-3 py-2 text-xs font-semibold text-yellow-100 hover:bg-yellow-500/15"
            >
              비용 확인
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSideTab("metrics")}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
            >
              지표 보기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
