import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import type { RefObject } from "react";
import type { PendingApproval } from "../../lib/api";
import { approvalChannelLabel, formatApprovalTime, type ChatRow, type RuntimeDataMode, type SideTab } from "./chat-runtime-model";

type OperationEventCounts = {
  routes: number;
  loops: number;
  approvals: number;
  conditions: number;
  risks: number;
};

type PrimaryRuntimeAction = {
  tab: SideTab;
  label: string;
  caption: string;
  className: string;
};

type ChatRunMainPanelProps = {
  runtimeLoadError: string | null;
  primaryRuntimeAction: PrimaryRuntimeAction;
  setSideTab: (tab: SideTab) => void;
  approvalGateOpen: boolean;
  status: "running" | "completed" | "blocked";
  currentApproval: PendingApproval | null;
  isDemoMission: boolean;
  approvalLastSyncedAt: Date | null;
  approvalRetryableNotifications: PendingApproval["notifications"];
  isRetryingApprovalNotifications: boolean;
  handleRetryApprovalNotifications: () => void;
  handleApprove: () => void;
  isApproving: boolean;
  approvalSyncError: string;
  messages: ChatRow[];
  operationEventCounts: OperationEventCounts;
  runtimeHealthLabel: string;
  displayRuntimeModeLabel: string;
  displayRuntimeDataMode: RuntimeDataMode;
  bottomRef: RefObject<HTMLDivElement>;
};

export function ChatRunMainPanel({
  runtimeLoadError,
  primaryRuntimeAction,
  setSideTab,
  approvalGateOpen,
  status,
  currentApproval,
  isDemoMission,
  approvalLastSyncedAt,
  approvalRetryableNotifications,
  isRetryingApprovalNotifications,
  handleRetryApprovalNotifications,
  handleApprove,
  isApproving,
  approvalSyncError,
  messages,
  operationEventCounts,
  runtimeHealthLabel,
  displayRuntimeModeLabel,
  displayRuntimeDataMode,
  bottomRef
}: ChatRunMainPanelProps) {
  return (
<div className="min-h-[360px] min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
  {runtimeLoadError && (
    <div className="rounded-lg border border-yellow-500/25 bg-yellow-500/[0.08] px-3 py-2 text-xs text-yellow-100">
      라이브 실행 기록이 아직 없어 로컬 미리보기 스트림을 표시합니다.
    </div>
  )}
  <div className="rounded-2xl border border-white/10 bg-[#0d1117] p-3 text-sm shadow-lg shadow-black/10">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-gray-300">
            현재 액션
          </span>
          <span className="font-black text-white">{primaryRuntimeAction.label}</span>
        </div>
        <div className="mt-1 break-words text-xs leading-relaxed text-gray-400">{primaryRuntimeAction.caption}</div>
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
  {approvalGateOpen && (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-4 text-sm text-amber-50 shadow-lg shadow-amber-950/20">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-base font-black text-white">
            <ShieldCheck className="h-5 w-5 text-amber-200" />
            현재 승인 대기
          </div>
          <div className="mt-1 text-xs text-amber-100/70">
            Human Gate가 열린 노드는 승인 처리 전까지 다음 단계로 넘어가지 않습니다.
          </div>
        </div>
        <span className="rounded border border-amber-400/30 bg-black/30 px-2 py-1 text-[11px] font-semibold text-amber-100">
          {currentApproval ? currentApproval.gate_stage : isDemoMission ? "데모 게이트" : "동기화 확인 필요"}
        </span>
      </div>
      {approvalLastSyncedAt && (
        <div className="mb-3 text-[11px] text-amber-100/55">
          승인 큐 동기화 {approvalLastSyncedAt.toLocaleTimeString()}
        </div>
      )}
      {currentApproval ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
              <div className="text-[10px] uppercase text-amber-100/50">Task</div>
              <div className="mt-1 truncate font-semibold text-white">{currentApproval.task_id || "-"}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
              <div className="text-[10px] uppercase text-amber-100/50">Requested</div>
              <div className="mt-1 font-semibold text-white">{formatApprovalTime(currentApproval.requested_at)}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
              <div className="text-[10px] uppercase text-amber-100/50">Target</div>
              <div className="mt-1 truncate font-semibold text-white">
                {currentApproval.approval_target || "운영 관리자"}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
              <div className="text-[10px] uppercase text-amber-100/50">Runtime</div>
              <div className="mt-1 font-semibold text-white">
                {currentApproval.runtime_active ? "대기 런타임 활성" : "기록에서 복원됨"}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {currentApproval.approval_channels.map((channel) => (
              <span
                key={channel}
                className="rounded border border-amber-300/25 bg-amber-400/10 px-2 py-1 text-[11px] font-semibold text-amber-100"
              >
                {approvalChannelLabel(channel)}
              </span>
            ))}
            {currentApproval.notifications.map((notification) => (
              <span
                key={notification.id || `${notification.channel}-${notification.status}`}
                className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                  notification.delivery_status === "failed"
                    ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
                    : notification.delivery_status === "sent"
                      ? "border-cyan-400/25 bg-cyan-500/10 text-cyan-100"
                      : "border-white/10 bg-white/[0.05] text-gray-300"
                }`}
                title={notification.delivery_error || notification.delivery_transport}
              >
                {approvalChannelLabel(notification.channel)} · {notification.delivery_status}
              </span>
            ))}
          </div>
          {!currentApproval.runtime_active && (
            <div className="mt-3 flex gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs leading-5 text-violet-100/80">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>대기 기록은 남아 있지만 현재 런타임 waiter가 없어 재실행 확인이 필요할 수 있습니다.</span>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={isApproving || !currentApproval.can_approve}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {!currentApproval.can_approve ? "재실행 필요" : isApproving ? "승인 중" : "승인하고 계속 진행"}
            </button>
            {approvalRetryableNotifications.length > 0 ? (
              <button
                type="button"
                onClick={handleRetryApprovalNotifications}
                disabled={isRetryingApprovalNotifications}
                className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300/20 bg-violet-500/10 px-4 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRetryingApprovalNotifications ? "animate-spin" : ""}`} />
                {isRetryingApprovalNotifications ? "재전송 중" : "알림 재전송"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setSideTab("approvals")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/15"
            >
              승인 흐름 보기 <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <Link
              href="/runs"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
            >
              승인 큐 보기 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/mypage?tab=approval"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
            >
              채널 설정
            </Link>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-yellow-400/20 bg-black/20 px-3 py-2 text-xs leading-5 text-yellow-100/75">
          {isDemoMission
            ? "데모 승인 대기 상태입니다. 아래 버튼으로 로컬 승인 흐름을 이어갈 수 있습니다."
            : approvalSyncError
              ? `승인 큐를 확인하지 못했습니다. ${approvalSyncError}`
              : "실행 상태는 승인 대기입니다. 승인 큐 동기화가 끝나면 채널과 처리 버튼이 이곳에 표시됩니다."}
          {isDemoMission && status === "blocked" && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={isApproving}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isApproving ? "승인 중" : "승인하고 계속 진행"}
            </button>
          )}
        </div>
      )}
    </div>
  )}
  <div className="panel-shell mb-1 bg-[#0d1117] px-3 py-2 text-xs text-gray-400">
    <div className="flex flex-wrap items-center gap-2">
      <span>이벤트 스트림 · {messages.length}건 · {runtimeHealthLabel} · {displayRuntimeModeLabel}</span>
      <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-100">
        route {operationEventCounts.routes}
      </span>
      <span className="rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-100">
        loop {operationEventCounts.loops}
      </span>
      <span className="rounded border border-yellow-500/20 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-100">
        approval {operationEventCounts.approvals}
      </span>
      <span className="rounded border border-slate-500/20 bg-slate-500/10 px-1.5 py-0.5 text-[10px] text-slate-100">
        condition {operationEventCounts.conditions}
      </span>
    </div>
  </div>
  {messages.map((msg) => (
    <div key={msg.id} className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-800">
        {msg.type === "system" ? "🤖" : msg.type === "agent" ? "⚙️" : "⚠️"}
      </div>
      <div className="min-w-0 max-w-2xl flex-1">
        {msg.role && <div className="mb-1 text-xs font-bold uppercase text-gray-500">{msg.role}</div>}
        <div
          className={`whitespace-pre-wrap rounded-2xl p-4 text-sm ${
            msg.type === "human_gate"
              ? "border border-yellow-500/30 bg-yellow-500/10 text-yellow-100"
              : "border border-white/10 bg-[#111111] text-gray-200"
          }`}
        >
          {msg.content}
          {msg.type === "human_gate" && status === "blocked" && (
            <div className="mt-4 flex space-x-2">
              <button
                onClick={handleApprove}
                disabled={isApproving}
                className="rounded-lg bg-yellow-500 px-4 py-2 font-bold text-black transition-colors hover:bg-yellow-400"
              >
                {isApproving ? "승인 중..." : "승인하고 계속 진행"}
              </button>
            </div>
          )}
        </div>
        <div className="mt-1 text-xs text-gray-600">{msg.timestamp.toLocaleTimeString()}</div>
      </div>
    </div>
  ))}
  {messages.length === 0 && (
    <div className="text-sm text-gray-600">
      {displayRuntimeDataMode === "loading" ? "런타임 스냅샷을 불러오는 중..." : "실시간 이벤트 대기 중..."}
    </div>
  )}
  <div ref={bottomRef} />
</div>
  );
}
