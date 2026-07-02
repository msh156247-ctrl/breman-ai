import type { PendingApproval } from "../../lib/api";
import type { MissionRunState } from "../../types";

export type RoomStatus = "running" | "completed" | "blocked";
export type RuntimeDataMode = "loading" | "live" | "demo" | "fallback" | "error";
export type ChatRow = {
  id: string;
  type: "system" | "agent" | "human_gate";
  content: string;
  role?: string;
  timestamp: Date;
  source?: "api" | "stream" | "simulation";
};
export type TimelineKind = "mission" | "task" | "condition" | "route" | "loop" | "approval" | "quality" | "cost" | "system";
export type TimelineRow = {
  id: string;
  ts: string;
  event: string;
  detail?: string;
  role?: string;
  source: "api" | "stream";
  kind: TimelineKind;
  tone: "default" | "success" | "warning" | "danger" | "info";
  taskId?: string;
};
export type ArtifactTraceRow = {
  artifact: string;
  from: string;
  to: string;
  status: string;
  version: string;
  owner: string;
  changes: string[];
  taskId?: string;
};
export type CostRow = { provider: string; share: number; cost: number };
export type NodeMetricRow = { node: string; cost: number; confidence: number; retries: number; state: string };
export const SIDE_TABS = ["timeline", "approvals", "artifacts", "cost", "metrics"] as const;
export type SideTab = (typeof SIDE_TABS)[number];

export const missionStateLabels: Record<string, string> = {
  queued: "대기",
  planning: "준비 중",
  running: "실행 중",
  blocked: "확인 필요",
  awaiting_approval: "승인 대기",
  retrying: "재시도",
  escalated: "관리자 확인",
  completed: "완료",
  failed: "실패",
  cancelled: "취소"
};

export const runtimeModeLabels: Record<RuntimeDataMode, string> = {
  loading: "불러오는 중",
  live: "라이브 데이터",
  demo: "데모 데이터",
  fallback: "로컬 미리보기",
  error: "연결 오류"
};

export const sideTabLabels: Record<SideTab, string> = {
  timeline: "타임라인",
  approvals: "승인",
  artifacts: "산출물",
  cost: "비용",
  metrics: "지표"
};

export function normalizeSideTab(value: string | null): SideTab {
  return SIDE_TABS.includes(value as SideTab) ? (value as SideTab) : "timeline";
}

export function roomStatusFromMissionState(state: MissionRunState): RoomStatus {
  if (state === "completed") return "completed";
  if (["blocked", "awaiting_approval", "escalated", "failed", "cancelled"].includes(state)) return "blocked";
  return "running";
}

export function eventDate(value: unknown): Date {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) return new Date(value);
    if (value > 1_000_000_000) return new Date(value * 1000);
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  return new Date();
}

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
    failed: "실패",
    outbox_pending: "외부 전송 대기"
  };
  return labels[status] || status || "대기";
}

export function approvalDeliveryToneClass(status: string): string {
  if (status === "failed") return "border-rose-500/30 bg-rose-500/10 text-rose-100";
  if (status === "sent") return "border-cyan-500/25 bg-cyan-500/10 text-cyan-100";
  if (status === "outbox_pending") return "border-violet-500/25 bg-violet-500/10 text-violet-100";
  return "border-amber-400/20 bg-amber-500/[0.07] text-amber-100";
}

export function retryableApprovalNotifications(approval: PendingApproval | null) {
  if (!approval) return [];
  return approval.notifications.filter(
    (notification) =>
      notification.channel !== "admin_queue" &&
      notification.status !== "approved" &&
      ["failed", "outbox_pending", "pending"].includes(notification.delivery_status)
  );
}

export function appendUniqueChatRows(prev: ChatRow[], rows: ChatRow[], limit = 120): ChatRow[] {
  const seen = new Set(prev.map((row) => row.id));
  const merged = [...prev];
  rows.forEach((row) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    merged.push(row);
  });
  return merged.slice(-limit);
}

export function mergeApiChatRows(prev: ChatRow[], rows: ChatRow[]): ChatRow[] {
  const uniqueApiRows = appendUniqueChatRows([], rows, rows.length);
  const apiIds = new Set(uniqueApiRows.map((row) => row.id));
  const liveRows = prev.filter((row) => row.source !== "api" && !apiIds.has(row.id));
  return [...uniqueApiRows, ...liveRows].slice(-120);
}

export function compactArtifactValue(value: unknown): string {
  if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  if (value && typeof value === "object") return Object.keys(value).slice(0, 5).join(", ") || "object";
  return String(value ?? "empty");
}

export function summarizeArtifactValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.slice(0, 3).map((item, index) => `${index + 1}. ${compactArtifactValue(item)}`);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 4)
      .map(([key, row]) => `${key}: ${compactArtifactValue(row)}`);
  }
  return [compactArtifactValue(value)];
}


