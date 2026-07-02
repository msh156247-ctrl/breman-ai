import Link from "next/link";
import { ArrowRight, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import type { PendingApproval } from "../../lib/api";
import {
  approvalChannelLabel,
  approvalDeliveryLabel,
  approvalDeliveryToneClass,
  formatApprovalTime,
  type TimelineRow
} from "./chat-runtime-model";
import { timelineToneClass } from "./chat-timeline-model";

type ChatRunAsideApprovalsPanelProps = {
  approvalNextAction: string;
  approvalGateOpen: boolean;
  currentApproval: PendingApproval | null;
  isDemoMission: boolean;
  isApproving: boolean;
  handleApprove: () => void;
  approvalRetryableNotifications: PendingApproval["notifications"];
  handleRetryApprovalNotifications: () => void;
  isRetryingApprovalNotifications: boolean;
  approvalChannelSummary: string;
  approvalTimeline: TimelineRow[];
};

export function ChatRunAsideApprovalsPanel({
  approvalNextAction,
  approvalGateOpen,
  currentApproval,
  isDemoMission,
  isApproving,
  handleApprove,
  approvalRetryableNotifications,
  handleRetryApprovalNotifications,
  isRetryingApprovalNotifications,
  approvalChannelSummary,
  approvalTimeline
}: ChatRunAsideApprovalsPanelProps) {
  return (
    <div className="mb-4 space-y-3">
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-3 text-xs text-amber-50">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 font-semibold text-amber-200">
            <ShieldCheck className="h-4 w-4" />
            승인 운영
          </h3>
          <span className="rounded border border-amber-300/20 bg-black/25 px-2 py-1 text-[10px] font-semibold text-amber-100">
            {approvalNextAction}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
            <div className="text-[10px] text-amber-100/50">게이트</div>
            <div className="mt-1 font-semibold text-white">
              {currentApproval?.gate_stage || (approvalGateOpen ? "동기화 중" : "없음")}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
            <div className="text-[10px] text-amber-100/50">채널</div>
            <div className="mt-1 truncate font-semibold text-white">{approvalChannelSummary}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
            <div className="text-[10px] text-amber-100/50">대상</div>
            <div className="mt-1 truncate font-semibold text-white">
              {currentApproval?.approval_target || "운영 관리자"}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
            <div className="text-[10px] text-amber-100/50">요청 시각</div>
            <div className="mt-1 font-semibold text-white">
              {currentApproval ? formatApprovalTime(currentApproval.requested_at) : "-"}
            </div>
          </div>
        </div>
        <div className="mt-3 text-[11px] leading-relaxed text-amber-100/70">
          {currentApproval
            ? currentApproval.runtime_active
              ? "현재 런타임 waiter가 살아 있어 이 화면이나 승인 큐에서 바로 승인할 수 있습니다."
              : "기록에서 복원된 승인 대기입니다. 런타임 재실행 여부를 먼저 확인하세요."
            : approvalGateOpen
              ? "미션 상태는 승인 대기지만 큐 항목을 아직 동기화하지 못했습니다."
              : "열린 Human Gate가 없습니다. 승인 이벤트는 아래 기록으로 확인할 수 있습니다."}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={isApproving || (!currentApproval && !isDemoMission) || Boolean(currentApproval && !currentApproval.can_approve)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {!currentApproval && !isDemoMission
              ? "대기 없음"
              : currentApproval && !currentApproval.can_approve
                ? "재실행 필요"
                : isApproving
                  ? "승인 중"
                  : "승인하고 계속"}
          </button>
          {approvalRetryableNotifications.length > 0 ? (
            <button
              type="button"
              onClick={handleRetryApprovalNotifications}
              disabled={isRetryingApprovalNotifications}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-violet-300/20 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRetryingApprovalNotifications ? "animate-spin" : ""}`} />
              {isRetryingApprovalNotifications ? "재전송 중" : "알림 재전송"}
            </button>
          ) : null}
          <Link
            href="/runs"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
          >
            승인 큐 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/mypage?tab=approval"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
          >
            채널 설정
          </Link>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-cyan-300">알림 채널 상태</h3>
          <span className="text-[11px] text-gray-500">
            {currentApproval?.notifications.length || 0} notifications
          </span>
        </div>
        {approvalRetryableNotifications.length > 0 ? (
          <div className="mb-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-[11px] leading-5 text-violet-100/85">
            {approvalRetryableNotifications.map((notification) => approvalChannelLabel(notification.channel)).join(", ")} 알림은
            재전송할 수 있습니다.
          </div>
        ) : null}
        <div className="space-y-2 text-xs">
          {currentApproval?.notifications.length ? (
            currentApproval.notifications.map((notification) => (
              <div
                key={notification.id || `${notification.channel}-${notification.updated_at}`}
                className={`rounded-xl border px-3 py-2 ${approvalDeliveryToneClass(notification.delivery_status)}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{approvalChannelLabel(notification.channel)}</span>
                  <span className="rounded bg-black/25 px-1.5 py-0.5 text-[10px]">
                    {approvalDeliveryLabel(notification.delivery_status)}
                  </span>
                </div>
                <div className="mt-1 truncate opacity-70">target: {notification.target || "운영 관리자"}</div>
                <div className="mt-1 text-[11px] opacity-65">
                  transport {notification.delivery_transport || "internal_queue"} · status {notification.status}
                </div>
                {notification.delivery_error && (
                  <div className="mt-1 text-[11px] text-rose-100/90">{notification.delivery_error}</div>
                )}
              </div>
            ))
          ) : currentApproval ? (
            currentApproval.approval_channels.map((channel) => (
              <div key={channel} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-gray-300">
                <div className="font-semibold text-gray-100">{approvalChannelLabel(channel)}</div>
                <div className="mt-1 text-[11px] text-gray-500">알림 생성 대기 중</div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-gray-500">
              현재 대기 중인 알림 채널이 없습니다.
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-amber-300">승인 이벤트</h3>
          <span className="text-[11px] text-gray-500">{approvalTimeline.length} events</span>
        </div>
        <div className="max-h-[260px] space-y-2 overflow-y-auto text-xs">
          {approvalTimeline.map((event) => (
            <div key={event.id} className={`rounded-xl border px-2.5 py-2 ${timelineToneClass(event.tone)}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{event.event}</span>
                <span className="shrink-0 text-[10px] opacity-60">{event.ts}</span>
              </div>
              {event.detail && <div className="whitespace-pre-wrap text-[11px] leading-relaxed opacity-75">{event.detail}</div>}
            </div>
          ))}
          {approvalTimeline.length === 0 && (
            <div className="log-row px-2 py-2 text-gray-500">아직 승인 이벤트가 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
}
