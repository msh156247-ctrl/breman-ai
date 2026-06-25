"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Coins,
  GitBranch,
  Loader2,
  RefreshCw,
  Repeat2,
  ShieldCheck,
  SkipForward,
  Timer
} from "lucide-react";
import {
  approveMissionGate,
  fetchMissionArtifacts,
  fetchMissionDetail,
  fetchMissionEvaluations,
  fetchMissionTimeline,
  fetchPendingApprovals,
  retryApprovalNotifications,
  type MissionArtifactsResponse,
  type MissionDetail,
  type MissionTimelineEvent,
  type PendingApproval
} from "../../lib/api";
import { wsAuthQuery } from "../../lib/auth";
import { MOCK_MISSION_RUNS } from "../../lib/mock-data";
import { wsUrl } from "../../lib/runtime-config";
import { useAppStore } from "../../stores/app.store";
import type { MissionRunState } from "../../types";

type RoomStatus = "running" | "completed" | "blocked";
type RuntimeDataMode = "loading" | "live" | "demo" | "fallback" | "error";
type ChatRow = {
  id: string;
  type: "system" | "agent" | "human_gate";
  content: string;
  role?: string;
  timestamp: Date;
  source?: "api" | "stream" | "simulation";
};
type TimelineKind = "mission" | "task" | "condition" | "route" | "loop" | "approval" | "quality" | "cost" | "system";
type TimelineRow = {
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
type ArtifactTraceRow = {
  artifact: string;
  from: string;
  to: string;
  status: string;
  version: string;
  owner: string;
  changes: string[];
  taskId?: string;
};
type CostRow = { provider: string; share: number; cost: number };
type NodeMetricRow = { node: string; cost: number; confidence: number; retries: number; state: string };
const SIDE_TABS = ["timeline", "approvals", "artifacts", "cost", "metrics"] as const;
type SideTab = (typeof SIDE_TABS)[number];

const missionStateLabels: Record<string, string> = {
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

const runtimeModeLabels: Record<RuntimeDataMode, string> = {
  loading: "불러오는 중",
  live: "라이브 데이터",
  demo: "데모 데이터",
  fallback: "로컬 미리보기",
  error: "연결 오류"
};

const sideTabLabels: Record<SideTab, string> = {
  timeline: "타임라인",
  approvals: "승인",
  artifacts: "산출물",
  cost: "비용",
  metrics: "지표"
};

function normalizeSideTab(value: string | null): SideTab {
  return SIDE_TABS.includes(value as SideTab) ? (value as SideTab) : "timeline";
}

function roomStatusFromMissionState(state: MissionRunState): RoomStatus {
  if (state === "completed") return "completed";
  if (["blocked", "awaiting_approval", "escalated", "failed", "cancelled"].includes(state)) return "blocked";
  return "running";
}

function eventMessage(event: MissionTimelineEvent): string {
  return String(event.message || event.type || JSON.stringify(event));
}

function compactEventText(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  if (Array.isArray(value)) return value.map((item) => compactEventText(item)).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function eventStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function eventTaskLabel(event: MissionTimelineEvent): string {
  return String(event.task_id || event.role || "mission");
}

function eventKind(type: string): TimelineKind {
  const normalized = type.toLowerCase();
  if (normalized.includes("human_gate") || normalized.includes("approve") || normalized.includes("approval")) return "approval";
  if (normalized.includes("workflow_loop")) return "loop";
  if (normalized.includes("workflow_route")) return "route";
  if (normalized.includes("condition") || normalized.includes("task_skipped")) return "condition";
  if (normalized.includes("evaluation")) return "quality";
  if (normalized.includes("cost") || normalized.includes("ledger")) return "cost";
  if (normalized.includes("execution")) return "task";
  if (normalized.includes("task")) return "task";
  if (normalized.includes("mission")) return "mission";
  return "system";
}

function eventTone(type: string): TimelineRow["tone"] {
  const normalized = type.toLowerCase();
  if (normalized.includes("failed") || normalized.includes("error") || normalized.includes("blocked")) return "danger";
  if (normalized.includes("human_gate") || normalized.includes("approval") || normalized.includes("skipped")) return "warning";
  if (normalized.includes("completed") || normalized.includes("approved") || normalized.includes("exited")) return "success";
  if (normalized.includes("route") || normalized.includes("loop") || normalized.includes("condition")) return "info";
  return "default";
}

function describeRuntimeEvent(event: MissionTimelineEvent): { title: string; detail?: string } {
  const type = String(event.type || "event");
  const taskLabel = eventTaskLabel(event);
  if (type === "workflow_route_applied") {
    const selected = (event.selected_branch && typeof event.selected_branch === "object"
      ? (event.selected_branch as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const label = compactEventText(selected.label || selected.id || event.selected_target_id, "선택된 분기");
    const skipped = eventStringList(event.skipped_task_ids);
    const action = compactEventText(event.selected_action, "node");
    return {
      title: `조건 분기 적용 · ${label}`,
      detail:
        action === "node"
          ? `다음 노드: ${compactEventText(event.selected_target_id, "-")} · 제외: ${skipped.length ? skipped.join(", ") : "없음"}`
          : action === "end"
            ? `플로우 종료 분기 · 제외: ${skipped.length ? skipped.join(", ") : "없음"}`
            : `알림 분기 · 제외: ${skipped.length ? skipped.join(", ") : "없음"}`
    };
  }
  if (type === "workflow_route_evaluated") {
    const selected = (event.selected_branch && typeof event.selected_branch === "object"
      ? (event.selected_branch as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    return {
      title: `조건 평가 완료 · ${compactEventText(selected.label || selected.id, "선택 없음")}`,
      detail: `평가된 분기: ${eventStringList(event.evaluated_branches).length || (Array.isArray(event.evaluated_branches) ? event.evaluated_branches.length : 0)}개`
    };
  }
  if (type === "workflow_route_notification") {
    return {
      title: "조건 알림 분기 선택",
      detail: compactEventText(event.notify_message, "알림 메시지가 등록되지 않았습니다.")
    };
  }
  if (type === "workflow_loop_started") {
    return {
      title: `반복 영역 시작 · ${compactEventText(event.loop_region_name || event.loop_region_id, "loop")}`,
      detail: `최대 ${compactEventText(event.max_iterations, "1")}회 · 노드 ${eventStringList(event.task_ids).length}개`
    };
  }
  if (type === "workflow_loop_iteration_started") {
    return {
      title: `반복 ${compactEventText(event.iteration, "-")}/${compactEventText(event.max_iterations, "-")}회차 실행`,
      detail: compactEventText(event.loop_region_name || event.loop_region_id, "loop")
    };
  }
  if (type === "workflow_loop_iteration_completed") {
    return {
      title: `반복 ${compactEventText(event.iteration, "-")}회차 완료`,
      detail: compactEventText(event.task_statuses, "")
    };
  }
  if (type === "workflow_loop_condition_evaluated") {
    const satisfied = event.satisfied === true || compactEventText(event.satisfied) === "true";
    const loopName = compactEventText(event.loop_region_name || event.loop_region_id, "loop");
    const expression = compactEventText(event.expression, "종료 조건 없음");
    return {
      title: `반복 종료 조건 ${satisfied ? "충족" : "미충족"} · ${loopName}`,
      detail: `${compactEventText(event.iteration, "-")}/${compactEventText(event.max_iterations, "-")}회차 · ${compactEventText(event.exit_condition_node_id, "종료 노드")} · ${expression}`
    };
  }
  if (type === "workflow_loop_exited") {
    return {
      title: `반복 종료 · ${compactEventText(event.reason, "done")}`,
      detail: `${compactEventText(event.iterations, "1")}회 실행 · ${compactEventText(event.loop_region_name || event.loop_region_id, "loop")}`
    };
  }
  if (type === "workflow_condition_evaluated") {
    return {
      title: `실행 조건 평가 · ${taskLabel}`,
      detail: compactEventText(event.allowed) === "true" ? "조건 충족, 실행 가능" : "조건 미충족, 실행 제외"
    };
  }
  if (type === "task_skipped") {
    return {
      title: `노드 건너뜀 · ${taskLabel}`,
      detail: compactEventText(event.condition || event.route, eventMessage(event))
    };
  }
  if (type === "human_gate_requested") {
    return {
      title: `승인 대기 · ${taskLabel}`,
      detail: `${eventStringList(event.approval_channels).join(", ") || "admin_queue"} · ${compactEventText(event.gate_stage, "before_run")}`
    };
  }
  if (type === "human_gate_approved") {
    return {
      title: `승인 완료 · ${taskLabel}`,
      detail: `승인자: ${compactEventText(event.approved_by, "unknown")} · ${compactEventText(event.gate_stage, "")}`
    };
  }
  if (type === "approval_notification_queued") {
    return {
      title: `승인 알림 대기 · ${compactEventText(event.channel, "admin_queue")}`,
      detail: `${compactEventText(event.delivery_mode, "internal_queue")} · target ${compactEventText(event.target, "운영 관리자")}`
    };
  }
  if (type === "approval_notification_delivery") {
    return {
      title: `승인 알림 전송 · ${compactEventText(event.channel, "admin_queue")}`,
      detail: `${compactEventText(event.delivery_status, "queued")} · ${compactEventText(event.delivery_transport, "internal_queue")}`
    };
  }
  if (type === "approval_notification_retry_requested") {
    return {
      title: `승인 알림 재전송 · ${compactEventText(event.channel, "admin_queue")}`,
      detail: `요청자 ${compactEventText(event.retried_by, "unknown")} · ${compactEventText(event.delivery_status, "pending")}`
    };
  }
  if (type === "approval_notification_resolved") {
    return {
      title: `승인 알림 처리 완료 · ${compactEventText(event.channel, "admin_queue")}`,
      detail: `status ${compactEventText(event.status, "approved")} · approved_by ${compactEventText(event.approved_by, "unknown")}`
    };
  }
  if (type === "task_started") {
    return { title: `노드 실행 시작 · ${taskLabel}`, detail: eventMessage(event) };
  }
  if (type === "task_completed") {
    return { title: `노드 완료 · ${taskLabel}`, detail: `cost ${compactEventText(event.cost, "0")}` };
  }
  if (type === "task_failed") {
    return { title: `노드 실패 · ${taskLabel}`, detail: eventMessage(event) };
  }
  if (type === "execution_result") {
    return {
      title: `실행 결과 수신 · ${taskLabel}`,
      detail: compactEventText(event.execution_pass) === "true" ? "실행 성공 · 품질 검사 대기" : "실행 실패"
    };
  }
  if (type === "mission_completed") {
    return { title: "미션 완료", detail: compactEventText(event.cost, eventMessage(event)) };
  }
  if (type === "mission_failed") {
    return { title: "미션 실패", detail: eventMessage(event) };
  }
  if (type === "evaluation_result") {
    return {
      title: `품질 평가 · ${taskLabel}`,
      detail: `score ${compactEventText(event.score, "0")} · quality ${compactEventText(event.quality_pass, "pending")}`
    };
  }
  return { title: eventMessage(event) };
}

function eventChatType(kind: string): ChatRow["type"] {
  const normalized = kind.toLowerCase();
  if (normalized.includes("human_gate") || normalized.includes("approve") || normalized.includes("approval")) return "human_gate";
  if (normalized.includes("task") || normalized.includes("execution") || normalized.includes("evaluation")) return "agent";
  return "system";
}

function eventDate(value: unknown): Date {
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

function formatEventTime(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) return new Date(value).toLocaleTimeString();
    if (value > 1_000_000_000) return new Date(value * 1000).toLocaleTimeString();
    return `${value.toFixed(1)}s`;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toLocaleTimeString();
    return value;
  }
  return "-";
}

function formatApprovalTime(value: number | string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 1_000_000_000_000 ? value : value * 1000).toLocaleString();
  }
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : "-";
}

function approvalChannelLabel(channel: string): string {
  const labels: Record<string, string> = {
    admin_queue: "관리자 대기열",
    email: "이메일",
    sms: "문자",
    kakao: "카톡"
  };
  return labels[channel] || channel;
}

function approvalDeliveryLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "대기",
    pending: "전송 준비",
    sent: "전송됨",
    failed: "실패",
    outbox_pending: "외부 전송 대기"
  };
  return labels[status] || status || "대기";
}

function approvalDeliveryToneClass(status: string): string {
  if (status === "failed") return "border-rose-500/30 bg-rose-500/10 text-rose-100";
  if (status === "sent") return "border-cyan-500/25 bg-cyan-500/10 text-cyan-100";
  if (status === "outbox_pending") return "border-violet-500/25 bg-violet-500/10 text-violet-100";
  return "border-amber-400/20 bg-amber-500/[0.07] text-amber-100";
}

function retryableApprovalNotifications(approval: PendingApproval | null) {
  if (!approval) return [];
  return approval.notifications.filter(
    (notification) =>
      notification.channel !== "admin_queue" &&
      notification.status !== "approved" &&
      ["failed", "outbox_pending", "pending"].includes(notification.delivery_status)
  );
}

function eventToChatRow(event: MissionTimelineEvent, index: number): ChatRow {
  const kind = String(event.type || "event");
  const eventTarget = String(event.task_id || event.mission_id || "mission");
  const eventStamp = String(event.timestamp ?? index);
  const summary = describeRuntimeEvent(event);
  return {
    id: `event-${kind}-${eventTarget}-${eventStamp}`,
    type: eventChatType(kind),
    content: summary.detail ? `${summary.title}\n${summary.detail}` : summary.title,
    role: event.role ? String(event.role) : undefined,
    timestamp: eventDate(event.timestamp),
    source: "api"
  };
}

function eventToTimelineRow(event: MissionTimelineEvent, index: number, source: "api" | "stream"): TimelineRow {
  const type = String(event.type || "event");
  const eventTarget = String(event.task_id || event.mission_id || "mission");
  const eventStamp = String(event.timestamp ?? index);
  const summary = describeRuntimeEvent(event);
  return {
    id: `timeline-${source}-${type}-${eventTarget}-${eventStamp}`,
    ts: formatEventTime(event.timestamp),
    event: summary.title,
    detail: summary.detail,
    role: event.role ? String(event.role) : undefined,
    source,
    kind: eventKind(type),
    tone: eventTone(type),
    taskId: event.task_id ? String(event.task_id) : undefined
  };
}

function dedupeTimelineRows(rows: TimelineRow[]): TimelineRow[] {
  const seen = new Set<string>();
  const unique: TimelineRow[] = [];
  rows.forEach((row) => {
    const key = `${row.kind}-${row.taskId || row.role || "mission"}-${row.event}-${row.ts}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(row);
  });
  return unique;
}

function appendUniqueChatRows(prev: ChatRow[], rows: ChatRow[], limit = 120): ChatRow[] {
  const seen = new Set(prev.map((row) => row.id));
  const merged = [...prev];
  rows.forEach((row) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    merged.push(row);
  });
  return merged.slice(-limit);
}

function mergeApiChatRows(prev: ChatRow[], rows: ChatRow[]): ChatRow[] {
  const uniqueApiRows = appendUniqueChatRows([], rows, rows.length);
  const apiIds = new Set(uniqueApiRows.map((row) => row.id));
  const liveRows = prev.filter((row) => row.source !== "api" && !apiIds.has(row.id));
  return [...uniqueApiRows, ...liveRows].slice(-120);
}

function compactArtifactValue(value: unknown): string {
  if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  if (value && typeof value === "object") return Object.keys(value).slice(0, 5).join(", ") || "object";
  return String(value ?? "empty");
}

function summarizeArtifactValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.slice(0, 3).map((item, index) => `${index + 1}. ${compactArtifactValue(item)}`);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 4)
      .map(([key, row]) => `${key}: ${compactArtifactValue(row)}`);
  }
  return [compactArtifactValue(value)];
}

function timelineKindLabel(kind: TimelineKind): string {
  const labels: Record<TimelineKind, string> = {
    mission: "Mission",
    task: "Task",
    condition: "Condition",
    route: "Route",
    loop: "Loop",
    approval: "Approval",
    quality: "Quality",
    cost: "Cost",
    system: "System"
  };
  return labels[kind];
}

function timelineToneClass(tone: TimelineRow["tone"]): string {
  const classes: Record<TimelineRow["tone"], string> = {
    default: "border-white/10 bg-black/25 text-gray-300",
    success: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-100",
    warning: "border-yellow-500/25 bg-yellow-500/[0.08] text-yellow-100",
    danger: "border-rose-500/25 bg-rose-500/[0.08] text-rose-100",
    info: "border-cyan-500/25 bg-cyan-500/[0.08] text-cyan-100"
  };
  return classes[tone];
}

function timelineIcon(kind: TimelineKind) {
  if (kind === "route") return <GitBranch className="h-3.5 w-3.5" />;
  if (kind === "loop") return <Repeat2 className="h-3.5 w-3.5" />;
  if (kind === "approval") return <ShieldCheck className="h-3.5 w-3.5" />;
  if (kind === "condition") return <SkipForward className="h-3.5 w-3.5" />;
  if (kind === "quality") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (kind === "cost") return <Coins className="h-3.5 w-3.5" />;
  if (kind === "mission") return <Activity className="h-3.5 w-3.5" />;
  return <Bell className="h-3.5 w-3.5" />;
}

export default function ChatRoomView({ params }: { params: { id: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDemoMission = params.id.startsWith("demo-");
  const mockRunRecord = useMemo(() => MOCK_MISSION_RUNS.find((run) => run.id === params.id) || null, [params.id]);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [status, setStatus] = useState<RoomStatus>("running");
  const [runtimeDataMode, setRuntimeDataMode] = useState<RuntimeDataMode>(
    isDemoMission ? "demo" : "loading"
  );
  const [runtimeLoadError, setRuntimeLoadError] = useState<string | null>(null);
  const [missionDetail, setMissionDetail] = useState<MissionDetail | null>(null);
  const [missionTimelineEvents, setMissionTimelineEvents] = useState<MissionTimelineEvent[]>([]);
  const [missionArtifacts, setMissionArtifacts] = useState<MissionArtifactsResponse | null>(null);
  const [missionEvaluations, setMissionEvaluations] = useState<MissionTimelineEvent[]>([]);
  const [currentApproval, setCurrentApproval] = useState<PendingApproval | null>(null);
  const [approvalSyncError, setApprovalSyncError] = useState("");
  const [approvalLastSyncedAt, setApprovalLastSyncedAt] = useState<Date | null>(null);
  const [runtimeRefreshNonce, setRuntimeRefreshNonce] = useState(0);
  const [isApproving, setIsApproving] = useState(false);
  const [isRetryingApprovalNotifications, setIsRetryingApprovalNotifications] = useState(false);
  const [selectedMetricNode, setSelectedMetricNode] = useState<string | null>(searchParams.get("node"));
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(searchParams.get("artifact"));
  const [sideTab, setSideTab] = useState<SideTab>(() => normalizeSideTab(searchParams.get("tab")));
  const {
    missionRunState,
    clearMissionRunTransitionWarning,
    setMissionRunState,
    resetMissionRunState,
    artifactVersions,
    nodes,
    setNodeExecutionState
  } = useAppStore();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const liveRuntimeReadyRef = useRef(false);
  const missionStatusRef = useRef<MissionRunState>(mockRunRecord?.state || "queued");

  const transitionRuntimeState = (nextState: MissionRunState, source: string) => {
    const store = useAppStore.getState();
    let currentState = store.missionRunState;
    if (currentState === nextState) return;
    if (currentState === "queued" && nextState !== "planning" && nextState !== "cancelled") {
      store.setMissionRunState("planning", `${source}.planning`);
      currentState = "planning";
    }
    if (
      currentState === "planning" &&
      !["running", "failed", "cancelled", "escalated"].includes(nextState)
    ) {
      store.setMissionRunState("running", `${source}.running`);
    }
    store.setMissionRunState(nextState, source);
    missionStatusRef.current = useAppStore.getState().missionRunState;
  };

  useEffect(() => {
    clearMissionRunTransitionWarning();
  }, [clearMissionRunTransitionWarning]);

  const resolveNodeIdForEvent = (taskId?: string, roleText?: string, eventText?: string): string | null => {
    const normalizedTaskId = String(taskId || "").trim().toLowerCase();
    if (normalizedTaskId) {
      const exactTask = nodes.find((node) => {
        const data = node.data as Record<string, unknown>;
        return [node.id, data.task_id, data.runtime_task_id]
          .map((value) => String(value || "").trim().toLowerCase())
          .includes(normalizedTaskId);
      });
      if (exactTask) return exactTask.id;
    }

    const role = String(roleText || "").toLowerCase();
    const event = String(eventText || "").toLowerCase();
    const combined = `${role} ${event}`;
    if (!combined.trim()) return null;
    const matched = nodes.find((node) => {
      const label = String((node.data as any)?.label || "").toLowerCase();
      const agentId = String((node.data as any)?.agent_id || "").toLowerCase();
      const category = String((node.data as any)?.category || "").toLowerCase();
      return [label, agentId, category].some((token) => token && combined.includes(token));
    });
    return matched?.id || null;
  };

  useEffect(() => {
    let alive = true;

    if (isDemoMission) {
      liveRuntimeReadyRef.current = false;
      setRuntimeDataMode("demo");
      setRuntimeLoadError(null);
      setMissionDetail(null);
      setMissionTimelineEvents([]);
      setMissionArtifacts(null);
      setMissionEvaluations([]);
      setCurrentApproval(null);
      setApprovalSyncError("");
      setApprovalLastSyncedAt(null);
      return;
    }

    const loadRuntimeSnapshot = async () => {
      setRuntimeDataMode((prev) => (prev === "live" ? "live" : "loading"));
      setRuntimeLoadError(null);
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const [detail, timeline, artifacts, evaluations] = await Promise.all([
            fetchMissionDetail(params.id),
            fetchMissionTimeline(params.id),
            fetchMissionArtifacts(params.id),
            fetchMissionEvaluations(params.id)
          ]);
          if (!alive) return;
          liveRuntimeReadyRef.current = true;
          setMissionDetail(detail);
          setMissionTimelineEvents(timeline.events);
          setMissionArtifacts(artifacts);
          setMissionEvaluations(evaluations.evaluations);
          setStatus(roomStatusFromMissionState(detail.status));
          missionStatusRef.current = detail.status;
          resetMissionRunState(detail.status, "runtime.api.snapshot");
          setRuntimeDataMode("live");
          if (timeline.events.length > 0) {
            const apiRows = timeline.events.map(eventToChatRow);
            setMessages((prev) => mergeApiChatRows(prev, apiRows));
          }
          fetchPendingApprovals()
            .then((approvals) => {
              if (!alive) return;
              setCurrentApproval(approvals.approvals.find((approval) => approval.mission_id === params.id) || null);
              setApprovalSyncError("");
              setApprovalLastSyncedAt(new Date());
            })
            .catch((approvalError) => {
              if (!alive) return;
              setCurrentApproval(null);
              setApprovalSyncError(
                approvalError instanceof Error ? approvalError.message : "failed_to_sync_pending_approval"
              );
            });
          return;
        } catch (error) {
          lastError = error;
          if (attempt === 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 450));
          }
        }
      }
      if (!alive) return;
      liveRuntimeReadyRef.current = false;
      setRuntimeDataMode("fallback");
      setRuntimeLoadError(lastError instanceof Error ? lastError.message : "failed_to_load_runtime_snapshot");
      if (mockRunRecord) {
        setStatus(roomStatusFromMissionState(mockRunRecord.state));
        resetMissionRunState(mockRunRecord.state, "runtime.mock.snapshot");
        setMessages((prev) =>
          appendUniqueChatRows(prev, [
            {
              id: `mock-snapshot-${mockRunRecord.id}`,
              type: mockRunRecord.state === "awaiting_approval" ? "human_gate" : "system",
              content: `${mockRunRecord.workflow_label}\n${missionStateLabels[mockRunRecord.state] || mockRunRecord.state} · ${mockRunRecord.goal}`,
              timestamp: eventDate(mockRunRecord.started_at),
              source: "simulation"
            }
          ])
        );
      }
    };

    void loadRuntimeSnapshot();
    return () => {
      alive = false;
    };
  }, [isDemoMission, mockRunRecord, params.id, resetMissionRunState, runtimeRefreshNonce]);

  useEffect(() => {
    if (isDemoMission) return;
    const shouldPollApproval =
      Boolean(currentApproval) ||
      missionDetail?.status === "awaiting_approval" ||
      missionRunState === "awaiting_approval";
    if (!shouldPollApproval) return;
    let cancelled = false;
    const syncApproval = async () => {
      try {
        const approvals = await fetchPendingApprovals();
        if (cancelled) return;
        const nextApproval = approvals.approvals.find((approval) => approval.mission_id === params.id) || null;
        setCurrentApproval(nextApproval);
        setApprovalSyncError("");
        setApprovalLastSyncedAt(new Date());
        if (!nextApproval && currentApproval) {
          setStatus("running");
          transitionRuntimeState("running", "runtime.approval.poll_resolved");
          setRuntimeRefreshNonce((prev) => prev + 1);
        }
      } catch (approvalError) {
        if (cancelled) return;
        setApprovalSyncError(approvalError instanceof Error ? approvalError.message : "failed_to_sync_pending_approval");
      }
    };
    void syncApproval();
    const timer = window.setInterval(() => {
      void syncApproval();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentApproval, isDemoMission, missionDetail?.status, missionRunState, params.id, status]);

  useEffect(() => {
    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        timers.push(timer);
      });

    const runFallbackSimulation = async () => {
      if (cancelled) return;
      if (isDemoMission && mockRunRecord?.state === "awaiting_approval") {
        setRuntimeDataMode("demo");
        setStatus("blocked");
        resetMissionRunState("awaiting_approval", "runtime.demo.approval_snapshot");
        setMessages((prev) =>
          appendUniqueChatRows(prev, [
            {
              id: `mock-approval-${mockRunRecord.id}`,
              type: "human_gate",
              content: `${mockRunRecord.workflow_label}\n승인 대기 · ${mockRunRecord.goal}`,
              timestamp: eventDate(mockRunRecord.started_at),
              source: "simulation"
            }
          ])
        );
        return;
      }
      if (!isDemoMission && mockRunRecord) {
        setRuntimeDataMode("fallback");
        setStatus(roomStatusFromMissionState(mockRunRecord.state));
        resetMissionRunState(mockRunRecord.state, "runtime.mock.fallback");
        setMessages((prev) =>
          appendUniqueChatRows(prev, [
            {
              id: `mock-fallback-${mockRunRecord.id}`,
              type: mockRunRecord.state === "awaiting_approval" ? "human_gate" : "system",
              content: `${mockRunRecord.workflow_label}\n${missionStateLabels[mockRunRecord.state] || mockRunRecord.state} · ${mockRunRecord.goal}`,
              timestamp: eventDate(mockRunRecord.started_at),
              source: "simulation"
            }
          ])
        );
        return;
      }
      if (!isDemoMission) setRuntimeDataMode("fallback");
      transitionRuntimeState("running", "runtime.fallback.start");
      const events: Array<{ delay: number; row: ChatRow }> = [
        {
          delay: 800,
          row: {
            id: `sim-${params.id}-1`,
            type: "agent",
            role: "developer",
            content: "풀스택 코드 작성봇이 작업을 시작합니다...",
            timestamp: new Date(),
            source: "simulation"
          }
        },
        {
          delay: 1200,
          row: {
            id: `sim-${params.id}-2`,
            type: "agent",
            role: "developer",
            content: "FastAPI 백엔드 + Next.js 프론트엔드 초안 완성!",
            timestamp: new Date(),
            source: "simulation"
          }
        },
        {
          delay: 1200,
          row: {
            id: `sim-${params.id}-3`,
            type: "human_gate",
            content: "코드 리뷰 단계 진행 전 최종 승인 필요",
            timestamp: new Date(),
            source: "simulation"
          }
        }
      ];
      for (const event of events) {
        await delay(event.delay);
        if (cancelled) return;
        setMessages((prev) => appendUniqueChatRows(prev, [event.row]));
        const mappedNodeId = resolveNodeIdForEvent(undefined, event.row.role, event.row.content);
        if (mappedNodeId && event.row.type === "agent") {
          setNodeExecutionState(mappedNodeId, "running");
        }
        if (event.row.type === "human_gate") {
          setStatus("blocked");
          transitionRuntimeState("awaiting_approval", "runtime.fallback.human_gate");
          nodes
            .filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "hitl")
            .forEach((n) => setNodeExecutionState(n.id, "waiting_input"));
        }
      }
    };

    if (isDemoMission) {
      const initialDemoState = mockRunRecord?.state || "planning";
      resetMissionRunState(initialDemoState, "runtime.demo.init");
      setStatus(roomStatusFromMissionState(initialDemoState));
      setMessages((prev) =>
        appendUniqueChatRows(prev, [
          {
            id: `sys-demo-${params.id}`,
            type: "system",
            content: "DEMO 모드: 서버 연결 없이 로컬 예시 실행 로그를 보여줍니다.",
            timestamp: new Date(),
            source: "simulation"
          }
        ])
      );
      void runFallbackSimulation();
      return () => {
        cancelled = true;
        timers.forEach((timer) => clearTimeout(timer));
      };
    }

    let hasLiveEvent = false;
    let fallbackStarted = false;
    const startFallbackOnce = async () => {
      if (cancelled || fallbackStarted || hasLiveEvent || liveRuntimeReadyRef.current) return;
      fallbackStarted = true;
      transitionRuntimeState("escalated", "runtime.ws.disconnected");
      await runFallbackSimulation();
    };
    const ws = new WebSocket(wsUrl(`/ws/${params.id}`, wsAuthQuery()));
    ws.onmessage = (e) => {
      if (cancelled) return;
      hasLiveEvent = true;
      setRuntimeDataMode("live");
      let data: any;
      try {
        data = JSON.parse(e.data || "{}");
      } catch {
        return;
      }
      const kind = String(data.type || "event");
      const message = String(data.message || JSON.stringify(data));
      const nextType = eventChatType(kind);
      if (kind === "human_gate_requested") {
        setStatus("blocked");
        transitionRuntimeState("awaiting_approval", "runtime.ws.human_gate_requested");
      } else if (kind === "human_gate_approved") {
        setStatus("running");
        transitionRuntimeState("running", "runtime.ws.human_gate_approved");
      } else if (kind === "mission_completed") {
        setStatus("completed");
        transitionRuntimeState("completed", "runtime.ws.mission_completed");
      } else if (kind === "mission_failed") {
        setStatus("blocked");
        transitionRuntimeState("failed", "runtime.ws.mission_failed");
      } else if (kind === "mission_cancelled") {
        setStatus("blocked");
        transitionRuntimeState("cancelled", "runtime.ws.mission_cancelled");
      }
      if (
        kind === "mission_snapshot" ||
        kind === "mission_completed" ||
        kind === "mission_failed" ||
        kind === "mission_cancelled" ||
        kind === "task_completed" ||
        kind === "task_failed" ||
        kind === "execution_result" ||
        kind === "evaluation_result"
      ) {
        setRuntimeRefreshNonce((prev) => prev + 1);
      }
      if (
        kind === "human_gate_requested" ||
        kind === "human_gate_approved" ||
        kind.startsWith("approval_notification")
      ) {
        setRuntimeRefreshNonce((prev) => prev + 1);
      }
      if (kind.includes("retry")) transitionRuntimeState("retrying", "runtime.ws.retry");
      const mappedNodeId = resolveNodeIdForEvent(
        data.task_id ? String(data.task_id) : undefined,
        data.role ? String(data.role) : undefined,
        message
      );
      if (mappedNodeId) {
        if (kind === "task_started") setNodeExecutionState(mappedNodeId, "running");
        if (kind === "task_completed") setNodeExecutionState(mappedNodeId, "completed");
        if (kind === "task_failed") setNodeExecutionState(mappedNodeId, "failed");
        if (kind.includes("stream")) setNodeExecutionState(mappedNodeId, "streaming");
      }
      if (kind === "human_gate_requested") {
        nodes
          .filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "hitl")
          .forEach((n) => setNodeExecutionState(n.id, "waiting_input"));
      } else if (kind === "human_gate_approved") {
        nodes
          .filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "hitl")
          .forEach((n) => setNodeExecutionState(n.id, "completed"));
      }
      const eventTarget = String(data.task_id || data.mission_id || params.id);
      const eventStamp = String(data.timestamp || message);
      setMessages((prev) =>
        appendUniqueChatRows(prev, [
          {
            id: `event-${kind}-${eventTarget}-${eventStamp}`,
            type: nextType,
            content: message,
            role: data.role ? String(data.role) : undefined,
            timestamp: eventDate(data.timestamp),
            source: "stream"
          }
        ])
      );
    };
    ws.onopen = () => {
      if (cancelled) return;
      if (!["completed", "failed", "cancelled"].includes(missionStatusRef.current)) {
        transitionRuntimeState("running", "runtime.ws.open");
      }
      setMessages((prev) =>
        appendUniqueChatRows(prev, [
          {
            id: `sys-open-${params.id}`,
            type: "system",
            content: "🚀 실행 워크플로우 런타임을 시작합니다!",
            timestamp: new Date(),
            source: "stream"
          }
        ])
      );
    };
    ws.onerror = async () => {
      // onclose에서 API snapshot 재시도 시간을 준 뒤 fallback 여부를 결정합니다.
    };
    ws.onclose = async (event) => {
      if (cancelled) return;
      if (event.code === 1008) {
        setRuntimeDataMode(mockRunRecord ? "fallback" : "error");
        setRuntimeLoadError(event.reason || "ws_access_denied");
        setStatus("blocked");
        transitionRuntimeState("escalated", "runtime.ws.policy_closed");
        return;
      }
      await delay(700);
      await startFallbackOnce();
    };
    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
      ws.close();
    };
  }, [isDemoMission, mockRunRecord, nodes, params.id, resetMissionRunState, setMissionRunState, setNodeExecutionState]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const q = new URLSearchParams(searchParams.toString());
    if (selectedMetricNode) q.set("node", selectedMetricNode);
    else q.delete("node");
    if (selectedArtifact) q.set("artifact", selectedArtifact);
    else q.delete("artifact");
    if (sideTab) q.set("tab", sideTab);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }, [pathname, router, searchParams, selectedArtifact, selectedMetricNode, sideTab]);

  const handleApprove = async () => {
    setIsApproving(true);
    transitionRuntimeState("retrying", "runtime.human.approve");
    try {
      if (!isDemoMission) {
        await approveMissionGate(params.id);
        setCurrentApproval(null);
        setApprovalLastSyncedAt(new Date());
        setMissionDetail((prev) => (prev ? { ...prev, status: "running" } : prev));
        setRuntimeRefreshNonce((prev) => prev + 1);
      }
      setMessages((prev) =>
        appendUniqueChatRows(prev, [
          {
            id: `approve-${params.id}-${Date.now()}`,
            type: "system",
            content: "✅ 승인 완료. 다음 단계를 진행합니다.",
            timestamp: new Date(),
            source: "stream"
          }
        ])
      );
      setStatus("running");
      transitionRuntimeState("running", "runtime.human.resume");
      setRuntimeLoadError(null);
    } catch (error) {
      setRuntimeLoadError(error instanceof Error ? error.message : "failed_to_approve_mission");
      transitionRuntimeState("escalated", "runtime.human.approve_failed");
    } finally {
      setIsApproving(false);
    }
  };

  const handleRetryApprovalNotifications = async () => {
    if (isDemoMission || isRetryingApprovalNotifications) return;
    setIsRetryingApprovalNotifications(true);
    setApprovalSyncError("");
    try {
      const response = await retryApprovalNotifications(params.id);
      const approvals = await fetchPendingApprovals();
      setCurrentApproval(approvals.approvals.find((approval) => approval.mission_id === params.id) || null);
      setApprovalLastSyncedAt(new Date());
      setRuntimeRefreshNonce((prev) => prev + 1);
      setMessages((prev) =>
        appendUniqueChatRows(prev, [
          {
            id: `approval-retry-${params.id}-${Date.now()}`,
            type: "system",
            content: `📨 승인 알림 ${response.retried_count}건 재전송을 시도했습니다.`,
            timestamp: new Date(),
            source: "stream"
          }
        ])
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed_to_retry_approval_notifications";
      setApprovalSyncError(
        message.includes("409")
          ? "재전송할 외부 승인 알림이 없습니다. 승인 큐를 다시 확인하세요."
          : message
      );
    } finally {
      setIsRetryingApprovalNotifications(false);
    }
  };

  const apiTimelineRows = useMemo<TimelineRow[]>(
    () => missionTimelineEvents.map((event, index) => eventToTimelineRow(event, index, "api")),
    [missionTimelineEvents]
  );
  const streamTimelineRows = useMemo<TimelineRow[]>(
    () =>
      messages
        .filter((m) => m.source !== "api")
        .map((m, index) => ({
          id: `timeline-stream-${m.id}-${index}`,
          ts: m.timestamp.toLocaleTimeString(),
          event: m.type === "agent" ? `${m.role || "worker"} event` : m.content.split("\n")[0],
          detail: m.content.split("\n").slice(1).join("\n") || undefined,
          role: m.role,
          source: "stream" as const,
          kind: m.type === "human_gate" ? "approval" : m.type === "agent" ? "task" : "system",
          tone: m.type === "human_gate" ? "warning" : "default",
          taskId: undefined
        })),
    [messages]
  );
  const timeline = dedupeTimelineRows(apiTimelineRows.length > 0 ? [...apiTimelineRows, ...streamTimelineRows] : streamTimelineRows);

  const fallbackArtifactTrace: ArtifactTraceRow[] = [
    {
      artifact: "requirements.md",
      from: "planner",
      to: "backend_executor",
      status: "generated",
      version: "v3",
      owner: "planner",
      changes: ["scope refined", "acceptance criteria updated"]
    },
    {
      artifact: "api_spec.json",
      from: "backend_executor",
      to: "qa_reviewer",
      status: "reviewing",
      version: "v5",
      owner: "backend_executor",
      changes: ["new auth endpoint", "rate-limit schema added"]
    },
    {
      artifact: "build_report.txt",
      from: "qa_reviewer",
      to: "deploy_review",
      status: status === "blocked" ? "blocked" : "ready",
      version: "v2",
      owner: "qa_reviewer",
      changes: ["2 flaky tests isolated", "coverage +3.2%"]
    }
  ];
  const taskById = useMemo(
    () => new Map((missionDetail?.tasks || []).map((task) => [task.id, task])),
    [missionDetail]
  );
  const liveArtifactTrace = useMemo<ArtifactTraceRow[]>(() => {
    if (!missionArtifacts) return [];
    return Object.entries(missionArtifacts.artifacts).flatMap(([taskId, outputs]) => {
      const task = taskById.get(taskId);
      return Object.entries(outputs).map(([artifact, value]) => ({
        artifact,
        from: task?.dependencies.length ? task.dependencies.join(", ") : "mission",
        to: task?.role || taskId,
        status: task?.status || "completed",
        version: `v${Math.max(1, (task?.retry_count || 0) + 1)}`,
        owner: task?.role || taskId,
        changes: summarizeArtifactValue(value),
        taskId
      }));
    });
  }, [missionArtifacts, taskById]);
  const mockSnapshotState =
    !isDemoMission || mockRunRecord?.state === "awaiting_approval" ? mockRunRecord?.state || null : null;
  const showSampleData =
    isDemoMission ||
    runtimeDataMode === "demo" ||
    (!missionDetail && runtimeDataMode === "fallback" && Boolean(mockRunRecord));
  const artifactTrace = liveArtifactTrace.length > 0 ? liveArtifactTrace : showSampleData ? fallbackArtifactTrace : [];
  const selectedArtifactDetail =
    artifactTrace.find((a) => a.artifact === selectedArtifact) ||
    artifactTrace[0] || {
      artifact: "아직 생성된 산출물 없음",
      from: "runtime",
      to: "workspace",
      status: "pending",
      version: "-",
      owner: "runtime",
      changes: ["라이브 실행이 산출물을 만들면 이곳에 버전 이력이 표시됩니다."]
    };
  const selectedArtifactHistory = useMemo(() => {
    const stored = artifactVersions.filter((row) => row.artifact_id === selectedArtifactDetail.artifact);
    if (stored.length > 0 || !selectedArtifactDetail.taskId) return stored;
    return [
      {
        artifact_id: selectedArtifactDetail.artifact,
        version: selectedArtifactDetail.version,
        changed_by: selectedArtifactDetail.owner,
        summary: selectedArtifactDetail.changes.join(", "),
        timestamp: selectedArtifactDetail.status
      }
    ];
  }, [artifactVersions, selectedArtifactDetail]);
  const sortedArtifactHistory = useMemo(() => {
    const parseVersion = (v: string) => Number(String(v).replace(/[^0-9]/g, "")) || 0;
    return [...selectedArtifactHistory].sort((a, b) => parseVersion(a.version) - parseVersion(b.version));
  }, [selectedArtifactHistory]);
  const artifactDiff = useMemo(() => {
    const latest = sortedArtifactHistory[sortedArtifactHistory.length - 1];
    const prev = sortedArtifactHistory[sortedArtifactHistory.length - 2];
    if (!latest || !prev) return { from: prev?.version || "-", to: latest?.version || "-", added: [] as string[], removed: [] as string[] };
    const tokenize = (summary: string) =>
      summary
        .split(/,|및|\/|->|→/g)
        .map((t) => t.trim())
        .filter(Boolean);
    const prevTokens = tokenize(prev.summary);
    const latestTokens = tokenize(latest.summary);
    return {
      from: prev.version,
      to: latest.version,
      added: latestTokens.filter((token) => !prevTokens.includes(token)),
      removed: prevTokens.filter((token) => !latestTokens.includes(token))
    };
  }, [sortedArtifactHistory]);

  const fallbackCostBreakdown: CostRow[] = [
    { provider: "Claude Opus", share: 62, cost: 18.42 },
    { provider: "GPT-4o", share: 21, cost: 6.23 },
    { provider: "Human Approval", share: 8, cost: 2.38 },
    { provider: "Others", share: 9, cost: 2.67 }
  ];
  const mockCostBreakdown: CostRow[] = mockRunRecord
    ? [{ provider: "Mock run estimate", share: 100, cost: mockRunRecord.est_cost_usd }]
    : [];
  const liveCostTotal = missionDetail
    ? Math.max(missionDetail.total_cost, missionDetail.tasks.reduce((acc, task) => acc + task.cost, 0))
    : 0;
  const liveCostBreakdown: CostRow[] = missionDetail
    ? missionDetail.tasks
        .filter((task) => task.cost > 0)
        .map((task) => ({
          provider: task.role,
          share: liveCostTotal > 0 ? (task.cost / liveCostTotal) * 100 : 0,
          cost: task.cost
        }))
    : [];
  const costBreakdown =
    liveCostBreakdown.length > 0
      ? liveCostBreakdown
      : missionDetail
        ? [{ provider: "No spend yet", share: 100, cost: 0 }]
        : mockCostBreakdown.length > 0
          ? mockCostBreakdown
        : showSampleData
          ? fallbackCostBreakdown
          : [{ provider: "아직 집계된 비용 없음", share: 100, cost: 0 }];
  const totalCost = missionDetail
    ? liveCostTotal
    : mockRunRecord
      ? mockRunRecord.est_cost_usd
    : showSampleData
      ? fallbackCostBreakdown.reduce((acc, row) => acc + row.cost, 0)
      : 0;
  const fallbackNodeMetrics: NodeMetricRow[] = [
    { node: "Planner", cost: 0.0184, confidence: 0.92, retries: 0, state: "completed" },
    { node: "Backend Executor", cost: 0.0642, confidence: 0.88, retries: 1, state: "running" },
    { node: "QA Reviewer", cost: 0.0311, confidence: 0.91, retries: 0, state: "pending" },
    { node: "HITL Approver", cost: 0, confidence: 1, retries: 0, state: "waiting_input" }
  ];
  const nodeMetrics: NodeMetricRow[] = missionDetail?.tasks.length
    ? missionDetail.tasks.map((task) => ({
        node: `${task.role} · ${task.id}`,
        cost: task.cost,
        confidence: task.confidence,
        retries: task.retry_count,
        state: task.status
      }))
    : showSampleData
      ? fallbackNodeMetrics
      : [];
  const nodeRoleHints = nodeMetrics.reduce<Record<string, string[]>>((acc, metric) => {
    acc[metric.node] = metric.node
      .toLowerCase()
      .split(/[^a-z0-9_]+/g)
      .filter(Boolean);
    return acc;
  }, {});
  const filteredTimeline =
    timeline.filter((t) => {
      const nodeOk =
        !selectedMetricNode ||
        !nodeRoleHints[selectedMetricNode] ||
        nodeRoleHints[selectedMetricNode].some((hint) =>
          `${t.event} ${t.detail || ""} ${t.role || ""} ${t.taskId || ""}`.toLowerCase().includes(hint.toLowerCase())
        );
      const artifactOk =
        !selectedArtifact ||
        `${t.event} ${t.detail || ""}`.toLowerCase().includes(selectedArtifact.toLowerCase().split(".")[0]);
      return nodeOk && artifactOk;
    });
  const operationEventCounts = timeline.reduce(
    (acc, row) => {
      if (row.kind === "route") acc.routes += 1;
      if (row.kind === "loop") acc.loops += 1;
      if (row.kind === "approval") acc.approvals += 1;
      if (row.kind === "condition") acc.conditions += 1;
      if (row.tone === "danger") acc.risks += 1;
      return acc;
    },
    { routes: 0, loops: 0, approvals: 0, conditions: 0, risks: 0 }
  );
  const approvalTimeline = timeline.filter((row) => row.kind === "approval");
  const approvalRetryableNotifications = retryableApprovalNotifications(currentApproval);

  const avgConfidence =
    nodeMetrics.length > 0
      ? nodeMetrics.reduce((acc, row) => acc + row.confidence, 0) / nodeMetrics.length
      : 0;
  const totalRetries = nodeMetrics.reduce((acc, row) => acc + row.retries, 0);
  const completedTasks = missionDetail?.tasks.filter((task) => task.status === "completed").length || 0;
  const mockSuccessRate =
    mockSnapshotState === "completed"
      ? 100
      : mockSnapshotState === "failed" || mockSnapshotState === "cancelled"
        ? 0
        : mockSnapshotState === "blocked" || mockSnapshotState === "awaiting_approval" || mockSnapshotState === "escalated"
          ? 50
          : null;
  const successRate = missionDetail?.tasks.length
    ? (completedTasks / missionDetail.tasks.length) * 100
    : mockSuccessRate !== null
      ? mockSuccessRate
    : nodeMetrics.length > 0
      ? Math.max(0, Math.min(100, ((nodeMetrics.length - totalRetries) / nodeMetrics.length) * 100))
      : 0;
  const startedAtMs = missionDetail ? Date.parse(missionDetail.created_at) : Number.NaN;
  const terminalEventMs = missionTimelineEvents.reduce((latest, event) => {
    if (!["mission_completed", "mission_failed", "mission_cancelled"].includes(event.type)) return latest;
    const timestamp = eventDate(event.timestamp).getTime();
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
  const finishedAtMs = missionDetail?.finished_at ? Date.parse(missionDetail.finished_at) : Number.NaN;
  const elapsedSec =
    missionDetail && Number.isFinite(startedAtMs)
      ? Math.max(
          1,
          Math.round(
            ((Number.isFinite(finishedAtMs) ? finishedAtMs : terminalEventMs || Date.now()) - startedAtMs) / 1000
          )
        )
      : mockRunRecord
        ? mockRunRecord.latency_sec
      : Math.max(1, messages.length * 12);
  const runtimeHealth = status === "blocked" ? "attention" : status === "completed" ? "stable" : "running";
  const displayMissionState = missionDetail?.status || mockSnapshotState || missionRunState;
  const displayOwner = missionDetail?.owner_id || "local-owner";
  const displayMissionStateLabel = missionStateLabels[displayMissionState] || displayMissionState;
  const displayRuntimeDataMode: RuntimeDataMode = missionDetail
    ? missionDetail.use_mock
      ? "demo"
      : "live"
    : isDemoMission
      ? "demo"
      : mockRunRecord
        ? "fallback"
        : runtimeDataMode;
  const displayRuntimeModeLabel = missionDetail
    ? missionDetail.use_mock
      ? "Mock 실행"
      : "Live 실행"
    : runtimeModeLabels[displayRuntimeDataMode];
  const runtimeHealthLabel =
    runtimeHealth === "attention" ? "확인 필요" : runtimeHealth === "stable" ? "안정" : "이벤트 수집 중";
  const localHumanGateOpen =
    !missionDetail && status === "blocked" && messages.some((message) => message.type === "human_gate");
  const approvalGateOpen =
    Boolean(currentApproval) || displayMissionState === "awaiting_approval" || localHumanGateOpen;
  const nextOperationLabel =
    approvalGateOpen
      ? "승인 또는 관리자 확인을 기다리는 중"
      : displayMissionState === "completed"
        ? "실행 결과 검토 가능"
        : ["blocked", "failed", "cancelled", "escalated"].includes(displayMissionState)
          ? "타임라인에서 중단 원인을 확인하세요"
        : displayRuntimeDataMode === "fallback"
          ? "라이브 기록 연결 전, 로컬 미리보기 표시"
          : displayRuntimeDataMode === "error"
            ? "인증 또는 접근 권한을 확인하세요"
          : "다음 실행 이벤트 수집 중";
  const approvalChannelSummary = currentApproval
    ? currentApproval.approval_channels.map(approvalChannelLabel).join(", ") || "관리자 대기열"
    : approvalTimeline.length > 0
      ? "타임라인 기록"
      : "없음";
  const approvalNextAction = currentApproval
    ? currentApproval.can_approve
      ? "승인 가능"
      : "재실행 확인"
    : approvalGateOpen
      ? "큐 동기화 중"
      : "대기 없음";
  const primaryRuntimeAction: {
    tab: SideTab;
    label: string;
    caption: string;
    className: string;
  } = approvalGateOpen
    ? {
        tab: "approvals",
        label: currentApproval?.can_approve ? "승인 처리" : "승인 상태 확인",
        caption: currentApproval
          ? `${approvalChannelSummary} · ${currentApproval.approval_target || "운영 관리자"}`
          : isDemoMission
            ? "데모 승인 대기 · 운영 관리자"
          : "승인 큐 동기화가 필요합니다.",
        className: "border-amber-300/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15"
      }
    : displayMissionState === "completed"
      ? {
          tab: "artifacts",
          label: "산출물 검토",
          caption: `${artifactTrace.length}개 산출물 · 비용 $${totalCost.toFixed(2)}`,
          className: "border-emerald-300/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
        }
      : ["blocked", "failed", "cancelled", "escalated"].includes(displayMissionState)
        ? {
            tab: "timeline",
            label: "원인 확인",
            caption: `${displayMissionStateLabel} · 타임라인과 지표를 확인합니다.`,
            className: "border-rose-300/25 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15"
          }
      : displayRuntimeDataMode === "fallback"
        ? {
            tab: "timeline",
            label: "미리보기 추적",
            caption: "라이브 기록 전 로컬 이벤트를 확인합니다.",
            className: "border-cyan-300/25 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/15"
          }
        : {
            tab: "timeline",
            label: "실행 추적",
            caption: `${runtimeHealthLabel} · ${messages.length}개 이벤트`,
            className: "border-blue-300/25 bg-blue-500/10 text-blue-100 hover:bg-blue-500/15"
          };
  const kpiByTab: Record<SideTab, Array<{ label: string; value: string }>> = {
    timeline: [
      { label: "시간", value: `${elapsedSec}s` },
      { label: "성공률", value: `${successRate.toFixed(0)}%` },
      { label: "비용", value: `$${totalCost.toFixed(2)}` },
      { label: "재시도", value: `${totalRetries}` }
    ],
    approvals: [
      { label: "대기", value: currentApproval ? "1건" : "0건" },
      { label: "채널", value: currentApproval ? `${currentApproval.approval_channels.length}` : "0" },
      { label: "알림", value: `${currentApproval?.notifications.length || approvalTimeline.length}` },
      { label: "재전송", value: approvalRetryableNotifications.length > 0 ? `${approvalRetryableNotifications.length}건` : approvalNextAction }
    ],
    artifacts: [
      { label: "시간", value: `${elapsedSec}s` },
      { label: "성공률", value: `${successRate.toFixed(0)}%` },
      { label: "비용", value: `$${totalCost.toFixed(2)}` },
      { label: "재시도", value: `${totalRetries}` }
    ],
    cost: [
      { label: "시간", value: `${elapsedSec}s` },
      { label: "성공률", value: `${successRate.toFixed(0)}%` },
      { label: "비용", value: `$${totalCost.toFixed(2)}` },
      { label: "재시도", value: `${totalRetries}` }
    ],
    metrics: [
      { label: "시간", value: `${elapsedSec}s` },
      { label: "성공률", value: `${successRate.toFixed(0)}%` },
      { label: "비용", value: `$${totalCost.toFixed(2)}` },
      { label: "재시도", value: `${totalRetries}` }
    ]
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0A0A0A]">
      <div className="flex min-h-16 flex-col gap-3 border-b border-white/5 px-4 py-3 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:px-6 lg:py-0">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/studio"
            aria-label="스튜디오로 돌아가기"
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="flex items-center font-bold">
              실행 상세
              {status === "running" && <Loader2 className="ml-2 h-4 w-4 animate-spin text-blue-400" />}
            </h1>
            <div className="break-words text-xs text-gray-500">
              Run {params.id} · {displayMissionStateLabel} · {displayRuntimeModeLabel}
            </div>
            {missionDetail?.goal && <div className="max-w-xl truncate text-xs text-gray-400">{missionDetail.goal}</div>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="stat-chip px-2 py-1 text-gray-300">
            <Timer className="mr-1 inline h-3.5 w-3.5 text-blue-300" />
            ETA <span className="font-semibold text-blue-200">{elapsedSec}s</span>
          </div>
          <div className="stat-chip px-2 py-1 text-gray-300">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-emerald-300" />
            Success <span className="font-semibold text-emerald-200">{successRate.toFixed(0)}%</span>
          </div>
          <div className="stat-chip px-2 py-1 text-gray-300">
            <Coins className="mr-1 inline h-3.5 w-3.5 text-yellow-300" />
            Cost <span className="font-semibold text-yellow-200">${totalCost.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
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

        <aside className="w-full shrink-0 border-t border-white/10 bg-[#0d1117] p-4 lg:w-[360px] lg:border-l lg:border-t-0">
          <div className="panel-shell mb-3 bg-black/30 px-3 py-2 text-xs text-gray-300">
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1 text-cyan-300">
                <Activity className="h-3.5 w-3.5" />
                운영 상태
              </span>
              <span className={runtimeHealth === "attention" ? "text-yellow-300" : "text-emerald-300"}>{runtimeHealthLabel}</span>
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

          <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
            {([
              ["timeline", "타임라인"],
              ["approvals", "승인"],
              ["artifacts", "산출물"],
              ["cost", "비용"],
              ["metrics", "지표"]
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSideTab(key)}
                className={`min-h-9 rounded-xl px-3 py-2 font-semibold ${sideTab === key ? "bg-blue-600 text-white" : "bg-white/5 text-gray-400 hover:text-gray-200"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
            {kpiByTab[sideTab].map((kpi) => (
              <div key={kpi.label} className="stat-chip bg-black/30 px-2 py-1.5">
                <div className="text-gray-500">{kpi.label}</div>
                <div className="mt-0.5 font-semibold text-gray-200">{kpi.value}</div>
              </div>
            ))}
          </div>

          {sideTab === "timeline" && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-cyan-300">실행 타임라인</h3>
                {(selectedMetricNode || selectedArtifact) && (
                  <button
                    onClick={() => {
                      setSelectedMetricNode(null);
                      setSelectedArtifact(null);
                    }}
                    className="text-[11px] text-gray-400 hover:text-gray-200"
                  >
                    필터 해제
                  </button>
                )}
              </div>
              <div className="mb-2 grid grid-cols-4 gap-1 text-[10px]">
                <div className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-1 text-cyan-100">
                  분기 {operationEventCounts.routes}
                </div>
                <div className="rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-1 text-violet-100">
                  반복 {operationEventCounts.loops}
                </div>
                <div className="rounded border border-yellow-500/20 bg-yellow-500/10 px-1.5 py-1 text-yellow-100">
                  승인 {operationEventCounts.approvals}
                </div>
                <div className="rounded border border-rose-500/20 bg-rose-500/10 px-1.5 py-1 text-rose-100">
                  위험 {operationEventCounts.risks}
                </div>
              </div>
              {(selectedMetricNode || selectedArtifact) && (
                <div className="mb-2 text-[11px] text-gray-500">
                  필터: {selectedMetricNode || "전체 노드"} / {selectedArtifact || "전체 산출물"}
                </div>
              )}
              <div className="max-h-[420px] space-y-2 overflow-y-auto text-xs">
                {filteredTimeline.map((t) => (
                  <div key={t.id} className={`rounded-xl border px-2.5 py-2 ${timelineToneClass(t.tone)}`}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 opacity-80">{timelineIcon(t.kind)}</span>
                        <span className="truncate font-semibold">{t.event}</span>
                      </span>
                      <span className="shrink-0 text-[10px] opacity-60">{t.ts}</span>
                    </div>
                    {t.detail && <div className="whitespace-pre-wrap text-[11px] leading-relaxed opacity-75">{t.detail}</div>}
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] opacity-60">
                      <span>{timelineKindLabel(t.kind)}</span>
                      <span>·</span>
                      <span>{t.source}</span>
                      {t.taskId && (
                        <>
                          <span>·</span>
                          <span>{t.taskId}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {filteredTimeline.length === 0 && (
                  <div className="log-row px-2 py-1 text-gray-500">선택한 기준의 실행 이벤트가 없습니다.</div>
                )}
              </div>
            </div>
          )}

          {sideTab === "approvals" && (
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
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
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
                      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300/20 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isRetryingApprovalNotifications ? "animate-spin" : ""}`} />
                      {isRetryingApprovalNotifications ? "재전송 중" : "알림 재전송"}
                    </button>
                  ) : null}
                  <Link
                    href="/runs"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
                  >
                    승인 큐 <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    href="/mypage?tab=approval"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
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
          )}

          {sideTab === "artifacts" && (
            <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-green-300">산출물 흐름</h3>
              {selectedArtifact && (
                <button onClick={() => setSelectedArtifact(null)} className="text-[11px] text-gray-400 hover:text-gray-200">
                  선택 해제
                </button>
              )}
            </div>
            <div className="space-y-2 text-xs">
              {artifactTrace.map((a, idx) => (
                <button
                  key={`${a.artifact}-${idx}`}
                  onClick={() => setSelectedArtifact(a.artifact)}
                  className={`w-full rounded px-2 py-2 text-left ${
                    selectedArtifact === a.artifact ? "bg-green-900/20 ring-1 ring-green-400/50" : "bg-black/30"
                  }`}
                >
                  <div className="font-medium text-gray-200">{a.artifact}</div>
                  <div className="mt-0.5 text-gray-500">
                    {a.from} → {a.to}
                  </div>
                  <div className="mt-1 text-[11px] text-cyan-300">status: {a.status}</div>
                </button>
              ))}
              {artifactTrace.length === 0 && (
                <div className="log-row px-2 py-2 text-gray-500">아직 생성된 산출물이 없습니다.</div>
              )}
            </div>
            {missionEvaluations.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 font-semibold text-indigo-300">품질 게이트</h3>
                <div className="space-y-2 text-xs">
                  {missionEvaluations.slice(-5).map((event, idx) => {
                    const score = typeof event.score === "number" ? event.score : 0;
                    const qualityPass = Boolean(event.quality_pass);
                    return (
                      <div key={`${event.task_id || "eval"}-${idx}`} className="log-row px-2 py-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-200">{String(event.role || event.task_id || "worker")}</span>
                          <span className={qualityPass ? "text-emerald-300" : "text-yellow-300"}>
                            {qualityPass ? "pass" : "review"} · {(score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="mt-1 text-gray-500">{eventMessage(event)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          )}

          {sideTab === "artifacts" && (
            <div className="mt-4">
            <h3 className="mb-2 font-semibold text-emerald-300">산출물 상세</h3>
            <div className="log-row px-2 py-2 text-xs">
              <div className="font-medium text-gray-200">{selectedArtifactDetail.artifact}</div>
              <div className="mt-1 text-gray-400">version: {selectedArtifactDetail.version}</div>
              <div className="text-gray-400">owner: {selectedArtifactDetail.owner}</div>
              <div className="mt-2 text-gray-300">변경 요약:</div>
              <ul className="mt-1 list-disc pl-4 text-gray-400">
                {selectedArtifactDetail.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div className="mt-2 text-gray-300">버전 이력:</div>
              <ul className="mt-1 list-disc pl-4 text-gray-400">
                {sortedArtifactHistory.map((v) => (
                  <li key={`${v.artifact_id}-${v.version}-${v.timestamp}`}>
                    {v.version} ({v.timestamp}) · by {v.changed_by} · {v.summary}
                  </li>
                ))}
                {sortedArtifactHistory.length === 0 && <li>버전 이력이 없습니다.</li>}
              </ul>
              {sortedArtifactHistory.length >= 2 && (
                <div className="mt-2 rounded border border-white/10 bg-black/30 px-2 py-2">
                  <div className="text-gray-300">
                    diff {artifactDiff.from} → {artifactDiff.to}
                  </div>
                  <div className="mt-1 space-y-1">
                    {artifactDiff.added.map((line) => (
                      <div key={`add-${line}`} className="text-emerald-300">+ {line}</div>
                    ))}
                    {artifactDiff.removed.map((line) => (
                      <div key={`del-${line}`} className="text-rose-300">- {line}</div>
                    ))}
                    {artifactDiff.added.length === 0 && artifactDiff.removed.length === 0 && (
                      <div className="text-gray-500">변경 요약 diff가 없습니다.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          {sideTab === "cost" && (
            <div className="mt-4">
            <h3 className="mb-2 font-semibold text-yellow-300">비용 구성</h3>
            <div className="space-y-2 text-xs">
              {costBreakdown.map((c) => (
                <div key={c.provider} className="log-row px-2 py-2">
                  <div className="mb-1 flex items-center justify-between text-gray-200">
                    <span>{c.provider}</span>
                    <span>${c.cost.toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 rounded bg-white/10">
                    <div className="h-full rounded bg-yellow-400" style={{ width: `${c.share}%` }} />
                  </div>
                  <div className="mt-1 text-right text-gray-500">{c.share}%</div>
                </div>
              ))}
              <div className="rounded border border-yellow-500/20 bg-yellow-900/10 px-2 py-1.5 text-right text-yellow-200">
                합계: ${totalCost.toFixed(2)}
              </div>
            </div>
          </div>
          )}

          {sideTab === "metrics" && (
            <div className="mt-4">
            <h3 className="mb-2 font-semibold text-purple-300">노드 지표</h3>
            <div className="space-y-2 text-xs">
              {nodeMetrics.map((m) => (
                <button
                  key={m.node}
                  onClick={() => setSelectedMetricNode((prev) => (prev === m.node ? null : m.node))}
                  className={`w-full rounded px-2 py-2 text-left ${
                    selectedMetricNode === m.node ? "bg-purple-900/30 ring-1 ring-purple-400/60" : "bg-black/30"
                  }`}
                >
                  <div className="font-medium text-gray-200">{m.node}</div>
                  <div className="mt-1 grid grid-cols-3 gap-2 text-gray-400">
                    <span>비용 ${m.cost.toFixed(4)}</span>
                    <span>신뢰 {(m.confidence * 100).toFixed(0)}%</span>
                    <span>재시도 {m.retries}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">
                    상태: {m.state} · 평균 신뢰 {(avgConfidence * 100).toFixed(0)}%
                  </div>
                </button>
              ))}
              {nodeMetrics.length === 0 && (
                <div className="log-row px-2 py-2 text-gray-500">라이브 노드 지표가 아직 없습니다.</div>
              )}
            </div>
          </div>
          )}
        </aside>
      </div>

      <div className="border-t border-white/5 px-6 py-3 text-xs text-gray-600">
        현재 {sideTabLabels[sideTab]} 보기 · 이벤트 {messages.length}건 · {displayRuntimeModeLabel}
      </div>
    </div>
  );
}
