import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import type { PendingApproval } from "../../lib/api";
import {
  approvalChannelLabel,
  approvalDeliveryLabel,
  approvalNotificationTone,
  approvalPriority,
  formatApprovalTime,
  retryableApprovalNotifications,
  type ApprovalQueueSummary
} from "./runs-model";

type RunsApprovalQueueProps = {
  isDemoMode: boolean;
  runDataMode: "demo" | "loading" | "live" | "fallback";
  pendingApprovals: PendingApproval[];
  approvalQueueSummary: ApprovalQueueSummary;
  lastSyncedAt: Date | null;
  approvalNotice: string;
  approvalError: string;
  approvingMissionId: string;
  retryingMissionId: string;
  onRefresh: () => void;
  onApprove: (approval: PendingApproval) => void;
  onRetryNotifications: (approval: PendingApproval) => void;
};

export function RunsApprovalQueue({
  isDemoMode,
  runDataMode,
  pendingApprovals,
  approvalQueueSummary,
  lastSyncedAt,
  approvalNotice,
  approvalError,
  approvingMissionId,
  retryingMissionId,
  onRefresh,
  onApprove,
  onRetryNotifications
}: RunsApprovalQueueProps) {
  return (
    <div className="mb-8 rounded-2xl border border-amber-500/20 bg-amber-500/[0.045] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-black text-white">
            <ShieldCheck className="h-5 w-5 text-amber-200" />
            승인 대기 큐
          </div>
          <div className="mt-1 text-xs text-amber-100/60">
            Human Gate가 열린 MissionRun을 여기서 확인하고 승인합니다.
          </div>
        </div>
        <span className="rounded border border-amber-400/30 bg-black/25 px-2 py-1 text-xs font-semibold text-amber-100">
          {isDemoMode ? "DEMO 안내" : runDataMode === "loading" ? "동기화 중" : `${pendingApprovals.length}건 대기`}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-amber-100/65">
        <span>{lastSyncedAt ? `마지막 동기화 ${lastSyncedAt.toLocaleTimeString()}` : "승인 큐 동기화 대기"}</span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={runDataMode === "loading"}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-semibold text-gray-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${runDataMode === "loading" ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      {!isDemoMode && pendingApprovals.length > 0 ? (
        <div className="mb-3 grid gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.07] px-3 py-2 text-emerald-100">
            <div className="text-[10px] uppercase text-emerald-100/55">Active</div>
            <div className="mt-1 text-base font-black">{approvalQueueSummary.active}</div>
          </div>
          <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.07] px-3 py-2 text-violet-100">
            <div className="text-[10px] uppercase text-violet-100/55">Recovered</div>
            <div className="mt-1 text-base font-black">{approvalQueueSummary.recovered}</div>
          </div>
          <div className="rounded-xl border border-rose-400/20 bg-rose-500/[0.07] px-3 py-2 text-rose-100">
            <div className="text-[10px] uppercase text-rose-100/55">Channel errors</div>
            <div className="mt-1 text-base font-black">{approvalQueueSummary.failedDeliveries}</div>
          </div>
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.07] px-3 py-2 text-cyan-100">
            <div className="text-[10px] uppercase text-cyan-100/55">External</div>
            <div className="mt-1 text-base font-black">{approvalQueueSummary.externalChannels}</div>
          </div>
        </div>
      ) : null}

      {isDemoMode ? (
        <div className="mb-3 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
          Live 모드에서는 Human Gate가 열린 MissionRun이 이 큐에 표시되고, 여기서 관리자 승인 처리를 할 수 있습니다.
        </div>
      ) : null}
      {approvalNotice ? (
        <div className="mb-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          {approvalNotice}
        </div>
      ) : null}
      {approvalError ? (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-900/20 px-3 py-2 text-xs text-rose-100">
          승인 큐 동기화/처리에 실패했습니다. {approvalError}
        </div>
      ) : null}

      {pendingApprovals.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {pendingApprovals.map((approval) => {
            const priority = approvalPriority(approval);
            const failedNotifications = approval.notifications.filter((notification) => notification.delivery_status === "failed");
            const retryableNotifications = retryableApprovalNotifications(approval);
            return (
              <div
                key={`${approval.mission_id}-${approval.task_id}`}
                className="rounded-xl border border-amber-400/20 bg-black/25 p-3"
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-cyan-200">
                      {approval.mission_id}
                    </code>
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                        approval.runtime_active
                          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                          : "border-violet-400/30 bg-violet-500/10 text-violet-100"
                      }`}
                    >
                      {approval.runtime_active ? "active" : "기록 복원"}
                    </span>
                    <span className="rounded border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100">
                      {approval.gate_stage}
                    </span>
                    <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-300">
                      {approval.role || "worker"}
                    </span>
                  </div>
                  <span className={`rounded border px-2 py-1 text-[10px] font-black ${priority.className}`}>
                    {priority.label}
                  </span>
                </div>
                <div className="line-clamp-2 text-sm font-semibold text-gray-100">{approval.mission_goal}</div>
                <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] text-gray-300">
                  다음 행동: <span className="font-semibold text-gray-100">{priority.nextAction}</span>
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-gray-500">
                  <div>task: {approval.task_id || "-"}</div>
                  <div>
                    channels:{" "}
                    {approval.approval_channels.map(approvalChannelLabel).join(", ") || approvalChannelLabel("admin_queue")}
                  </div>
                  <div>target: {approval.approval_target || "운영 관리자"}</div>
                  <div>requested: {formatApprovalTime(approval.requested_at)}</div>
                </div>
                {approval.notifications.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {approval.notifications.map((notification) => (
                      <span
                        key={notification.id || `${approval.mission_id}-${notification.channel}`}
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                          notification.status === "approved"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                            : approvalNotificationTone(notification.delivery_status)
                        }`}
                        title={notification.delivery_error || notification.delivery_transport}
                      >
                        {approvalChannelLabel(notification.channel)} · {notification.status} ·{" "}
                        {approvalDeliveryLabel(notification.delivery_status)}
                      </span>
                    ))}
                  </div>
                )}
                {failedNotifications.length > 0 && (
                  <div className="mt-3 flex gap-2 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[11px] leading-5 text-rose-100/85">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {failedNotifications.map((notification) => approvalChannelLabel(notification.channel)).join(", ")} 전송
                      실패. 채널 설정 또는 외부 webhook을 확인하세요.
                    </span>
                  </div>
                )}
                {retryableNotifications.length > 0 && failedNotifications.length === 0 && (
                  <div className="mt-3 flex gap-2 rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-[11px] leading-5 text-violet-100/85">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {retryableNotifications.map((notification) => approvalChannelLabel(notification.channel)).join(", ")} 알림이
                      외부 outbox에 대기 중입니다.
                    </span>
                  </div>
                )}
                {!approval.runtime_active && (
                  <div className="mt-3 flex gap-2 rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-[11px] leading-5 text-violet-100/80">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-200" />
                    <span>
                      기록상 승인 대기였지만 현재 대기 런타임이 살아있지 않습니다. 옵스룸에서 상태를 확인한 뒤 재실행하세요.
                    </span>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onApprove(approval)}
                    disabled={approvingMissionId === approval.mission_id || !approval.can_approve}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {!approval.can_approve
                      ? "재실행 필요"
                      : approvingMissionId === approval.mission_id
                        ? "승인 중"
                        : "승인 처리"}
                  </button>
                  {retryableNotifications.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => onRetryNotifications(approval)}
                      disabled={retryingMissionId === approval.mission_id}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-violet-300/20 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${retryingMissionId === approval.mission_id ? "animate-spin" : ""}`} />
                      {retryingMissionId === approval.mission_id ? "재전송 중" : "알림 재전송"}
                    </button>
                  ) : null}
                  <Link
                    href={`/chat/${approval.mission_id}?tab=timeline`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
                  >
                    옵스룸 열기 <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-amber-400/20 px-3 py-5 text-center text-sm text-amber-100/50">
          {runDataMode === "loading" ? "승인 대기 큐를 불러오는 중입니다." : "현재 승인 대기 중인 실행이 없습니다."}
        </div>
      )}
    </div>
  );
}
