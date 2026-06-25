"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Clock3,
  GitBranch,
  Link2,
  ListOrdered,
  Loader2,
  Mail,
  Maximize2,
  MessageCircle,
  PanelLeft,
  Plus,
  Play,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Smartphone,
  Workflow,
  X,
  Zap
} from "lucide-react";
import { type Edge, type Node } from "reactflow";
import AgentPoolPanel from "./AgentPoolPanel";
import ConfigPanel from "./ConfigPanel";
import StudioMemberSettings from "./StudioMemberSettings";
import { useAppStore, type LoopRegion } from "../../stores/app.store";
import {
  createMission,
  fetchApprovalChannelSettings,
  type ApprovalChannelId,
  type ApprovalChannelSettings
} from "../../lib/api";
import { isDemoModeEnabled } from "../../lib/demo-mode";
import { buildConditionDslContract, buildWorkflowGraphPayload, type ConditionDslCheck } from "../../lib/workflow-graph";
import type { NodeExecutionState } from "../../types";

const STUDIO_DRAFT_STORAGE_KEY = "bremen.studio.draft.v1";
const CANVAS_UTILITY_NODES = [
  { kind: "router", label: "조건 노드", description: "조건 함수와 여러 분기 경로를 관리합니다." },
  { kind: "hitl", label: "Human Approval", description: "사람 승인 체인 및 정책 게이트" }
] as const;
const APPROVAL_CHANNEL_OPTIONS = [
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
const LOOP_EXIT_FINISH = "__finish__";
const LIVE_RUNTIME_PROVIDERS = new Set(["openai"]);
type StudioDraft = {
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
type ConditionBranch = {
  id: string;
  label: string;
  expression: string;
  action: "node" | "end" | "notify";
  targetNodeId: string;
  notifyMessage: string;
};
type FlowModalTab = "steps" | "settings" | "routes" | "conditions";
const FLOW_MODAL_TABS: ReadonlyArray<{ id: FlowModalTab; label: string; detail: string }> = [
  { id: "steps", label: "실행 단계", detail: "순서와 상태" },
  { id: "settings", label: "선택 설정", detail: "승인·조건" },
  { id: "routes", label: "연결/반복", detail: "링크와 루프" },
  { id: "conditions", label: "조건/추가", detail: "분기와 노드" }
];

function readStudioDraft(): StudioDraft | null {
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

function formatDraftTime(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}

function getNodeLabel(node: Node): string {
  return String((node.data as { label?: unknown } | undefined)?.label || node.id);
}

function getNodeCategory(node: Node): string {
  return String((node.data as { category?: unknown } | undefined)?.category || node.type || "node");
}

function isConditionNode(node: Node): boolean {
  const data = (node.data as any) || {};
  return (
    String(data.agent_id || "").toLowerCase() === "router" ||
    String(data.category || "").toLowerCase().includes("router") ||
    String(data.label || "").includes("조건")
  );
}

function normalizeConditionBranches(value: unknown): ConditionBranch[] {
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

function orderFlowNodes(nodes: Node[], edges: Edge[]): Node[] {
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

function compactValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function describeConditionCheck(check: ConditionDslCheck): string {
  if (check.kind === "always") return "true";
  if (check.kind === "time") return `${check.rule} · ${check.timezone}`;
  if (check.kind === "data") return `${check.path} ${check.operator} ${compactValue(check.value)}`;
  if (check.kind === "expression") return check.expression;
  return `${check.branches.length} branches · first match wins`;
}

function conditionCheckLabel(check: ConditionDslCheck): string {
  if (check.kind === "always") return "always";
  if (check.kind === "time") return "time";
  if (check.kind === "data") return "data";
  if (check.kind === "expression") return "expression";
  return "router";
}

type ApprovalSettingsLoadState = "idle" | "loading" | "ready" | "unavailable";

type StudioApprovalChannelState = {
  label: string;
  detail: string;
  tone: "ready" | "warn" | "neutral";
  transport: string;
};

function studioApprovalChannelState(
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

function approvalChannelStateClass(tone: StudioApprovalChannelState["tone"]): string {
  if (tone === "ready") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  if (tone === "warn") return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  return "border-white/10 bg-white/[0.06] text-gray-300";
}
function flowConditionBadgeLabel(data: Record<string, unknown>): string {
  const mode = String(data.condition_mode || "").trim();
  const hasBranches = Array.isArray(data.condition_branches) && data.condition_branches.length > 0;
  if (hasBranches) return "분기 조건";
  if (mode === "time") return "시간 조건";
  if (mode === "data") return "데이터 조건";
  if (mode === "composite") return "시간+데이터";
  if (mode === "condition" || String(data.condition_expression || "").trim()) return "조건 있음";
  return "항상 실행";
}
const NODE_STATE_BADGE: Record<string, string> = {
  idle: "bg-gray-900/60 text-gray-300 border border-gray-700/60",
  running: "bg-blue-900/50 text-blue-200 border border-blue-500/40",
  streaming: "bg-cyan-900/50 text-cyan-200 border border-cyan-500/40",
  waiting_input: "bg-yellow-900/50 text-yellow-200 border border-yellow-500/40",
  failed: "bg-rose-900/50 text-rose-200 border border-rose-500/40",
  skipped: "bg-slate-900/50 text-slate-200 border border-slate-500/40",
  completed: "bg-emerald-900/50 text-emerald-200 border border-emerald-500/40"
};

export function StudioCanvas() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const flowModalReturnScrollYRef = useRef(0);
  const [missionGoal, setMissionGoal] = useState("새로운 실행 워크플로우");
  const [missionBudget, setMissionBudget] = useState("5");
  const [useMockRuntime, setUseMockRuntime] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executeError, setExecuteError] = useState("");
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState("");
  const [approvalSettings, setApprovalSettings] = useState<ApprovalChannelSettings | null>(null);
  const [approvalEnvOverrides, setApprovalEnvOverrides] = useState<Record<string, boolean>>({});
  const [approvalSettingsState, setApprovalSettingsState] = useState<ApprovalSettingsLoadState>("idle");
  const [showFlowModal, setShowFlowModal] = useState(() => searchParams.get("panel") === "flow");
  const [flowModalTab, setFlowModalTab] = useState<FlowModalTab>("steps");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [linkTargetId, setLinkTargetId] = useState("");
  const [selectedConditionNodeId, setSelectedConditionNodeId] = useState("");
  const [loopBandMode, setLoopBandMode] = useState(false);
  const [bandSelectedNodeIds, setBandSelectedNodeIds] = useState<string[]>([]);
  const isDemoMode = isDemoModeEnabled();
  const {
    hiredAgents,
    libraryAgents,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    connectNodes,
    loopRegions,
    selectedLoopRegionId,
    createLoopRegion,
    updateLoopRegion,
    removeLoopRegion,
    setSelectedLoopRegionId,
    hireAgent,
    addNodeFromAgent,
    addUtilityNode,
    updateNodeData,
    selectedNodeId,
    setSelectedNodeId,
    clearCanvas,
    missionRunState,
    missionRunTransitionWarning,
    clearMissionRunTransitionWarning,
    setMissionRunState,
    resetMissionRunState,
    setNodeExecutionState,
    nodeExecutionStates,
    replaceCanvas
  } = useAppStore();
  const orderedFlowNodes = useMemo(() => orderFlowNodes(nodes, edges), [edges, nodes]);
  const stepIndexByNodeId = useMemo(
    () => new Map(orderedFlowNodes.map((node, index) => [node.id, index + 1])),
    [orderedFlowNodes]
  );
  const selectLoopRegionForEdit = useCallback(
    (regionId: string) => {
      setSelectedLoopRegionId(regionId);
      setSelectedNodeId(null);
      setLoopBandMode(false);
      setFlowModalTab("routes");
    },
    [setSelectedLoopRegionId, setSelectedNodeId]
  );
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );
  const selectedNodeData = (selectedNode?.data as any) || {};
  const selectedNodeLabel = selectedNode ? getNodeLabel(selectedNode) : "";
  const selectedConditionMode = String(
    selectedNodeData.condition_mode ||
      (String(selectedNodeData.condition_expression || "").trim() ? "condition" : "always")
  );
  const selectedConditionDsl = useMemo(
    () => buildConditionDslContract({ ...selectedNodeData, condition_mode: selectedConditionMode }),
    [selectedConditionMode, selectedNodeData]
  );
  const selectedApprovalChannels: string[] = Array.isArray(selectedNodeData.approval_channels)
    ? selectedNodeData.approval_channels
    : selectedNodeData.execution_mode === "confirm"
      ? ["admin_queue"]
      : [];
  const approvalChannelStates = useMemo(
    () =>
      Object.fromEntries(
        APPROVAL_CHANNEL_OPTIONS.map((channel) => [
          channel.id,
          studioApprovalChannelState(channel.id, approvalSettings, approvalEnvOverrides, approvalSettingsState)
        ])
      ) as Record<ApprovalChannelId, StudioApprovalChannelState>,
    [approvalEnvOverrides, approvalSettings, approvalSettingsState]
  );
  const selectedUnreadyApprovalChannels = useMemo(
    () =>
      selectedApprovalChannels
        .map((channel) => channel as ApprovalChannelId)
        .filter((channel) => channel !== "admin_queue" && approvalChannelStates[channel]?.tone === "warn"),
    [approvalChannelStates, selectedApprovalChannels]
  );
  const linkableTargetNodes = useMemo(
    () => nodes.filter((node) => node.id !== selectedNodeId),
    [nodes, selectedNodeId]
  );
  const selectedLoopRegion = useMemo(
    () => loopRegions.find((region) => region.id === selectedLoopRegionId) || loopRegions[0] || null,
    [loopRegions, selectedLoopRegionId]
  );
  const bandSelectedNodes = useMemo(
    () => bandSelectedNodeIds.map((nodeId) => nodes.find((node) => node.id === nodeId)).filter((node): node is Node => Boolean(node)),
    [bandSelectedNodeIds, nodes]
  );
  const bandSelectedNodeIdSet = useMemo(() => new Set(bandSelectedNodeIds), [bandSelectedNodeIds]);
  const bandSelectedEdges = useMemo(
    () => edges.filter((edge) => bandSelectedNodeIdSet.has(edge.source) && bandSelectedNodeIdSet.has(edge.target)),
    [bandSelectedNodeIdSet, edges]
  );
  const selectedLoopNodes = useMemo(
    () =>
      selectedLoopRegion
        ? selectedLoopRegion.nodeIds
            .map((nodeId) => nodes.find((node) => node.id === nodeId))
            .filter((node): node is Node => Boolean(node))
        : [],
    [nodes, selectedLoopRegion]
  );
  const outsideLoopNodes = useMemo(
    () => nodes.filter((node) => !selectedLoopRegion?.nodeIds.includes(node.id)),
    [nodes, selectedLoopRegion]
  );
  const selectedLoopStartNode = useMemo(
    () => (selectedLoopRegion ? nodes.find((node) => node.id === selectedLoopRegion.startNodeId) || null : null),
    [nodes, selectedLoopRegion]
  );
  const selectedLoopEndNode = useMemo(
    () => (selectedLoopRegion ? nodes.find((node) => node.id === selectedLoopRegion.endNodeId) || null : null),
    [nodes, selectedLoopRegion]
  );
  const selectedLoopConditionNodeId =
    selectedLoopRegion?.exitConditionNodeId || selectedLoopRegion?.endNodeId || selectedLoopRegion?.startNodeId || "";
  const selectedLoopConditionNode = useMemo(
    () => nodes.find((node) => node.id === selectedLoopConditionNodeId) || selectedLoopEndNode || selectedLoopStartNode,
    [nodes, selectedLoopConditionNodeId, selectedLoopEndNode, selectedLoopStartNode]
  );
  const selectedLoopExitNode = useMemo(
    () =>
      selectedLoopRegion && selectedLoopRegion.exitNodeId !== LOOP_EXIT_FINISH
        ? nodes.find((node) => node.id === selectedLoopRegion.exitNodeId) || null
        : null,
    [nodes, selectedLoopRegion]
  );
  const conditionNodes = useMemo(() => nodes.filter(isConditionNode), [nodes]);
  const activeConditionNode = useMemo(() => {
    if (selectedNode && isConditionNode(selectedNode)) return selectedNode;
    return (
      conditionNodes.find((node) => node.id === selectedConditionNodeId) ||
      conditionNodes[0] ||
      null
    );
  }, [conditionNodes, selectedConditionNodeId, selectedNode]);
  const activeConditionData = (activeConditionNode?.data as any) || {};
  const conditionBranches = useMemo(
    () => normalizeConditionBranches(activeConditionData.condition_branches),
    [activeConditionData.condition_branches]
  );
  const activeConditionDsl = useMemo(
    () =>
      buildConditionDslContract({
        ...activeConditionData,
        condition_mode: activeConditionData.condition_mode || "condition"
      }),
    [activeConditionData]
  );
  const conditionTargetNodes = useMemo(
    () => nodes.filter((node) => node.id !== activeConditionNode?.id),
    [activeConditionNode?.id, nodes]
  );
  const connectSourceId = selectedNodeId || orderedFlowNodes[orderedFlowNodes.length - 1]?.id;
  const addContextLabel = selectedNode ? `${getNodeLabel(selectedNode)} 뒤에 연결` : nodes.length > 0 ? "마지막 노드 뒤에 연결" : "첫 노드로 추가";
  const libraryOnlyAgents = useMemo(
    () => libraryAgents.filter((agent) => !hiredAgents.some((hired) => hired.id === agent.id)).slice(0, 6),
    [hiredAgents, libraryAgents]
  );
  const approvalGateCount = useMemo(
    () =>
      nodes.filter((node) => {
        const data = (node.data as any) || {};
        return data.execution_mode === "confirm" || String(data.agent_id || "").toLowerCase() === "hitl";
      }).length,
    [nodes]
  );
  const conditionRuleCount = useMemo(
    () =>
      nodes.filter((node) => {
        const data = (node.data as any) || {};
        return isConditionNode(node) || Boolean(data.condition_mode && data.condition_mode !== "always");
      }).length,
    [nodes]
  );
  const budgetNumber = Number(missionBudget);
  const unsupportedLiveProviders = useMemo(
    () =>
      Array.from(
        new Set(
          nodes
            .filter((node) => {
              const data = (node.data as Record<string, unknown>) || {};
              const agentId = String(data.agent_id || "").toLowerCase();
              return !["router", "hitl", "human_approval"].includes(agentId);
            })
            .map((node) => String((node.data as Record<string, unknown>)?.required_api || "openai").toLowerCase())
            .filter((provider) => !LIVE_RUNTIME_PROVIDERS.has(provider))
        )
      ),
    [nodes]
  );
  const runReadiness = useMemo(() => {
    if (nodes.length === 0) return { label: "노드 필요", tone: "warn" as const };
    if (!missionGoal.trim()) return { label: "목표 필요", tone: "warn" as const };
    if (!Number.isFinite(budgetNumber) || budgetNumber <= 0) return { label: "예산 확인", tone: "warn" as const };
    if (!useMockRuntime && unsupportedLiveProviders.length > 0) {
      return {
        label: `${unsupportedLiveProviders.join(", ")} 엔진 미지원`,
        tone: "warn" as const
      };
    }
    return { label: useMockRuntime ? "Mock 실행 준비" : "Live 실행 준비", tone: "ready" as const };
  }, [budgetNumber, missionGoal, nodes.length, unsupportedLiveProviders, useMockRuntime]);

  useEffect(() => {
    setShowFlowModal(searchParams.get("panel") === "flow");
  }, [searchParams]);

  useEffect(() => {
    const draft = readStudioDraft();
    if (draft) setDraftSavedAt(draft.savedAt);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setApprovalSettingsState("loading");
    fetchApprovalChannelSettings()
      .then((response) => {
        if (cancelled) return;
        setApprovalSettings(response.settings);
        setApprovalEnvOverrides(response.env_overrides || {});
        setApprovalSettingsState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setApprovalSettings(null);
        setApprovalEnvOverrides({});
        setApprovalSettingsState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedNodeId) {
      setLinkTargetId("");
      return;
    }
    if (linkTargetId && linkableTargetNodes.some((node) => node.id === linkTargetId)) return;
    setLinkTargetId(linkableTargetNodes[0]?.id || "");
  }, [linkTargetId, linkableTargetNodes, selectedNodeId]);

  useEffect(() => {
    if (selectedNode && isConditionNode(selectedNode)) {
      setSelectedConditionNodeId(selectedNode.id);
      return;
    }
    if (selectedConditionNodeId && conditionNodes.some((node) => node.id === selectedConditionNodeId)) return;
    setSelectedConditionNodeId(conditionNodes[0]?.id || "");
  }, [conditionNodes, selectedConditionNodeId, selectedNode]);

  useEffect(() => {
    if (!selectedLoopRegionId) return;
    if (loopRegions.some((region) => region.id === selectedLoopRegionId)) return;
    setSelectedLoopRegionId(loopRegions[0]?.id || null);
  }, [loopRegions, selectedLoopRegionId, setSelectedLoopRegionId]);

  const openFlowModal = useCallback(() => {
    flowModalReturnScrollYRef.current = window.scrollY;
    setFlowModalTab("steps");
    setShowFlowModal(true);
    const params = new URLSearchParams(window.location.search);
    params.set("panel", "flow");
    window.history.replaceState(null, "", `/studio?${params.toString()}`);
  }, []);

  const closeFlowModal = useCallback(() => {
    setShowFlowModal(false);
    const params = new URLSearchParams(window.location.search);
    params.delete("panel");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/studio?${query}` : "/studio");
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: flowModalReturnScrollYRef.current, left: 0, behavior: "auto" });
    });
  }, []);

  const getAutoAddPosition = useCallback(() => {
    const source = selectedNode || orderedFlowNodes[orderedFlowNodes.length - 1] || null;
    if (!source) return { x: 80, y: 160 };
    return { x: source.position.x + 320, y: source.position.y };
  }, [orderedFlowNodes, selectedNode]);

  const appendAgentToFlow = useCallback(
    (agent: (typeof hiredAgents)[number]) => {
      hireAgent(agent);
      addNodeFromAgent(agent, getAutoAddPosition(), {
        connectFromId: nodes.length > 0 ? connectSourceId : undefined
      });
      setShowAddPanel(false);
    },
    [addNodeFromAgent, connectSourceId, getAutoAddPosition, hireAgent, nodes.length]
  );

  const appendUtilityToFlow = useCallback(
    (utility: (typeof CANVAS_UTILITY_NODES)[number]) => {
      addUtilityNode(utility, getAutoAddPosition(), {
        connectFromId: nodes.length > 0 ? connectSourceId : undefined
      });
      setShowAddPanel(false);
    },
    [addUtilityNode, connectSourceId, getAutoAddPosition, nodes.length]
  );

  const connectSelectedToTarget = useCallback(() => {
    if (!selectedNodeId || !linkTargetId) return;
    connectNodes(selectedNodeId, linkTargetId, {
      condition: String(selectedNodeData.condition_expression || ""),
      animated: true
    });
  }, [connectNodes, linkTargetId, selectedNodeData.condition_expression, selectedNodeId]);

  const updateSelectedNodeData = useCallback(
    (data: Record<string, unknown>) => {
      if (!selectedNodeId) return;
      updateNodeData(selectedNodeId, data);
    },
    [selectedNodeId, updateNodeData]
  );

  const updateSelectedConditionMode = useCallback(
    (mode: string) => {
      updateSelectedNodeData({
        condition_mode: mode,
        condition_expression:
          mode === "always"
            ? ""
            : mode === "composite"
              ? String(selectedNodeData.condition_expression || "time.in_window == true && payload.status == 'ready'")
              : mode === "condition"
                ? String(selectedNodeData.condition_expression || "risk_score > 0.7")
                : String(selectedNodeData.condition_expression || "")
      });
    },
    [selectedNodeData.condition_expression, updateSelectedNodeData]
  );

  const toggleSelectedApprovalChannel = useCallback(
    (channelId: string) => {
      const active = selectedApprovalChannels.includes(channelId);
      const channelState = approvalChannelStates[channelId as ApprovalChannelId];
      const canEnable = channelId === "admin_queue" || channelState?.tone === "ready";
      if (!active && !canEnable) return;

      const nextChannels = active
        ? selectedApprovalChannels.filter((id) => id !== channelId)
        : [...selectedApprovalChannels, channelId];
      updateSelectedNodeData({ approval_channels: nextChannels.length > 0 ? nextChannels : ["admin_queue"] });
    },
    [approvalChannelStates, selectedApprovalChannels, updateSelectedNodeData]
  );

  const toggleLoopBandNode = useCallback(
    (nodeId: string) => {
      setBandSelectedNodeIds((selectedIds) =>
        selectedIds.includes(nodeId) ? selectedIds.filter((id) => id !== nodeId) : [...selectedIds, nodeId]
      );
      setSelectedNodeId(nodeId);
    },
    [setSelectedNodeId]
  );

  const createLoopRegionFromBand = useCallback(() => {
    const selectedIds = Array.from(new Set(bandSelectedNodeIds)).filter((nodeId) => nodes.some((node) => node.id === nodeId));
    if (selectedIds.length < 2) return;
    const selectedSet = new Set(selectedIds);
    const orderedSelectedNodes = orderedFlowNodes.filter((node) => selectedSet.has(node.id));
    const selectedNodes = orderedSelectedNodes.length > 0 ? orderedSelectedNodes : nodes.filter((node) => selectedSet.has(node.id));
    const internalEdges = edges.filter((edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target));
    const incomingIds = new Set(internalEdges.map((edge) => edge.target));
    const outgoingIds = new Set(internalEdges.map((edge) => edge.source));
    const startNode = selectedNodes.find((node) => !incomingIds.has(node.id)) || selectedNodes[0];
    const endNode =
      [...selectedNodes].reverse().find((node) => !outgoingIds.has(node.id)) || selectedNodes[selectedNodes.length - 1];
    const exitEdge =
      edges.find((edge) => edge.source === endNode.id && !selectedSet.has(edge.target)) ||
      edges.find((edge) => selectedSet.has(edge.source) && !selectedSet.has(edge.target));
    createLoopRegion({
      name: `반복 영역 ${loopRegions.length + 1}`,
      nodeIds: selectedIds,
      startNodeId: startNode.id,
      endNodeId: endNode.id,
      exitNodeId: exitEdge?.target || LOOP_EXIT_FINISH,
      exitConditionNodeId: endNode.id,
      repeatCount: 3,
      exitCondition: "result.done == true"
    });
    setSelectedNodeId(startNode.id);
    setBandSelectedNodeIds([]);
    setLoopBandMode(false);
    setFlowModalTab("routes");
  }, [bandSelectedNodeIds, createLoopRegion, edges, loopRegions.length, nodes, orderedFlowNodes, setSelectedNodeId]);

  const updateSelectedLoopRegion = useCallback(
    (patch: Partial<Omit<LoopRegion, "id" | "createdAt">>) => {
      if (!selectedLoopRegion) return;
      updateLoopRegion(selectedLoopRegion.id, patch);
    },
    [selectedLoopRegion, updateLoopRegion]
  );

  const updateConditionNodeData = useCallback(
    (patch: Record<string, unknown>) => {
      if (!activeConditionNode) return;
      updateNodeData(activeConditionNode.id, patch);
    },
    [activeConditionNode, updateNodeData]
  );

  const setConditionBranches = useCallback(
    (branches: ConditionBranch[]) => {
      updateConditionNodeData({ condition_branches: branches });
    },
    [updateConditionNodeData]
  );

  const addConditionNode = useCallback(() => {
    const conditionUtility = CANVAS_UTILITY_NODES.find((item) => item.kind === "router");
    if (!conditionUtility) return;
    appendUtilityToFlow(conditionUtility);
    setFlowModalTab("conditions");
  }, [appendUtilityToFlow]);

  const addConditionBranch = useCallback(() => {
    const nextTarget =
      conditionTargetNodes.find((node) => node.id !== activeConditionNode?.id)?.id || LOOP_EXIT_FINISH;
    setConditionBranches([
      ...conditionBranches,
      {
        id: `branch-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        label: `분기 ${conditionBranches.length + 1}`,
        expression: conditionBranches.length === 0 ? "result.ok == true" : "else",
        action: nextTarget === LOOP_EXIT_FINISH ? "end" : "node",
        targetNodeId: nextTarget === LOOP_EXIT_FINISH ? "" : nextTarget,
        notifyMessage: ""
      }
    ]);
  }, [activeConditionNode?.id, conditionBranches, conditionTargetNodes, setConditionBranches]);

  const updateConditionBranch = useCallback(
    (branchId: string, patch: Partial<ConditionBranch>) => {
      setConditionBranches(
        conditionBranches.map((branch) =>
          branch.id === branchId
            ? {
                ...branch,
                ...patch,
                targetNodeId: patch.action && patch.action !== "node" ? "" : patch.targetNodeId ?? branch.targetNodeId
              }
            : branch
        )
      );
    },
    [conditionBranches, setConditionBranches]
  );

  const removeConditionBranch = useCallback(
    (branchId: string) => {
      setConditionBranches(conditionBranches.filter((branch) => branch.id !== branchId));
    },
    [conditionBranches, setConditionBranches]
  );

  const applyConditionBranchConnection = useCallback(
    (branch: ConditionBranch) => {
      if (!activeConditionNode || branch.action !== "node" || !branch.targetNodeId) return;
      connectNodes(activeConditionNode.id, branch.targetNodeId, {
        label: branch.label,
        condition: branch.expression,
        animated: true
      });
    },
    [activeConditionNode, connectNodes]
  );

  const describeExecuteError = (message: string) => {
    if (message.includes(":401")) return "세션이 만료되었거나 인증이 필요합니다. 내 공간 > 세션에서 다시 발급해 주세요.";
    if (message.includes(":403")) return "실행 권한 또는 provider API 키가 필요합니다. 내 공간 > API 키 관리를 확인해 주세요.";
    if (message.includes("runtime_provider_not_supported")) return "선택한 provider는 아직 live 실행 엔진에 연결되지 않았습니다. Mock 실행을 사용하거나 OpenAI 노드로 바꿔 주세요.";
    if (message.includes("mock_provider_requires_mock_runtime")) return "Mock provider 노드는 Mock 실행 모드에서만 실행할 수 있습니다.";
    if (message.includes(":422")) return "미션 목표와 예산 값을 확인해 주세요.";
    return "미션 실행에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  };

  const handleSaveDraft = () => {
    if (typeof window === "undefined") return;
    const savedAt = new Date().toISOString();
    const draft: StudioDraft = {
      version: 1,
      savedAt,
      missionGoal,
      missionBudget,
      useMockRuntime,
      viewMode: "execution",
      nodes,
      edges,
      nodeExecutionStates,
      loopRegions,
      workflowGraph: buildWorkflowGraphPayload(nodes, edges, loopRegions)
    };
    try {
      window.localStorage.setItem(STUDIO_DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setDraftSavedAt(savedAt);
      setDraftNotice(`Draft 저장됨 · ${formatDraftTime(savedAt)}`);
    } catch {
      setDraftNotice("브라우저 저장소를 사용할 수 없어 draft를 저장하지 못했습니다.");
    }
  };

  const handleRestoreDraft = () => {
    const draft = readStudioDraft();
    if (!draft) {
      setDraftSavedAt(null);
      setDraftNotice("복구할 draft가 없습니다.");
      return;
    }
    replaceCanvas({
      nodes: draft.nodes,
      edges: draft.edges,
      nodeExecutionStates: draft.nodeExecutionStates,
      loopRegions: draft.loopRegions || []
    });
    setMissionGoal(draft.missionGoal);
    setMissionBudget(draft.missionBudget);
    setUseMockRuntime(draft.useMockRuntime);
    setDraftSavedAt(draft.savedAt);
    setDraftNotice(`Draft 복구됨 · ${formatDraftTime(draft.savedAt)}`);
  };

  const handleDiscardDraft = () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STUDIO_DRAFT_STORAGE_KEY);
      } catch {
        setDraftNotice("브라우저 저장소를 사용할 수 없어 draft를 삭제하지 못했습니다.");
        return;
      }
    }
    setDraftSavedAt(null);
    setDraftNotice("저장된 draft를 삭제했습니다.");
  };

  const handleClearCanvas = () => {
    clearCanvas();
    setDraftNotice(draftSavedAt ? "워크플로우를 비웠습니다. 저장된 draft는 유지됩니다." : "");
  };

  const handleExecute = async () => {
    if (nodes.length === 0) {
      setExecuteError("먼저 에이전트를 워크플로우에 추가해주세요.");
      return;
    }
    const goal = missionGoal.trim();
    const budget = Number(missionBudget);
    if (!goal) {
      setExecuteError("미션 목표를 입력해 주세요.");
      return;
    }
    if (!Number.isFinite(budget) || budget <= 0) {
      setExecuteError("예산은 0보다 큰 숫자로 입력해 주세요.");
      return;
    }
    if (isExecuting) return;
    setIsExecuting(true);
    setExecuteError("");
    resetMissionRunState("planning", "studio.execute.start");
    nodes.forEach((node, idx) => setNodeExecutionState(node.id, idx === 0 ? "running" : "idle"));
    if (isDemoMode) {
      setMissionRunState("running", "studio.execute.demo");
      const fakeMissionId = `demo-${Date.now()}`;
      router.push(`/chat/${fakeMissionId}`);
      setIsExecuting(false);
      return;
    }

    try {
      setMissionRunState("running", "studio.execute.api");
      const data = await createMission({
        goal,
        budget,
        workflowLabel: goal,
        workflowGraph: buildWorkflowGraphPayload(nodes, edges, loopRegions),
        autoMode: true,
        useMock: useMockRuntime
      });
      router.push(`/chat/${data.mission_id}`);
    } catch (error) {
      setMissionRunState("failed", "studio.execute.error");
      const message = error instanceof Error ? error.message : "";
      setExecuteError(describeExecuteError(message));
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="studio-grid-bg flex min-h-[720px] min-w-0 flex-1 flex-col lg:min-h-0">
      <div className="relative z-20 flex min-h-16 flex-col gap-3 border-b border-white/10 bg-[#080a0f]/[0.9] px-4 py-3 shadow-lg shadow-black/20 backdrop-blur lg:px-6 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link
            href="/studio?panel=agents"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-gray-400 shadow-sm shadow-black/20 transition-colors hover:border-blue-300/30 hover:bg-blue-500/10 hover:text-blue-100"
            aria-label="에이전트 설정"
            title="에이전트 설정"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <input
            type="text"
            value={missionGoal}
            onChange={(event) => setMissionGoal(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 py-1.5 font-black text-white outline-none transition-colors placeholder:text-gray-600 focus:border-blue-400/[0.35] focus:bg-white/[0.035] sm:w-80"
          />
        </div>
        <div className="flex w-full flex-col gap-2 2xl:w-auto 2xl:flex-row 2xl:items-center 2xl:justify-end">
          <div className="flex min-h-10 min-w-0 flex-wrap items-center gap-1.5 rounded-2xl border border-white/10 bg-black/20 px-2 py-1.5 shadow-sm shadow-black/20">
            {isDemoMode && (
              <span className="rounded-lg border border-cyan-400/20 bg-cyan-500/[0.12] px-2 py-1 text-xs font-semibold text-cyan-100">
                DEMO MODE
              </span>
            )}
            <span
              className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                runReadiness.tone === "ready"
                  ? "border-emerald-400/25 bg-emerald-500/[0.12] text-emerald-100"
                  : "border-amber-400/25 bg-amber-500/[0.12] text-amber-100"
              }`}
              title={runReadiness.label}
              aria-label={runReadiness.label}
            >
              {runReadiness.label}
            </span>
            <span className="rounded-lg border border-blue-300/20 bg-blue-500/[0.12] px-2 py-1 text-xs font-semibold text-blue-100">
              nodes {nodes.length}
            </span>
            <span className="rounded-lg border border-cyan-300/20 bg-cyan-500/[0.1] px-2 py-1 text-xs font-semibold text-cyan-100">
              links {edges.length}
            </span>
            <span className="rounded-lg border border-violet-300/20 bg-violet-500/[0.1] px-2 py-1 text-xs font-semibold text-violet-100">
              loops {loopRegions.length}
            </span>
            <span className="rounded-lg border border-amber-300/20 bg-amber-500/[0.1] px-2 py-1 text-xs font-semibold text-amber-100">
              승인 {approvalGateCount}
            </span>
            <span className="rounded-lg border border-white/10 bg-white/[0.055] px-2 py-1 text-xs font-semibold text-gray-300">
              조건 {conditionRuleCount}
            </span>
          </div>
          <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap 2xl:w-auto 2xl:justify-end">
            <label className="flex min-h-10 w-full items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-gray-300 shadow-sm shadow-black/20 sm:w-auto">
              $
              <input
                value={missionBudget}
                onChange={(event) => setMissionBudget(event.target.value)}
                className="w-12 bg-transparent text-right outline-none"
                inputMode="decimal"
                aria-label="미션 예산"
              />
            </label>
            <label className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-gray-300 shadow-sm shadow-black/20 sm:w-auto">
              <input
                type="checkbox"
                checked={useMockRuntime}
                onChange={(event) => setUseMockRuntime(event.target.checked)}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              Mock
            </label>
            <button
              type="button"
              onClick={() => setShowAddPanel((value) => !value)}
              className="flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-blue-400/30 bg-blue-500/[0.12] px-3 py-2 text-sm font-semibold text-blue-100 shadow-sm shadow-blue-500/10 transition-colors hover:bg-blue-500/[0.18] sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              <span>노드 추가</span>
            </button>
            <button
              type="button"
              onClick={openFlowModal}
              className="flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-cyan-400/35 bg-cyan-500/[0.14] px-3 py-2 text-sm font-semibold text-cyan-50 shadow-sm shadow-cyan-500/10 transition-colors hover:bg-cyan-500/[0.2] sm:w-auto"
            >
              <Maximize2 className="h-4 w-4" />
              <span>자세히 설정</span>
            </button>
            <button
              onClick={handleClearCanvas}
              className="flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-white/10 sm:w-auto"
            >
              <RotateCcw className="h-4 w-4" />
              <span>초기화</span>
            </button>
            <button
              onClick={handleSaveDraft}
              className="flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.065] px-3 py-2 text-sm font-semibold text-gray-100 transition-colors hover:bg-white/10 sm:w-auto"
            >
              <Save className="h-4 w-4" />
              <span>저장</span>
            </button>
            <button
              onClick={handleExecute}
              disabled={isExecuting || runReadiness.tone !== "ready"}
              className="col-span-2 flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-2 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-500 hover:to-cyan-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 sm:col-auto sm:w-auto sm:px-5"
              title={runReadiness.tone === "ready" ? "런타임 실행" : runReadiness.label}
            >
              {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              <span>{isExecuting ? "실행 중" : "런타임 실행"}</span>
            </button>
          </div>
        </div>
      </div>
      {missionRunTransitionWarning && (
        <div className="mx-6 mt-3 flex items-center justify-between rounded-lg border border-rose-500/40 bg-rose-900/20 px-3 py-2 text-xs text-rose-200">
          <span>{missionRunTransitionWarning}</span>
          <button
            onClick={clearMissionRunTransitionWarning}
            className="inline-flex min-h-9 items-center justify-center rounded border border-rose-400/40 px-2.5 py-1 text-[11px] hover:bg-rose-900/30"
          >
            닫기
          </button>
        </div>
      )}
      {executeError ? (
        <div className="mx-6 mt-3 rounded-lg border border-yellow-500/40 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-100">
          {executeError}
        </div>
      ) : null}
      {(draftSavedAt || draftNotice) && (
        <div className="mx-6 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-100">
          <span>
            {draftNotice ||
              (draftSavedAt ? `저장된 draft · ${formatDraftTime(draftSavedAt)}` : "저장된 draft가 없습니다.")}
          </span>
          {draftSavedAt && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleRestoreDraft}
                className="inline-flex min-h-9 items-center justify-center rounded border border-cyan-400/40 px-2.5 py-1 text-[11px] hover:bg-cyan-900/30"
              >
                복구
              </button>
              <button
                onClick={handleDiscardDraft}
                className="inline-flex min-h-9 items-center justify-center rounded border border-cyan-400/20 px-2.5 py-1 text-[11px] text-cyan-200/80 hover:bg-cyan-900/20"
              >
                삭제
              </button>
            </div>
          )}
        </div>
      )}

      <div className="relative flex-1">
        <div className="flex h-full flex-col overflow-y-auto bg-transparent">
            <div className="flex min-h-[430px] flex-1 p-3">
              <div className="panel-shell flex min-h-0 flex-1 flex-col rounded-2xl p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-lg font-bold text-white">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10">
                        <GitBranch className="h-4 w-4 text-blue-200" />
                      </span>
                      워크플로우 구성
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      실행 순서, 연결, 반복 영역을 카드로 정리합니다.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <span className="stat-chip px-2 py-1 text-gray-300">
                      nodes {nodes.length}
                    </span>
                    <span className="stat-chip px-2 py-1 text-gray-300">
                      edges {edges.length}
                    </span>
                    <span className="rounded-lg border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-violet-100">
                      loops {loopRegions.length}
                    </span>
                  </div>
                </div>

                {showAddPanel && (
                  <div className="mb-4 rounded-2xl border border-white/10 bg-black/[0.24] p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-white">노드 추가</div>
                        <div className="mt-0.5 text-[10px] text-gray-500">{addContextLabel}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAddPanel(false)}
                        className="rounded-lg p-1 text-gray-500 hover:bg-white/10 hover:text-white"
                        aria-label="노드 추가 닫기"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid gap-3 xl:grid-cols-3">
                      <div>
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">에이전트 풀</div>
                        <div className="space-y-1.5">
                          {hiredAgents.slice(0, 4).map((agent) => (
                            <button
                              key={agent.id}
                              type="button"
                              onClick={() => appendAgentToFlow(agent)}
                              className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-2 py-2 text-left hover:border-blue-400/40 hover:bg-blue-500/10"
                            >
                              <span className="text-base">{agent.creator_avatar}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-semibold text-gray-200">{agent.name}</span>
                                <span className="block truncate text-[10px] text-gray-500">{agent.category}</span>
                              </span>
                              <Plus className="h-3.5 w-3.5 text-blue-300" />
                            </button>
                          ))}
                          {hiredAgents.length === 0 && (
                            <div className="rounded-lg bg-white/5 px-2 py-2 text-xs text-gray-500">에이전트 풀이 비어 있습니다.</div>
                          )}
                        </div>
                      </div>
                      {libraryOnlyAgents.length > 0 && (
                        <div>
                          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">내 라이브러리</div>
                          <div className="space-y-1.5">
                            {libraryOnlyAgents.slice(0, 4).map((agent) => (
                              <button
                                key={agent.id}
                                type="button"
                                onClick={() => appendAgentToFlow(agent)}
                                className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-2 py-2 text-left hover:border-cyan-400/40 hover:bg-cyan-500/10"
                              >
                                <span className="text-base">{agent.creator_avatar}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-semibold text-gray-200">{agent.name}</span>
                                  <span className="block truncate text-[10px] text-gray-500">{agent.category}</span>
                                </span>
                                <Plus className="h-3.5 w-3.5 text-cyan-300" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">플로우 유틸리티</div>
                        <div className="grid grid-cols-1 gap-1.5">
                          {CANVAS_UTILITY_NODES.map((utility) => (
                            <button
                              key={utility.kind}
                              type="button"
                              onClick={() => appendUtilityToFlow(utility)}
                              className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-2 py-2 text-left text-xs text-gray-200 hover:border-amber-400/40 hover:bg-amber-500/10"
                            >
                              <span>{utility.label}</span>
                              <GitBranch className="h-3.5 w-3.5 text-amber-300" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid flex-1 gap-3 2xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="surface-card min-w-0 rounded-2xl p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="text-sm font-bold text-white">실행 순서</div>
                      <span className="text-[11px] text-gray-500">{orderedFlowNodes.length} steps</span>
                    </div>
                    <div className="space-y-2">
                      {orderedFlowNodes.map((node, index) => {
                        const state = nodeExecutionStates[node.id] || "idle";
                        return (
                          <button
                            key={node.id}
                            type="button"
                            onClick={() => setSelectedNodeId(node.id)}
                            className={`flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                              selectedNodeId === node.id
                                ? "border-blue-400/60 bg-blue-500/10"
                                : "border-white/5 bg-white/[0.045] hover:border-white/15 hover:bg-white/[0.065]"
                            }`}
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-gray-100">{getNodeLabel(node)}</span>
                              <span className="block truncate text-[11px] text-gray-500">{getNodeCategory(node)}</span>
                            </span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${NODE_STATE_BADGE[state] || NODE_STATE_BADGE.idle}`}>
                              {state}
                            </span>
                          </button>
                        );
                      })}
                      {orderedFlowNodes.length === 0 && (
                        <div className="rounded-xl border border-dashed border-white/10 px-3 py-10 text-center text-sm text-gray-500">
                          노드를 추가하면 실행 순서가 표시됩니다.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="surface-card rounded-2xl p-3">
                      <div className="mb-2 text-sm font-bold text-white">구성 요약</div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-lg border border-white/5 bg-black/25 px-2 py-2 text-gray-300">
                          <div className="text-gray-500">Router</div>
                          <div className="mt-0.5 font-semibold text-amber-200">
                            {nodes.filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "router").length}
                          </div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/25 px-2 py-2 text-gray-300">
                          <div className="text-gray-500">Approval</div>
                          <div className="mt-0.5 font-semibold text-yellow-200">
                            {nodes.filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "hitl").length}
                          </div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/25 px-2 py-2 text-gray-300">
                          <div className="text-gray-500">반복 영역</div>
                          <div className="mt-0.5 font-semibold text-violet-100">{loopRegions.length}</div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/25 px-2 py-2 text-gray-300">
                          <div className="text-gray-500">연결</div>
                          <div className="mt-0.5 font-semibold text-cyan-100">{edges.length}</div>
                        </div>
                      </div>
                    </div>

                    <div className="surface-card rounded-2xl p-3">
                      <div className="mb-2 text-sm font-bold text-white">반복 영역</div>
                      <div className="space-y-1.5 text-[11px]">
                        {loopRegions.slice(0, 4).map((region) => (
                          <button
                            key={region.id}
                            type="button"
                            onClick={() => selectLoopRegionForEdit(region.id)}
                            className="flex w-full items-center justify-between gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-2 text-left text-violet-100 hover:border-violet-300/40"
                          >
                            <span className="min-w-0 truncate">{region.name}</span>
                            <span className="shrink-0 text-[10px] text-violet-200/70">
                              {region.nodeIds.length} nodes · {region.repeatCount}x
                            </span>
                          </button>
                        ))}
                        {loopRegions.length === 0 && (
                          <div className="rounded-lg border border-dashed border-white/10 px-2 py-4 text-center text-gray-500">
                            아직 반복 영역이 없습니다.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#090b10]/95 pt-4 backdrop-blur">
                  <div className="text-xs text-gray-500">연결, 반복, 조건은 자세히 설정에서 카드로 관리합니다.</div>
                  <button
                    type="button"
                    onClick={openFlowModal}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-colors hover:from-blue-500 hover:to-cyan-400"
                  >
                    <Maximize2 className="h-4 w-4" />
                    상세 설정 열기
                  </button>
                </div>
              </div>
            </div>

            <div className="grid h-auto min-h-44 grid-cols-1 gap-3 border-t border-white/10 bg-black/20 p-3 md:grid-cols-3">
              <div className="panel-shell min-w-0 rounded-xl p-3">
                <div className="mb-2 text-xs font-semibold text-cyan-300">연결 목록</div>
                <div className="max-h-32 space-y-1 overflow-y-auto text-[11px]">
                  {edges.map((edge) => (
                    <div key={edge.id} className="log-row flex items-center gap-2 px-2 py-1 text-gray-300">
                      <span className="truncate">{getNodeLabel(nodes.find((node) => node.id === edge.source) || ({ id: edge.source, data: {} } as Node))}</span>
                      <span className="text-gray-600">→</span>
                      <span className="truncate">{getNodeLabel(nodes.find((node) => node.id === edge.target) || ({ id: edge.target, data: {} } as Node))}</span>
                    </div>
                  ))}
                  {edges.length === 0 && <div className="text-gray-500">연결이 없습니다.</div>}
                </div>
              </div>

              <div className="panel-shell min-w-0 rounded-xl p-3">
                <div className="mb-2 text-xs font-semibold text-purple-300">노드 타입</div>
                <div className="space-y-1.5 text-[11px] text-gray-300">
                  {Array.from(new Set(nodes.map((node) => getNodeCategory(node)))).map((category) => (
                    <div key={category} className="log-row flex items-center justify-between px-2 py-1">
                      <span className="truncate">{category}</span>
                      <span className="font-semibold text-gray-100">
                        {nodes.filter((node) => getNodeCategory(node) === category).length}
                      </span>
                    </div>
                  ))}
                  {nodes.length === 0 && <div className="text-gray-500">노드가 없습니다.</div>}
                </div>
              </div>

              <div className="panel-shell min-w-0 rounded-xl p-3">
                <div className="mb-2 text-xs font-semibold text-violet-300">반복/게이트</div>
                <div className="space-y-1.5 text-[11px] text-gray-300">
                  <div className="log-row flex items-center justify-between px-2 py-1">
                    <span>반복 영역</span>
                    <span className="font-semibold text-violet-100">{loopRegions.length}</span>
                  </div>
                  <div className="log-row flex items-center justify-between px-2 py-1">
                    <span>승인 게이트</span>
                    <span className="font-semibold text-yellow-100">
                      {nodes.filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "hitl").length}
                    </span>
                  </div>
                  <div className="log-row flex items-center justify-between px-2 py-1">
                    <span>조건 라우터</span>
                    <span className="font-semibold text-amber-100">
                      {nodes.filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "router").length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
        </div>
      </div>
      {showFlowModal && (
        <div className="fixed inset-0 z-50 flex bg-black/80 p-3 text-white backdrop-blur md:p-6">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#080808] shadow-2xl shadow-black">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Maximize2 className="h-4 w-4 text-blue-300" />
                  <h2 className="truncate text-lg font-bold">플로우 자세히 설정</h2>
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {addContextLabel} · 그래프 캔버스 대신 실행 단계, 연결, 조건, 반복을 카드로 관리합니다.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFlowModalTab("steps");
                    setLoopBandMode((value) => {
                      const next = !value;
                      if (!next) setBandSelectedNodeIds([]);
                      return next;
                    });
                  }}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold ${
                    loopBandMode
                      ? "border-violet-400/50 bg-violet-500/20 text-violet-100"
                      : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  반복 선택
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10 hover:text-white"
                >
                  <Save className="h-3.5 w-3.5" />
                  저장
                </button>
                <button
                  type="button"
                  onClick={closeFlowModal}
                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-gray-300 hover:bg-white/10 hover:text-white"
                  aria-label="플로우 자세히 설정 닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#090d12] p-4">
              <div className="mx-auto w-full max-w-6xl space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-1.5">
                  <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
                    {FLOW_MODAL_TABS.map((tab) => {
                      const active = flowModalTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setFlowModalTab(tab.id)}
                          className={`min-h-12 rounded-xl px-3 py-2 text-left transition-colors ${
                            active
                              ? "border border-blue-400/45 bg-blue-500/20 text-white shadow-sm shadow-blue-500/10"
                              : "border border-transparent text-gray-500 hover:bg-white/[0.055] hover:text-gray-200"
                          }`}
                        >
                          <span className="block text-sm font-bold">{tab.label}</span>
                          <span className="mt-0.5 block truncate text-[10px] opacity-70">{tab.detail}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className={`${flowModalTab === "steps" ? "block" : "hidden"} rounded-2xl border border-white/10 bg-white/[0.035] p-4`}>
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-base font-bold text-white">
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10">
                            <ListOrdered className="h-4 w-4 text-blue-200" />
                          </span>
                          실행 단계
                        </div>
                        <div className="mt-1 text-xs leading-relaxed text-gray-500">
                          빈 그래프 대신 각 Unit 실행 단계를 카드로 보고, 선택해서 설정합니다.
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className="stat-chip px-2 py-1 text-gray-300">nodes {nodes.length}</span>
                        <span className="stat-chip px-2 py-1 text-gray-300">edges {edges.length}</span>
                        <span className="rounded-lg border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-violet-100">
                          loops {loopRegions.length}
                        </span>
                      </div>
                    </div>

                    {loopBandMode ? (
                      <div className="mb-4 rounded-2xl border border-violet-500/30 bg-violet-500/[0.08] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-violet-100">반복 영역 선택 중</div>
                            <div className="mt-0.5 text-[11px] text-violet-100/65">
                              반복할 단계 카드를 2개 이상 선택한 뒤 영역을 만드세요.
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-lg border border-violet-400/20 bg-black/25 px-2 py-1 text-[11px] font-semibold text-violet-100">
                              {bandSelectedNodes.length}개 선택
                            </span>
                            <button
                              type="button"
                              onClick={createLoopRegionFromBand}
                              disabled={bandSelectedNodes.length < 2}
                              className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              반복 영역 만들기
                            </button>
                            <button
                              type="button"
                              onClick={() => setBandSelectedNodeIds([])}
                              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-white/10"
                            >
                              선택 해제
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-3 xl:grid-cols-2">
                      {orderedFlowNodes.map((node, index) => {
                        const state = nodeExecutionStates[node.id] || "idle";
                        const data = (node.data as any) || {};
                        const selected = selectedNodeId === node.id;
                        const selectedForLoop = bandSelectedNodeIdSet.has(node.id);
                        const outgoingEdges = edges.filter((edge) => edge.source === node.id);
                        const nodeLoopRegion = loopRegions.find((region) => region.nodeIds.includes(node.id));
                        const branchCount = normalizeConditionBranches(data.condition_branches).length;
                        const isApprovalNode = String(data.agent_id || "").toLowerCase() === "hitl";
                        const executionLabel = data.execution_mode === "confirm" || isApprovalNode ? "승인 후 실행" : "자동 실행";
                        const conditionLabel = flowConditionBadgeLabel(data);
                        return (
                          <button
                            key={node.id}
                            type="button"
                            onClick={() => {
                              if (loopBandMode) {
                                toggleLoopBandNode(node.id);
                                return;
                              }
                              setSelectedNodeId(node.id);
                              setFlowModalTab("settings");
                            }}
                            className={`min-w-0 rounded-2xl border p-3 text-left transition-colors ${
                              selected
                                ? "border-blue-400/70 bg-blue-500/[0.14] shadow-sm shadow-blue-500/10"
                                : selectedForLoop
                                  ? "border-violet-400/70 bg-violet-500/[0.16]"
                                  : "border-white/10 bg-black/25 hover:border-white/20 hover:bg-white/[0.045]"
                            }`}
                          >
                            <div className="mb-3 flex items-start gap-3">
                              <span
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-white ${
                                  selectedForLoop ? "bg-violet-600" : "bg-blue-600"
                                }`}
                              >
                                {selectedForLoop ? "✓" : index + 1}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="shrink-0 text-lg">{String(data.avatar || data.creator_avatar || "🧩")}</span>
                                  <span className="truncate text-sm font-black text-white">{getNodeLabel(node)}</span>
                                </span>
                                <span className="mt-0.5 block truncate text-[11px] text-gray-500">{getNodeCategory(node)}</span>
                              </span>
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${NODE_STATE_BADGE[state] || NODE_STATE_BADGE.idle}`}>
                                {state}
                              </span>
                            </div>

                            <div className="mb-3 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                              <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-100">
                                {executionLabel}
                              </span>
                              <span className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-100">
                                {conditionLabel}
                              </span>
                              {isApprovalNode ? (
                                <span className="rounded-lg border border-yellow-500/25 bg-yellow-500/10 px-2 py-1 text-yellow-100">
                                  관리자 승인
                                </span>
                              ) : null}
                              {branchCount > 0 ? (
                                <span className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-cyan-100">
                                  분기 {branchCount}
                                </span>
                              ) : null}
                              {nodeLoopRegion ? (
                                <span className="rounded-lg border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-violet-100">
                                  {nodeLoopRegion.name}
                                </span>
                              ) : null}
                            </div>

                            <div className="space-y-1.5 border-t border-white/10 pt-2 text-[11px]">
                              {outgoingEdges.length > 0 ? (
                                outgoingEdges.map((edge) => {
                                  const targetNode = nodes.find((item) => item.id === edge.target);
                                  const edgeLabel = String((edge as any).label || (edge.data as any)?.condition || "다음 단계");
                                  return (
                                    <div key={edge.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5 text-gray-300">
                                      <Link2 className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                                      <span className="truncate">{targetNode ? getNodeLabel(targetNode) : edge.target}</span>
                                      <span className="shrink-0 rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[10px] text-gray-500">
                                        {edgeLabel}
                                      </span>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="rounded-lg border border-dashed border-white/10 px-2 py-2 text-gray-600">
                                  다음 연결이 없습니다.
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      {orderedFlowNodes.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-gray-500 xl:col-span-2">
                          노드를 추가하면 실행 단계 카드가 표시됩니다.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={`${flowModalTab === "routes" ? "grid" : "hidden"} gap-4 xl:grid-cols-3`}>
                    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.055] p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-cyan-200" />
                          <div>
                            <div className="text-sm font-bold text-white">연결 목록</div>
                            <div className="text-[11px] text-cyan-100/60">단계 사이 이동 경로입니다.</div>
                          </div>
                        </div>
                        <span className="rounded-lg border border-cyan-400/20 bg-black/25 px-2 py-1 text-[10px] text-cyan-100">
                          {edges.length}
                        </span>
                      </div>
                      <div className="space-y-2 text-xs">
                        {edges.map((edge) => {
                          const sourceNode = nodes.find((node) => node.id === edge.source);
                          const targetNode = nodes.find((node) => node.id === edge.target);
                          const edgeLabel = String((edge as any).label || (edge.data as any)?.condition || "direct");
                          return (
                            <div key={edge.id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                              <div className="flex min-w-0 items-center gap-2 text-gray-200">
                                <span className="truncate">{sourceNode ? getNodeLabel(sourceNode) : edge.source}</span>
                                <span className="text-cyan-300">→</span>
                                <span className="truncate">{targetNode ? getNodeLabel(targetNode) : edge.target}</span>
                              </div>
                              <div className="mt-1 truncate text-[11px] text-gray-500">{edgeLabel}</div>
                            </div>
                          );
                        })}
                        {edges.length === 0 && (
                          <div className="rounded-xl border border-dashed border-cyan-400/20 px-3 py-6 text-center text-cyan-100/50">
                            아직 연결이 없습니다.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.055] p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-cyan-200" />
                          <div>
                            <div className="text-sm font-bold text-white">선택 노드 연결</div>
                            <div className="text-[11px] text-cyan-100/60">
                              선택한 단계에서 다음 단계로 링크를 추가합니다.
                            </div>
                          </div>
                        </div>
                        {selectedNode ? (
                          <span className="rounded-lg border border-cyan-400/20 bg-black/25 px-2 py-1 text-[10px] text-cyan-100">
                            step {selectedNodeData.step_index || stepIndexByNodeId.get(selectedNode.id) || "-"}
                          </span>
                        ) : null}
                      </div>
                      {selectedNode ? (
                        <div className="space-y-2">
                          <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-2 text-xs text-gray-200">
                            <div className="truncate font-semibold">{selectedNodeLabel}</div>
                            <div className="mt-0.5 truncate text-[11px] text-gray-500">{getNodeCategory(selectedNode)}</div>
                          </div>
                          <div className="flex gap-2">
                            <select
                              value={linkTargetId}
                              onChange={(event) => setLinkTargetId(event.target.value)}
                              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none"
                            >
                              {linkableTargetNodes.map((node) => (
                                <option key={node.id} value={node.id}>
                                  {stepIndexByNodeId.get(node.id) || "-"} · {getNodeLabel(node)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={connectSelectedToTarget}
                              disabled={!linkTargetId}
                              className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              연결
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-cyan-400/20 px-3 py-6 text-center text-xs text-cyan-100/50">
                          실행 단계 탭에서 연결 시작 노드를 먼저 선택하세요.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className={`${flowModalTab === "settings" || flowModalTab === "routes" || flowModalTab === "conditions" ? "block" : "hidden"} rounded-2xl border border-white/10 bg-white/[0.035] p-3`}>
                  <div className="grid gap-4 xl:grid-cols-2">
                <div className={`${flowModalTab === "settings" ? "block" : "hidden"} mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Settings className="h-4 w-4 text-blue-300" />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white">선택 노드 설정</div>
                        <div className="truncate text-[11px] text-gray-500">
                          {selectedNode ? selectedNodeLabel : "단계 카드에서 노드를 선택하세요"}
                        </div>
                      </div>
                    </div>
                    {selectedNode ? (
                      <span className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[10px] text-gray-400">
                        step {selectedNodeData.step_index || stepIndexByNodeId.get(selectedNode.id) || "-"}
                      </span>
                    ) : null}
                  </div>

                  {selectedNode ? (
                    <div className="space-y-3">
                      <label className="block text-[11px] font-semibold text-gray-400">
                        이름
                        <input
                          value={String(selectedNodeData.label || "")}
                          onChange={(event) => updateSelectedNodeData({ label: event.target.value })}
                          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-white outline-none focus:border-blue-500/50"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => updateSelectedNodeData({ execution_mode: "auto" })}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold ${
                            selectedNodeData.execution_mode === "auto"
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                              : "border-white/10 bg-black/30 text-gray-400 hover:text-white"
                          }`}
                        >
                          <Zap className="h-3.5 w-3.5" />
                          자동 실행
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedNodeData({ execution_mode: "confirm", approval_channels: selectedApprovalChannels.length > 0 ? selectedApprovalChannels : ["admin_queue"] })}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold ${
                            selectedNodeData.execution_mode === "confirm"
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                              : "border-white/10 bg-black/30 text-gray-400 hover:text-white"
                          }`}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          승인 후 실행
                        </button>
                      </div>

                      {selectedNodeData.execution_mode === "confirm" ? (
                        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-2.5">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                              <div className="text-xs font-semibold text-amber-100">승인 방식</div>
                              <div className="mt-0.5 text-[10px] text-amber-100/55">
                                선택한 채널은 Human Gate 대기 큐와 외부 알림에 같이 사용됩니다.
                              </div>
                            </div>
                            <Link
                              href="/mypage?tab=approval"
                              className="rounded-lg border border-amber-400/20 bg-black/25 px-2 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/10"
                            >
                              채널 설정
                            </Link>
                          </div>
                          <select
                            value={String(selectedNodeData.approval_gate_stage || "after_result")}
                            onChange={(event) => updateSelectedNodeData({ approval_gate_stage: event.target.value })}
                            className="mb-2 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none focus:border-amber-500/50"
                          >
                            <option value="after_result">결과 확인 후 다음 단계 진행</option>
                            <option value="before_run">이 노드 실행 전 승인</option>
                            <option value="both">실행 전 + 결과 확인 모두 승인</option>
                          </select>
                          <div className="grid grid-cols-2 gap-2">
                            {APPROVAL_CHANNEL_OPTIONS.map((channel) => {
                              const Icon = channel.icon;
                              const active = selectedApprovalChannels.includes(channel.id);
                              const channelState = approvalChannelStates[channel.id];
                              const channelSelectable =
                                active || channel.id === "admin_queue" || channelState.tone === "ready";
                              return (
                                <button
                                  key={channel.id}
                                  type="button"
                                  disabled={!channelSelectable}
                                  title={
                                    channelSelectable
                                      ? `${channel.label} 승인 채널`
                                      : `${channel.label} 채널은 내 공간에서 먼저 설정해야 합니다`
                                  }
                                  aria-label={`${channel.label} 승인 채널 ${active ? "선택됨" : channelSelectable ? "선택 가능" : "설정 필요"}`}
                                  onClick={() => toggleSelectedApprovalChannel(channel.id)}
                                  className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                                    active
                                      ? "border-amber-400/50 bg-amber-500/15 text-amber-50"
                                      : !channelSelectable
                                        ? "cursor-not-allowed border-white/5 bg-black/20 text-gray-600 opacity-70"
                                      : "border-white/10 bg-black/20 text-gray-500 hover:border-white/20 hover:text-gray-300"
                                  }`}
                                >
                                  <span className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold">
                                      <Icon className="h-3.5 w-3.5 shrink-0" />
                                      <span className="truncate">{channel.label}</span>
                                    </span>
                                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${approvalChannelStateClass(channelState.tone)}`}>
                                      {channelState.label}
                                    </span>
                                  </span>
                                  <span className="mt-1 block line-clamp-2 text-[10px] leading-relaxed opacity-70">
                                    {channel.description}
                                  </span>
                                  <span className="mt-1 block truncate text-[10px] text-gray-500">
                                    {channelState.transport} · {channelState.detail}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {selectedUnreadyApprovalChannels.length > 0 ? (
                            <div className="mt-2 rounded-lg border border-amber-400/25 bg-amber-500/10 px-2 py-2 text-[11px] leading-relaxed text-amber-100/85">
                              {selectedUnreadyApprovalChannels
                                .map((channel) => APPROVAL_CHANNEL_OPTIONS.find((option) => option.id === channel)?.label || channel)
                                .join(", ")}{" "}
                              채널은 아직 발송 설정이 부족합니다. 실행 시 큐에는 남지만 외부 전송은 대기/실패로 표시될 수 있습니다.
                            </div>
                          ) : null}
                          <input
                            value={String(selectedNodeData.approval_target || "")}
                            onChange={(event) => updateSelectedNodeData({ approval_target: event.target.value })}
                            placeholder="승인 담당/대상: admin@company.com, 운영 관리자, 카카오 채널명"
                            className="mt-2 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-amber-500/50"
                          />
                        </div>
                      ) : null}

                      <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-200">
                          <GitBranch className="h-3.5 w-3.5" />
                          조건
                        </div>
                        <select
                          value={selectedConditionMode}
                          onChange={(event) => updateSelectedConditionMode(event.target.value)}
                          className="mb-2 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none"
                        >
                          <option value="always">항상 실행</option>
                          <option value="time">시간 조건</option>
                          <option value="data">데이터 조건</option>
                          <option value="composite">시간 + 데이터 조건</option>
                          <option value="condition">직접 조건식</option>
                        </select>
                        {(selectedConditionMode === "time" || selectedConditionMode === "composite") ? (
                          <div className="mb-2 rounded-lg border border-blue-500/15 bg-blue-500/[0.06] p-2">
                            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-blue-200">
                              <Clock3 className="h-3.5 w-3.5" />
                              시간 조건
                            </div>
                            <input
                              value={String(selectedNodeData.condition_time_rule || "")}
                              onChange={(event) => updateSelectedNodeData({ condition_time_rule: event.target.value })}
                              placeholder="예: 평일 09:00-18:00, 매일 10:00 이후"
                              className="mb-2 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-blue-500/50"
                            />
                            <select
                              value={String(selectedNodeData.condition_timezone || "Asia/Seoul")}
                              onChange={(event) => updateSelectedNodeData({ condition_timezone: event.target.value })}
                              className="w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none focus:border-blue-500/50"
                            >
                              <option value="Asia/Seoul">Asia/Seoul</option>
                              <option value="UTC">UTC</option>
                              <option value="America/Los_Angeles">America/Los_Angeles</option>
                            </select>
                          </div>
                        ) : null}
                        {(selectedConditionMode === "data" || selectedConditionMode === "composite") ? (
                          <div className="mb-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] p-2">
                            <div className="mb-1 text-[11px] font-semibold text-emerald-200">데이터 조건</div>
                            <div className="grid grid-cols-[1fr_76px] gap-2">
                              <input
                                value={String(selectedNodeData.condition_data_path || "")}
                                onChange={(event) => updateSelectedNodeData({ condition_data_path: event.target.value })}
                                placeholder="예: result.quality_score"
                                className="rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-emerald-500/50"
                              />
                              <select
                                value={String(selectedNodeData.condition_operator || ">=")}
                                onChange={(event) => updateSelectedNodeData({ condition_operator: event.target.value })}
                                className="rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none focus:border-emerald-500/50"
                              >
                                <option value=">=">&gt;=</option>
                                <option value=">">&gt;</option>
                                <option value="==">==</option>
                                <option value="!=">!=</option>
                                <option value="<">&lt;</option>
                                <option value="<=">&lt;=</option>
                                <option value="contains">contains</option>
                              </select>
                            </div>
                            <input
                              value={String(selectedNodeData.condition_value || "")}
                              onChange={(event) => updateSelectedNodeData({ condition_value: event.target.value })}
                              placeholder="예: 0.9 또는 approved"
                              className="mt-2 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-emerald-500/50"
                            />
                          </div>
                        ) : null}
                        {(selectedConditionMode === "condition" || selectedConditionMode === "composite") ? (
                          <input
                            value={String(selectedNodeData.condition_expression || "")}
                            onChange={(event) => updateSelectedNodeData({ condition_expression: event.target.value })}
                            placeholder="예: risk_score > 0.7 또는 previous.status == 'failed'"
                            className="w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-amber-500/50"
                          />
                        ) : null}
                        <div className="mt-2 rounded-lg border border-cyan-400/15 bg-cyan-500/[0.045] p-2">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-cyan-100">런타임 평가</span>
                            <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-cyan-200">
                              {selectedConditionDsl.engine}
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {selectedConditionDsl.checks.map((check, index) => (
                              <div
                                key={`${check.kind}-${index}`}
                                className="grid grid-cols-[82px_minmax(0,1fr)] gap-2 rounded-md bg-black/20 px-2 py-1.5 text-[11px]"
                              >
                                <span className="font-semibold text-cyan-200">{conditionCheckLabel(check)}</span>
                                <span className="min-w-0 truncate text-gray-300">{describeConditionCheck(check)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                            <div className="rounded-md bg-black/20 px-2 py-1.5 text-emerald-100">
                              true → {selectedConditionDsl.on_true === "approval_gate" ? "승인 게이트" : "실행"}
                            </div>
                            <div className="rounded-md bg-black/20 px-2 py-1.5 text-gray-400">
                              false → {selectedConditionDsl.on_false}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-2.5 py-2 text-[11px] leading-relaxed text-violet-100/80">
                        반복은 단계 카드에서 여러 노드를 선택한 뒤 반복 영역으로 설정합니다.
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setFlowModalTab("routes")}
                          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/15"
                        >
                          연결/반복 설정
                        </button>
                        <button
                          type="button"
                          onClick={() => setFlowModalTab("conditions")}
                          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/15"
                        >
                          조건/추가 설정
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-gray-500">
                      노드를 클릭하면 설정, 조건, 반복, 연결 작업이 표시됩니다.
                    </div>
                  )}
                </div>

                <div className={`${flowModalTab === "routes" ? "block" : "hidden"} mb-4 rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-3`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="h-4 w-4 text-violet-200" />
                      <div>
                        <div className="text-sm font-bold text-white">반복 영역</div>
                        <div className="text-[11px] text-violet-100/60">
                          반복 선택 모드에서 연결된 단계 카드를 선택하세요.
                        </div>
                      </div>
                    </div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        loopBandMode ? "bg-violet-500 text-white" : "bg-black/30 text-gray-400"
                      }`}
                    >
                      {loopBandMode ? "selecting" : "idle"}
                    </span>
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-black/25 px-2 py-2 text-gray-300">
                      <div className="text-gray-500">선택 노드</div>
                      <div className="mt-0.5 font-semibold text-violet-100">{bandSelectedNodes.length}개</div>
                    </div>
                    <div className="rounded-lg bg-black/25 px-2 py-2 text-gray-300">
                      <div className="text-gray-500">내부 링크</div>
                      <div className="mt-0.5 font-semibold text-violet-100">{bandSelectedEdges.length}개</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={createLoopRegionFromBand}
                    disabled={bandSelectedNodes.length < 2}
                    className="mb-3 w-full rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    선택 영역을 반복으로 만들기
                  </button>

                  {loopRegions.length > 0 ? (
                    <div className="space-y-3">
                      <label className="block text-[11px] font-semibold text-gray-400">
                        반복 영역 선택
                        <select
                          value={selectedLoopRegion?.id || ""}
                          onChange={(event) => setSelectedLoopRegionId(event.target.value || null)}
                          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none focus:border-violet-500/50"
                        >
                          {loopRegions.map((region) => (
                            <option key={region.id} value={region.id}>
                              {region.name} · {region.nodeIds.length} nodes
                            </option>
                          ))}
                        </select>
                      </label>

                      {selectedLoopRegion ? (
                        <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
                          <label className="block text-[11px] text-gray-500">
                            이름
                            <input
                              value={selectedLoopRegion.name}
                              onChange={(event) => updateSelectedLoopRegion({ name: event.target.value })}
                              className="mt-1 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none focus:border-violet-500/50"
                            />
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="text-[11px] text-gray-500">
                              반복 초기 노드
                              <div className="mt-1 rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200">
                                <div className="truncate">
                                  {selectedLoopStartNode
                                    ? `${stepIndexByNodeId.get(selectedLoopStartNode.id) || "-"} · ${getNodeLabel(selectedLoopStartNode)}`
                                    : "자동 설정됨"}
                                </div>
                                <div className="mt-1 text-[10px] text-violet-300">생성 시 고정</div>
                              </div>
                            </div>
                            <div className="text-[11px] text-gray-500">
                              반복 종료 노드
                              <div className="mt-1 rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200">
                                <div className="truncate">
                                  {selectedLoopEndNode
                                    ? `${stepIndexByNodeId.get(selectedLoopEndNode.id) || "-"} · ${getNodeLabel(selectedLoopEndNode)}`
                                    : "자동 설정됨"}
                                </div>
                                <div className="mt-1 text-[10px] text-violet-300">생성 시 고정</div>
                              </div>
                            </div>
                          </div>
                          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-2">
                            <div className="mb-2 text-[11px] font-semibold text-violet-100">종료 조건 평가 위치</div>
                            <div className="grid grid-cols-2 gap-2">
                              {[selectedLoopRegion.startNodeId, selectedLoopRegion.endNodeId].map((nodeId) => {
                                const node = nodes.find((item) => item.id === nodeId);
                                const active = selectedLoopConditionNodeId === nodeId;
                                return (
                                  <button
                                    key={nodeId}
                                    type="button"
                                    onClick={() => updateSelectedLoopRegion({ exitConditionNodeId: nodeId })}
                                    className={`rounded-lg border px-2 py-2 text-left text-xs font-semibold ${
                                      active
                                        ? "border-violet-400/60 bg-violet-500/20 text-violet-50"
                                        : "border-white/10 bg-black/20 text-gray-400 hover:text-white"
                                    }`}
                                  >
                                    <span className="block truncate">{node ? getNodeLabel(node) : nodeId}</span>
                                    <span className="mt-1 block text-[10px] opacity-70">
                                      {nodeId === selectedLoopRegion.startNodeId ? "초기에서 검사" : "종료에서 검사"}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <label className="block text-[11px] text-gray-500">
                            종료 후 노드
                            <select
                              value={selectedLoopRegion.exitNodeId || LOOP_EXIT_FINISH}
                              onChange={(event) => updateSelectedLoopRegion({ exitNodeId: event.target.value })}
                              className="mt-1 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none"
                            >
                              <option value={LOOP_EXIT_FINISH}>플로우 종료</option>
                              {outsideLoopNodes.map((node) => (
                                <option key={node.id} value={node.id}>
                                  {stepIndexByNodeId.get(node.id) || "-"} · {getNodeLabel(node)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                            <label className="text-[11px] text-gray-500">
                              최대 반복
                              <input
                                type="number"
                                min={1}
                                max={50}
                                value={selectedLoopRegion.repeatCount}
                                onChange={(event) =>
                                  updateSelectedLoopRegion({ repeatCount: Math.max(1, Number(event.target.value) || 1) })
                                }
                                className="mt-1 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none"
                              />
                            </label>
                            <label className="text-[11px] text-gray-500">
                              종료 조건
                              <input
                                value={selectedLoopRegion.exitCondition}
                                onChange={(event) => updateSelectedLoopRegion({ exitCondition: event.target.value })}
                                placeholder="예: result.done == true"
                                className="mt-1 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-violet-500/50"
                              />
                            </label>
                          </div>
                          <div className="rounded-lg bg-black/25 px-2 py-2 text-[11px] leading-relaxed text-gray-400">
                            선택한 평가 위치에서 종료 조건을 만족하면 종료 후 노드로 이동하고, 아니면 반복 초기 노드로 돌아갑니다.
                          </div>
                          <div className="rounded-lg border border-violet-400/20 bg-violet-500/[0.055] p-2 text-[11px]">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="font-semibold text-violet-100">반복 런타임</span>
                              <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-violet-200">
                                loop_region_v1
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 rounded-md bg-black/20 px-2 py-1.5">
                                <span className="text-violet-200">반복 대상</span>
                                <span className="truncate text-gray-300">
                                  {selectedLoopRegion.nodeIds.length} steps · {selectedLoopStartNode ? getNodeLabel(selectedLoopStartNode) : "start"} →{" "}
                                  {selectedLoopEndNode ? getNodeLabel(selectedLoopEndNode) : "end"}
                                </span>
                              </div>
                              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 rounded-md bg-black/20 px-2 py-1.5">
                                <span className="text-violet-200">종료 평가</span>
                                <span className="truncate text-gray-300">
                                  {selectedLoopConditionNode ? getNodeLabel(selectedLoopConditionNode) : "종료 노드"} ·{" "}
                                  {selectedLoopRegion.exitCondition || "조건 없음"}
                                </span>
                              </div>
                              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 rounded-md bg-black/20 px-2 py-1.5">
                                <span className="text-violet-200">true / false</span>
                                <span className="truncate text-gray-300">
                                  true →{" "}
                                  {selectedLoopRegion.exitNodeId === LOOP_EXIT_FINISH
                                    ? "플로우 종료"
                                    : selectedLoopExitNode
                                      ? getNodeLabel(selectedLoopExitNode)
                                      : "종료 후 노드 없음"}
                                  {" · false → 반복 초기로"}
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeLoopRegion(selectedLoopRegion.id)}
                            className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/15"
                          >
                            반복 영역 삭제
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-violet-400/20 px-3 py-4 text-center text-xs text-violet-100/50">
                      아직 반복 영역이 없습니다.
                    </div>
                  )}
                </div>

                <div className={`${flowModalTab === "conditions" ? "block" : "hidden"} mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-3`}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-amber-200" />
                      <div>
                        <div className="text-sm font-bold text-white">조건 영역</div>
                        <div className="text-[11px] text-amber-100/60">
                          조건 함수 결과에 따라 여러 경로로 분기합니다.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addConditionNode}
                      className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/15"
                    >
                      조건 노드 추가
                    </button>
                  </div>

                  {conditionNodes.length > 0 ? (
                    <div className="space-y-3">
                      <label className="block text-[11px] font-semibold text-gray-400">
                        조건 노드
                        <select
                          value={activeConditionNode?.id || ""}
                          onChange={(event) => {
                            setSelectedConditionNodeId(event.target.value);
                            setSelectedNodeId(event.target.value || null);
                          }}
                          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none focus:border-amber-500/50"
                        >
                          {conditionNodes.map((node) => (
                            <option key={node.id} value={node.id}>
                              {stepIndexByNodeId.get(node.id) || "-"} · {getNodeLabel(node)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setFlowModalTab("settings")}
                          disabled={!activeConditionNode}
                          className="mt-2 w-full rounded-lg border border-amber-400/25 bg-amber-500/10 px-2 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          선택 조건 노드 기본 설정 보기
                        </button>
                      </label>

                      {activeConditionNode ? (
                        <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
                          <label className="block text-[11px] text-gray-500">
                            조건 함수
                            <textarea
                              rows={3}
                              value={String(activeConditionData.condition_function || "")}
                              onChange={(event) => updateConditionNodeData({ condition_function: event.target.value })}
                              placeholder="예: return { route: quality >= 0.9 ? 'pass' : 'revise', notify: cost > budget }"
                              className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-[#101010] px-2 py-2 font-mono text-[11px] text-gray-200 outline-none placeholder:text-gray-700 focus:border-amber-500/50"
                            />
                          </label>

                          <div className="rounded-lg border border-amber-400/20 bg-amber-500/[0.055] p-2 text-[11px]">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="font-semibold text-amber-100">분기 런타임</span>
                              <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-amber-200">
                                {activeConditionDsl.engine}
                              </span>
                            </div>
                            <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 rounded-md bg-black/20 px-2 py-1.5">
                              <span className="font-semibold text-amber-200">선택 방식</span>
                              <span className="truncate text-gray-300">위에서부터 평가 · first match wins · else는 fallback</span>
                            </div>
                            {conditionBranches.length > 0 ? (
                              <div className="mt-1.5 space-y-1.5">
                                {conditionBranches.slice(0, 4).map((branch, index) => {
                                  const targetNode = conditionTargetNodes.find((node) => node.id === branch.targetNodeId);
                                  const actionLabel =
                                    branch.action === "node"
                                      ? targetNode
                                        ? getNodeLabel(targetNode)
                                        : "대상 노드 선택"
                                      : branch.action === "notify"
                                        ? branch.notifyMessage || "알림 발송"
                                        : "플로우 종료";
                                  return (
                                    <div
                                      key={`runtime-${branch.id}`}
                                      className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 rounded-md bg-black/20 px-2 py-1.5"
                                    >
                                      <span className="font-semibold text-amber-200">#{index + 1} {branch.action}</span>
                                      <span className="min-w-0 truncate text-gray-300">
                                        {branch.expression || "else"} → {actionLabel}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="mt-1.5 rounded-md bg-black/20 px-2 py-1.5 text-gray-500">
                                분기 경로를 추가하면 런타임 라우팅 계약이 생성됩니다.
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[11px] font-semibold text-amber-100">분기 경로</div>
                            <button
                              type="button"
                              onClick={addConditionBranch}
                              className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/15"
                            >
                              분기 추가
                            </button>
                          </div>

                          <div className="space-y-2">
                            {conditionBranches.map((branch, index) => (
                              <div key={branch.id} className="rounded-xl border border-white/10 bg-[#101010] p-2">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <div className="text-[11px] font-semibold text-gray-300">분기 {index + 1}</div>
                                  <button
                                    type="button"
                                    onClick={() => removeConditionBranch(branch.id)}
                                    className="rounded border border-red-500/25 px-1.5 py-0.5 text-[10px] text-red-200 hover:bg-red-500/10"
                                  >
                                    삭제
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <label className="text-[11px] text-gray-500">
                                    이름
                                    <input
                                      value={branch.label}
                                      onChange={(event) => updateConditionBranch(branch.id, { label: event.target.value })}
                                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none"
                                    />
                                  </label>
                                  <label className="text-[11px] text-gray-500">
                                    액션
                                    <select
                                      value={branch.action}
                                      onChange={(event) =>
                                        updateConditionBranch(branch.id, {
                                          action: event.target.value as ConditionBranch["action"]
                                        })
                                      }
                                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none"
                                    >
                                      <option value="node">다른 노드로 이동</option>
                                      <option value="end">플로우 종료</option>
                                      <option value="notify">알림</option>
                                    </select>
                                  </label>
                                </div>
                                <label className="mt-2 block text-[11px] text-gray-500">
                                  조건식
                                  <input
                                    value={branch.expression}
                                    onChange={(event) => updateConditionBranch(branch.id, { expression: event.target.value })}
                                    placeholder="예: route == 'pass' 또는 quality >= 0.9"
                                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 font-mono text-[11px] text-gray-200 outline-none placeholder:text-gray-700"
                                  />
                                </label>
                                {branch.action === "node" ? (
                                  <div className="mt-2 flex gap-2">
                                    <select
                                      value={branch.targetNodeId}
                                      onChange={(event) => updateConditionBranch(branch.id, { targetNodeId: event.target.value })}
                                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none"
                                    >
                                      <option value="">대상 노드 선택</option>
                                      {conditionTargetNodes.map((node) => (
                                        <option key={node.id} value={node.id}>
                                          {stepIndexByNodeId.get(node.id) || "-"} · {getNodeLabel(node)}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => applyConditionBranchConnection(branch)}
                                      disabled={!branch.targetNodeId}
                                      className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      연결
                                    </button>
                                  </div>
                                ) : branch.action === "notify" ? (
                                  <label className="mt-2 block text-[11px] text-gray-500">
                                    알림 메시지
                                    <input
                                      value={branch.notifyMessage}
                                      onChange={(event) => updateConditionBranch(branch.id, { notifyMessage: event.target.value })}
                                      placeholder="예: 품질 기준 미달, 리뷰 요청"
                                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700"
                                    />
                                  </label>
                                ) : (
                                  <div className="mt-2 rounded-lg bg-black/25 px-2 py-2 text-[11px] text-gray-400">
                                    조건이 맞으면 이 지점에서 플로우를 종료합니다.
                                  </div>
                                )}
                              </div>
                            ))}
                            {conditionBranches.length === 0 && (
                              <div className="rounded-xl border border-dashed border-amber-400/20 px-3 py-4 text-center text-xs text-amber-100/50">
                                아직 분기 경로가 없습니다.
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-amber-400/20 px-3 py-5 text-center text-xs text-amber-100/50">
                      조건 노드를 추가하면 분기 경로를 여러 갈래로 설정할 수 있습니다.
                    </div>
                  )}
                </div>

                <div className={`${flowModalTab === "conditions" ? "block" : "hidden"} border-t border-white/10 pt-4`}>
                  <div className="mb-2 text-sm font-bold">빠른 추가</div>
                  <div className="mb-3 text-[11px] text-gray-500">{addContextLabel}</div>
                  <div className="space-y-1.5">
                    {hiredAgents.slice(0, 4).map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => appendAgentToFlow(agent)}
                        className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-2 py-2 text-left hover:border-blue-400/40 hover:bg-blue-500/10"
                      >
                        <span className="text-base">{agent.creator_avatar}</span>
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-200">{agent.name}</span>
                        <Plus className="h-3.5 w-3.5 text-blue-300" />
                      </button>
                    ))}
                    {CANVAS_UTILITY_NODES.map((utility) => (
                      <button
                        key={utility.kind}
                        type="button"
                        onClick={() => appendUtilityToFlow(utility)}
                        className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/5 px-2 py-2 text-left text-xs text-gray-200 hover:border-amber-400/40 hover:bg-amber-500/10"
                      >
                        <span>{utility.label}</span>
                        <GitBranch className="h-3.5 w-3.5 text-amber-300" />
                      </button>
                    ))}
                  </div>
                </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

