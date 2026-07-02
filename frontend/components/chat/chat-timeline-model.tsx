import { Activity, Bell, CheckCircle2, Coins, GitBranch, Repeat2, ShieldCheck, SkipForward } from "lucide-react";
import type { MissionTimelineEvent } from "../../lib/api";
import {
  eventDate,
  type ChatRow,
  type TimelineKind,
  type TimelineRow
} from "./chat-runtime-model";

export function eventMessage(event: MissionTimelineEvent): string {
  return String(event.message || event.type || JSON.stringify(event));
}

export function compactEventText(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  if (Array.isArray(value)) return value.map((item) => compactEventText(item)).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function eventStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

export function eventTaskLabel(event: MissionTimelineEvent): string {
  return String(event.task_id || event.role || "mission");
}

export function eventKind(type: string): TimelineKind {
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

export function eventTone(type: string): TimelineRow["tone"] {
  const normalized = type.toLowerCase();
  if (normalized.includes("failed") || normalized.includes("error") || normalized.includes("blocked")) return "danger";
  if (normalized.includes("human_gate") || normalized.includes("approval") || normalized.includes("skipped")) return "warning";
  if (normalized.includes("completed") || normalized.includes("approved") || normalized.includes("exited")) return "success";
  if (normalized.includes("route") || normalized.includes("loop") || normalized.includes("condition")) return "info";
  return "default";
}

export function describeRuntimeEvent(event: MissionTimelineEvent): { title: string; detail?: string } {
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

export function eventChatType(kind: string): ChatRow["type"] {
  const normalized = kind.toLowerCase();
  if (normalized.includes("human_gate") || normalized.includes("approve") || normalized.includes("approval")) return "human_gate";
  if (normalized.includes("task") || normalized.includes("execution") || normalized.includes("evaluation")) return "agent";
  return "system";
}

export function formatEventTime(value: unknown): string {
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

export function eventToChatRow(event: MissionTimelineEvent, index: number): ChatRow {
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

export function eventToTimelineRow(event: MissionTimelineEvent, index: number, source: "api" | "stream"): TimelineRow {
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

export function dedupeTimelineRows(rows: TimelineRow[]): TimelineRow[] {
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

export function timelineKindLabel(kind: TimelineKind): string {
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

export function timelineToneClass(tone: TimelineRow["tone"]): string {
  const classes: Record<TimelineRow["tone"], string> = {
    default: "border-white/10 bg-black/25 text-gray-300",
    success: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-100",
    warning: "border-yellow-500/25 bg-yellow-500/[0.08] text-yellow-100",
    danger: "border-rose-500/25 bg-rose-500/[0.08] text-rose-100",
    info: "border-cyan-500/25 bg-cyan-500/[0.08] text-cyan-100"
  };
  return classes[tone];
}

export function timelineIcon(kind: TimelineKind) {
  if (kind === "route") return <GitBranch className="h-3.5 w-3.5" />;
  if (kind === "loop") return <Repeat2 className="h-3.5 w-3.5" />;
  if (kind === "approval") return <ShieldCheck className="h-3.5 w-3.5" />;
  if (kind === "condition") return <SkipForward className="h-3.5 w-3.5" />;
  if (kind === "quality") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (kind === "cost") return <Coins className="h-3.5 w-3.5" />;
  if (kind === "mission") return <Activity className="h-3.5 w-3.5" />;
  return <Bell className="h-3.5 w-3.5" />;
}
