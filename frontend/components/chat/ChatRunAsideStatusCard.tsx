import { Activity } from "lucide-react";
import type { PendingApproval } from "../../lib/api";
import { approvalChannelLabel } from "./chat-runtime-model";

type ChatRunAsideStatusCardProps = {
  runtimeHealth: "attention" | "stable" | "running";
  runtimeHealthLabel: string;
  displayMissionStateLabel: string;
  displayRuntimeModeLabel: string;
  displayOwner: string;
  totalCost: number;
  nextOperationLabel: string;
  currentApproval: PendingApproval | null;
};

export function ChatRunAsideStatusCard({
  runtimeHealth,
  runtimeHealthLabel,
  displayMissionStateLabel,
  displayRuntimeModeLabel,
  displayOwner,
  totalCost,
  nextOperationLabel,
  currentApproval
}: ChatRunAsideStatusCardProps) {
  return (
    <div className="panel-shell mb-3 bg-black/30 px-3 py-2 text-xs text-gray-300">
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1 text-cyan-300">
          <Activity className="h-3.5 w-3.5" />
          운영 상태
        </span>
        <span className={runtimeHealth === "attention" ? "text-yellow-300" : "text-emerald-300"}>
          {runtimeHealthLabel}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2">
          <div className="text-[10px] text-gray-500">실행 상태</div>
          <div className="mt-1 font-semibold text-gray-100">{displayMissionStateLabel}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2">
          <div className="text-[10px] text-gray-500">데이터 출처</div>
          <div className="mt-1 font-semibold text-gray-100">{displayRuntimeModeLabel}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2">
          <div className="text-[10px] text-gray-500">소유자</div>
          <div className="mt-1 truncate font-semibold text-gray-100">{displayOwner || "unknown"}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2">
          <div className="text-[10px] text-gray-500">비용</div>
          <div className="mt-1 font-semibold text-gray-100">${totalCost.toFixed(2)}</div>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-cyan-500/15 bg-cyan-500/[0.06] px-2 py-2 text-[11px] leading-relaxed text-cyan-100">
        {nextOperationLabel}
      </div>
      {currentApproval && (
        <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/[0.08] px-2 py-2 text-[11px] leading-relaxed text-amber-100">
          승인 대기: {currentApproval.task_id || "task"} ·{" "}
          {currentApproval.approval_channels.map(approvalChannelLabel).join(", ") || "관리자 대기열"}
        </div>
      )}
    </div>
  );
}
