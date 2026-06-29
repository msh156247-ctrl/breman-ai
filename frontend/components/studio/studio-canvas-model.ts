import { Mail, MessageCircle, ShieldCheck, Smartphone } from "lucide-react";
import { type Edge, type Node } from "reactflow";
import type { LoopRegion } from "../../stores/app.store";
import type { ApprovalChannelId, ApprovalChannelSettings } from "../../lib/api";
import { buildWorkflowGraphPayload, type ConditionDslCheck } from "../../lib/workflow-graph";
import type { NodeExecutionState } from "../../types";

export const STUDIO_DRAFT_STORAGE_KEY = "bremen.studio.draft.v1";
export const CANVAS_UTILITY_NODES = [
  { kind: "router", label: "조건 노드", description: "조건 함수와 여러 분기 경로를 관리합니다." },
  { kind: "hitl", label: "Human Approval", description: "사람 승인 체인 및 정책 게이트" }
] as const;
export const APPROVAL_CHANNEL_OPTIONS = [
  { id: "admin_queue", label: "관리자 대기열", description: "관리자 화면에서 대기 후 승인", icon: ShieldCheck },
  { id: "email", label: "이메일", description: "담당자 메일로 승인 요청", icon: Mail },
  { id: "sms", label: "문자", description: "긴급 승인을 문자로 알림", icon: Smartphone },
  { id: "kakao", label: "카톡", description: "카카오 알림톡/채널 알림", icon: MessageCircle }
] as const satisfies ReadonlyArray<{
  id: ApprovalChannelId;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
}>;
export const LOOP_EXIT_FINISH = "__finish__";
export const LIVE_RUNTIME_PROVIDERS = new Set(["openai"]);

export type StudioDraft = {
  version: 1;
  savedAt: string;
  missionGoal: string;
  missionBudget: string;
  useMockRuntime: boolean;
  viewMode: "execution" | "organization";
  nodes: Node[];
  edges: Edge[];
  nodeExecutionStates: Record<string, NodeExecutionState>;
  loopRegions?: LoopRegion[];
  workflowGraph?: ReturnType<typeof buildWorkflowGraphPayload>;
};

export type ConditionBranch = {
  id: string;
  label: string;
  expression: string;
  action: "node" | "end" | "notify";
  targetNodeId: string;
  notifyMessage: string;
};

export type FlowModalTab = "steps" | "settings" | "routes" | "conditions";

export const FLOW_MODAL_TABS: ReadonlyArray<{ id: FlowModalTab; label: string; detail: string }> = [
  { id: "steps", label: "실행 단계", detail: "순서와 상태" },
  { id: "settings", label: "선택 설정", detail: "승인·조건" },
  { id: "routes", label: "연결/반복", detail: "링크와 루프" },
  { id: "conditions", label: "조건/추가", detail: "분기와 노드" }
];

export type ApprovalSettingsLoadState = "idle" | "loading" | "ready" | "unavailable";

export type StudioApprovalChannelState = {
  label: string;
  detail: string;
  tone: "ready" | "warn" | "neutral";
  transport: string;
};

export const NODE_STATE_BADGE: Record<string, string> = {
  idle: "bg-gray-900/60 text-gray-300 border border-gray-700/60",
  running: "bg-blue-900/50 text-blue-200 border border-blue-500/40",
  streaming: "bg-cyan-900/50 text-cyan-200 border border-cyan-500/40",
  waiting_input: "bg-yellow-900/50 text-yellow-200 border border-yellow-500/40",
  failed: "bg-rose-900/50 text-rose-200 border border-rose-500/40",
  skipped: "bg-slate-900/50 text-slate-200 border border-slate-500/40",
  completed: "bg-emerald-900/50 text-emerald-200 border border-emerald-500/40"
};

export function readStudioDraft(): StudioDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STUDIO_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudioDraft>;
    if (parsed.version !== 1 || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return {
      version: 1,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
      missionGoal: typeof parsed.missionGoal === "string" ? parsed.missionGoal : "새로운 실행 워크플로우",
      missionBudget: typeof parsed.missionBudget === "string" ? parsed.missionBudget : "5",
      useMockRuntime: typeof parsed.useMockRuntime === "boolean" ? parsed.useMockRuntime : true,
      viewMode: parsed.viewMode === "organization" ? "organization" : "execution",
      nodes: parsed.nodes as Node[],
      edges: parsed.edges as Edge[],
      nodeExecutionStates:
        parsed.nodeExecutionStates && typeof parsed.nodeExecutionStates === "object"
          ? (parsed.nodeExecutionStates as Record<string, NodeExecutionState>)
          : {},
      loopRegions: Array.isArray(parsed.loopRegions) ? (parsed.loopRegions as LoopRegion[]) : [],
      workflowGraph:
        parsed.workflowGraph && typeof parsed.workflowGraph === "object"
          ? (parsed.workflowGraph as ReturnType<typeof buildWorkflowGraphPayload>)
          : undefined
    };
  } catch {
    return null;
  }
}

export function formatDraftTime(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}

export function getNodeLabel(node: Node): string {
  return String((node.data as { label?: unknown } | undefined)?.label || node.id);
}

export function getNodeCategory(node: Node): string {
  return String((node.data as { category?: unknown } | undefined)?.category || node.type || "node");
}

export function isConditionNode(node: Node): boolean {
  const data = (node.data as any) || {};
  return (
    String(data.agent_id || "").toLowerCase() === "router" ||
    String(data.category || "").toLowerCase().includes("router") ||
    String(data.label || "").includes("조건")
  );
}

export function normalizeConditionBranches(value: unknown): ConditionBranch[] {
  if (!Array.isArray(value)) return [];
  return value.map((branch, index) => {
    const item = branch as Partial<ConditionBranch>;
    const action = item.action === "end" || item.action === "notify" || item.action === "node" ? item.action : "node";
    return {
      id: typeof item.id === "string" && item.id ? item.id : `branch-${index + 1}`,
      label: typeof item.label === "string" && item.label ? item.label : `분기 ${index + 1}`,
      expression: typeof item.expression === "string" ? item.expression : "",
      action,
      targetNodeId: typeof item.targetNodeId === "string" ? item.targetNodeId : "",
      notifyMessage: typeof item.notifyMessage === "string" ? item.notifyMessage : ""
    };
  });
}

export function orderFlowNodes(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length <= 1) return nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, Set<string>>();

  edges.forEach((edge) => {
    if (!byId.has(edge.source) || !byId.has(edge.target)) return;
    const targets = outgoing.get(edge.source) || new Set<string>();
    if (targets.has(edge.target)) return;
    targets.add(edge.target);
    outgoing.set(edge.source, targets);
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
  });

  const byPosition = (a: Node, b: Node) => a.position.x - b.position.x || a.position.y - b.position.y;
  const queue = nodes.filter((node) => (incoming.get(node.id) || 0) === 0).sort(byPosition);
  const visited = new Set<string>();
  const ordered: Node[] = [];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || visited.has(next.id)) continue;
    visited.add(next.id);
    ordered.push(next);
    Array.from(outgoing.get(next.id) || [])
      .map((id) => byId.get(id))
      .filter((node): node is Node => Boolean(node))
      .sort(byPosition)
      .forEach((node) => {
        const remaining = Math.max(0, (incoming.get(node.id) || 0) - 1);
        incoming.set(node.id, remaining);
        if (remaining === 0 && !visited.has(node.id)) {
          queue.push(node);
          queue.sort(byPosition);
        }
      });
  }

  nodes
    .filter((node) => !visited.has(node.id))
    .sort(byPosition)
    .forEach((node) => ordered.push(node));

  return ordered;
}

export function describeConditionCheck(check: ConditionDslCheck): string {
  if (check.kind === "always") return "true";
  if (check.kind === "time") return `${check.rule} · ${check.timezone}`;
  if (check.kind === "data") return `${check.path} ${check.operator} ${compactValue(check.value)}`;
  if (check.kind === "expression") return check.expression;
  return `${check.branches.length} branches · first match wins`;
}

export function conditionCheckLabel(check: ConditionDslCheck): string {
  if (check.kind === "always") return "always";
  if (check.kind === "time") return "time";
  if (check.kind === "data") return "data";
  if (check.kind === "expression") return "expression";
  return "router";
}

export function studioApprovalChannelState(
  channelId: ApprovalChannelId,
  settings: ApprovalChannelSettings | null,
  envOverrides: Record<string, boolean>,
  loadState: ApprovalSettingsLoadState
): StudioApprovalChannelState {
  if (channelId === "admin_queue") {
    return {
      label: "내부 큐",
      detail: settings?.channels.admin_queue.target || "실행 기록 승인 대기 큐",
      tone: "ready",
      transport: "internal_queue"
    };
  }
  if (loadState === "loading" || loadState === "idle") {
    return { label: "확인 중", detail: "저장된 승인 채널 설정 확인 중", tone: "neutral", transport: "checking" };
  }
  if (!settings) {
    return { label: "설정 미확인", detail: "설정 API를 불러오지 못했습니다", tone: "neutral", transport: "unknown" };
  }

  const channel = settings.channels[channelId];
  const envWebhook = Boolean(envOverrides[`${channelId}_webhook`]);
  const smtpReady = channelId === "email" && Boolean(envOverrides.smtp);
  const savedWebhook = Boolean(channel.webhook_url);
  const ready = channel.enabled && (savedWebhook || envWebhook || smtpReady);
  if (!channel.enabled) {
    return {
      label: "꺼짐",
      detail: "내 공간 > 승인 채널에서 사용 설정 필요",
      tone: "warn",
      transport: "disabled"
    };
  }
  if (!ready) {
    return {
      label: "설정 필요",
      detail: "webhook 또는 SMTP 어댑터가 필요합니다",
      tone: "warn",
      transport: "external_outbox"
    };
  }
  return {
    label: "준비됨",
    detail: channel.target || (channelId === "email" ? "이메일 대상 미지정" : "승인 대상 미지정"),
    tone: "ready",
    transport: savedWebhook ? "saved_webhook" : envWebhook ? "env_webhook" : "smtp"
  };
}

export function approvalChannelStateClass(tone: StudioApprovalChannelState["tone"]): string {
  if (tone === "ready") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  if (tone === "warn") return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  return "border-white/10 bg-white/[0.06] text-gray-300";
}

export function flowConditionBadgeLabel(data: Record<string, unknown>): string {
  const mode = String(data.condition_mode || "").trim();
  const hasBranches = Array.isArray(data.condition_branches) && data.condition_branches.length > 0;
  if (hasBranches) return "분기 조건";
  if (mode === "time") return "시간 조건";
  if (mode === "data") return "데이터 조건";
  if (mode === "composite") return "시간+데이터";
  if (mode === "condition" || String(data.condition_expression || "").trim()) return "조건 있음";
  return "항상 실행";
}

function compactValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
