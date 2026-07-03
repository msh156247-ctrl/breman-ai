import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import type { PendingApproval } from "../../lib/api";
import {
  approvalChannelLabel,
  formatApprovalTime,
  type RoomStatus,
  type SideTab
} from "./chat-runtime-model";

type ChatRunApprovalGateCardProps = {
  currentApproval: PendingApproval | null;
  isDemoMission: boolean;
  approvalLastSyncedAt: Date | null;
  approvalRetryableNotifications: PendingApproval["notifications"];
  isRetryingApprovalNotifications: boolean;
  handleRetryApprovalNotifications: () => void;
  handleApprove: () => void;
  isApproving: boolean;
  approvalSyncError: string;
  status: RoomStatus;
  setSideTab: (tab: SideTab) => void;
};

export function ChatRunApprovalGateCard({
  currentApproval,
  isDemoMission,
  approvalLastSyncedAt,
  approvalRetryableNotifications,
  isRetryingApprovalNotifications,
  handleRetryApprovalNotifications,
  handleApprove,
  isApproving,
  approvalSyncError,
  status,
  setSideTab
}: ChatRunApprovalGateCardProps) {
  return (
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
          <ApprovalMetadataGrid currentApproval={currentApproval} />
          <ApprovalChannelBadges currentApproval={currentApproval} />
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
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {!currentApproval.can_approve ? "재실행 필요" : isApproving ? "승인 중" : "승인하고 계속 진행"}
            </button>
            {approvalRetryableNotifications.length > 0 ? (
              <button
                type="button"
                onClick={handleRetryApprovalNotifications}
                disabled={isRetryingApprovalNotifications}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-violet-300/20 bg-violet-500/10 px-4 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRetryingApprovalNotifications ? "animate-spin" : ""}`} />
                {isRetryingApprovalNotifications ? "재전송 중" : "알림 재전송"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setSideTab("approvals")}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/15"
            >
              승인 흐름 보기 <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <Link
              href="/runs"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
            >
              승인 큐 보기 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/mypage?tab=approval"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
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
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isApproving ? "승인 중" : "승인하고 계속 진행"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ApprovalMetadataGrid({ currentApproval }: { currentApproval: PendingApproval }) {
  return (
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
  );
}

function ApprovalChannelBadges({ currentApproval }: { currentApproval: PendingApproval }) {
  return (
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
  );
}
