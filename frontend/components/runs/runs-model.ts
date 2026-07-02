import type { PendingApproval } from "../../lib/api";
import type { MissionRunRecord, MissionRunState } from "../../types";

export const STATE_STYLE: Record<MissionRunState, string> = {
  queued: "border-slate-500/40 bg-slate-900/40 text-slate-200",
  planning: "border-cyan-500/40 bg-cyan-900/30 text-cyan-200",
  running: "border-blue-500/40 bg-blue-900/30 text-blue-200",
  retrying: "border-orange-500/40 bg-orange-900/25 text-orange-200",
  escalated: "border-fuchsia-500/40 bg-fuchsia-900/25 text-fuchsia-200",
  completed: "border-emerald-500/40 bg-emerald-900/25 text-emerald-200",
  failed: "border-rose-500/40 bg-rose-900/25 text-rose-200",
  awaiting_approval: "border-amber-500/40 bg-amber-900/25 text-amber-200",
  blocked: "border-violet-500/40 bg-violet-900/25 text-violet-200",
  cancelled: "border-gray-500/40 bg-gray-900/25 text-gray-300"
};

export const STATE_LABEL: Record<MissionRunState, string> = {
  queued: "대기",
  planning: "계획 중",
  running: "실행 중",
  retrying: "재시도",
  escalated: "에스컬레이션",
  completed: "완료",
  failed: "실패",
  awaiting_approval: "승인 대기",
  blocked: "차단",
  cancelled: "취소"
};

export type FilterKey = "all" | MissionRunState;
export type RuntimeQueueSyncOptions = {
  clearOnError?: boolean;
  silent?: boolean;
};

export type ApprovalQueueSummary = {
  active: number;
  recovered: number;
  failedDeliveries: number;
  externalChannels: number;
};

export function formatApprovalTime(value: number | string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 1_000_000_000_000 ? value : value * 1000).toLocaleString();
  }
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : "-";
}

export function approvalChannelLabel(channel: string): string {
  const labels: Record<string, string> = {
    admin_queue: "관리자 대기열",
    email: "이메일",
    sms: "문자",
    kakao: "카톡"
  };
  return labels[channel] || channel;
}

export function approvalDeliveryLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "대기",
    pending: "전송 준비",
    sent: "전송됨",
    failed: "전송 실패",
    outbox_pending: "외부 전송 대기"
  };
  return labels[status] || status || "대기";
}

export function approvalNotificationTone(status: string): string {
  if (status === "failed") return "border-rose-500/30 bg-rose-500/10 text-rose-100";
  if (status === "sent") return "border-cyan-500/25 bg-cyan-500/10 text-cyan-100";
  if (status === "outbox_pending") return "border-violet-500/25 bg-violet-500/10 text-violet-100";
  return "border-amber-500/25 bg-amber-500/10 text-amber-100";
}

export function retryableApprovalNotifications(approval: PendingApproval) {
  return approval.notifications.filter(
    (notification) =>
      notification.channel !== "admin_queue" &&
      notification.status !== "approved" &&
      ["failed", "outbox_pending", "pending"].includes(notification.delivery_status)
  );
}

export function approvalPriority(approval: PendingApproval): {
  label: string;
  className: string;
  nextAction: string;
} {
  const hasDeliveryFailure = approval.notifications.some((notification) => notification.delivery_status === "failed");
  if (!approval.runtime_active) {
    return {
      label: "재실행 확인",
      className: "border-violet-400/30 bg-violet-500/10 text-violet-100",
      nextAction: "옵스룸에서 런타임 상태 확인"
    };
  }
  if (hasDeliveryFailure) {
    return {
      label: "채널 오류",
      className: "border-rose-400/30 bg-rose-500/10 text-rose-100",
      nextAction: "전송 실패 채널 확인"
    };
  }
  if (approval.can_approve) {
    return {
      label: "승인 가능",
      className: "border-amber-400/30 bg-amber-500/10 text-amber-100",
      nextAction: "승인 처리"
    };
  }
  return {
    label: "확인 필요",
    className: "border-slate-400/30 bg-slate-500/10 text-slate-100",
    nextAction: "큐 동기화"
  };
}

export function runNextAction(row: MissionRunRecord): {
  href: string;
  label: string;
  caption: string;
  className: string;
} {
  const base = `/chat/${row.id}`;
  if (row.state === "awaiting_approval") {
    return {
      href: `${base}?tab=approvals`,
      label: "승인 처리",
      caption: "Human Gate 확인",
      className: "border-amber-300/30 bg-amber-500/10 text-amber-100"
    };
  }
  if (row.state === "completed") {
    return {
      href: `${base}?tab=artifacts`,
      label: "산출물 보기",
      caption: "결과 검토",
      className: "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
    };
  }
  if (row.state === "failed" || row.state === "blocked" || row.state === "cancelled") {
    return {
      href: `${base}?tab=timeline`,
      label: "원인 확인",
      caption: "타임라인 추적",
      className: "border-rose-300/25 bg-rose-500/10 text-rose-100"
    };
  }
  if (row.state === "retrying") {
    return {
      href: `${base}?tab=timeline`,
      label: "재시도 추적",
      caption: "이벤트 확인",
      className: "border-orange-300/25 bg-orange-500/10 text-orange-100"
    };
  }
  if (row.state === "queued" || row.state === "planning") {
    return {
      href: `${base}?tab=timeline`,
      label: "준비 상태 보기",
      caption: "실행 전 단계",
      className: "border-cyan-300/25 bg-cyan-500/10 text-cyan-100"
    };
  }
  return {
    href: `${base}?tab=timeline`,
    label: "실행 추적",
    caption: "실시간 이벤트",
    className: "border-blue-300/25 bg-blue-500/10 text-blue-100"
  };
}
