import { type Edge, type Node, type XYPosition } from "reactflow";
import type { LoopRegion } from "../../stores/app.store";
import type { NodeExecutionState } from "../../types";
import { buildWorkflowGraphPayload } from "../../lib/workflow-graph";
import {
  LIVE_RUNTIME_PROVIDERS,
  LOOP_EXIT_FINISH,
  type ConditionBranch,
  type StudioDraft
} from "./studio-canvas-model";

export function resolveAutoAddPosition(
  selectedNode: Node | null,
  orderedFlowNodes: Node[]
): XYPosition {
  const source = selectedNode || orderedFlowNodes[orderedFlowNodes.length - 1] || null;
  if (!source) return { x: 80, y: 160 };
  return { x: source.position.x + 320, y: source.position.y };
}

export function buildStudioDraftPayload(params: {
  savedAt: string;
  missionGoal: string;
  missionBudget: string;
  useMockRuntime: boolean;
  nodes: Node[];
  edges: Edge[];
  nodeExecutionStates: Record<string, NodeExecutionState>;
  loopRegions: LoopRegion[];
}): StudioDraft {
  return {
    version: 1,
    savedAt: params.savedAt,
    missionGoal: params.missionGoal,
    missionBudget: params.missionBudget,
    useMockRuntime: params.useMockRuntime,
    viewMode: "execution",
    nodes: params.nodes,
    edges: params.edges,
    nodeExecutionStates: params.nodeExecutionStates,
    loopRegions: params.loopRegions,
    workflowGraph: buildWorkflowGraphPayload(params.nodes, params.edges, params.loopRegions)
  };
}

export function buildLoopRegionFromBand(params: {
  bandSelectedNodeIds: string[];
  nodes: Node[];
  edges: Edge[];
  orderedFlowNodes: Node[];
  existingRegionCount: number;
}): { region: Omit<LoopRegion, "id" | "createdAt">; startNodeId: string } | null {
  const selectedIds = Array.from(new Set(params.bandSelectedNodeIds)).filter((nodeId) =>
    params.nodes.some((node) => node.id === nodeId)
  );
  if (selectedIds.length < 2) return null;

  const selectedSet = new Set(selectedIds);
  const orderedSelectedNodes = params.orderedFlowNodes.filter((node) => selectedSet.has(node.id));
  const selectedNodes =
    orderedSelectedNodes.length > 0
      ? orderedSelectedNodes
      : params.nodes.filter((node) => selectedSet.has(node.id));
  const internalEdges = params.edges.filter(
    (edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target)
  );
  const incomingIds = new Set(internalEdges.map((edge) => edge.target));
  const outgoingIds = new Set(internalEdges.map((edge) => edge.source));
  const startNode = selectedNodes.find((node) => !incomingIds.has(node.id)) || selectedNodes[0];
  const endNode =
    [...selectedNodes].reverse().find((node) => !outgoingIds.has(node.id)) ||
    selectedNodes[selectedNodes.length - 1];
  const exitEdge =
    params.edges.find((edge) => edge.source === endNode.id && !selectedSet.has(edge.target)) ||
    params.edges.find((edge) => selectedSet.has(edge.source) && !selectedSet.has(edge.target));

  return {
    startNodeId: startNode.id,
    region: {
      name: `반복 영역 ${params.existingRegionCount + 1}`,
      nodeIds: selectedIds,
      startNodeId: startNode.id,
      endNodeId: endNode.id,
      exitNodeId: exitEdge?.target || LOOP_EXIT_FINISH,
      exitConditionNodeId: endNode.id,
      repeatCount: 3,
      exitCondition: "result.done == true"
    }
  };
}

export function createDefaultConditionBranch(params: {
  branchCount: number;
  nextTargetId: string;
}): ConditionBranch {
  return {
    id: `branch-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    label: `분기 ${params.branchCount + 1}`,
    expression: params.branchCount === 0 ? "result.ok == true" : "else",
    action: params.nextTargetId === LOOP_EXIT_FINISH ? "end" : "node",
    targetNodeId: params.nextTargetId === LOOP_EXIT_FINISH ? "" : params.nextTargetId,
    notifyMessage: ""
  };
}

export function getUnsupportedLiveProviders(nodes: Node[]): string[] {
  return Array.from(
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
  );
}

export function getRunReadiness(params: {
  nodeCount: number;
  missionGoal: string;
  budgetNumber: number;
  useMockRuntime: boolean;
  unsupportedLiveProviders: string[];
}): { label: string; tone: "ready" | "warn" } {
  if (params.nodeCount === 0) return { label: "노드 필요", tone: "warn" };
  if (!params.missionGoal.trim()) return { label: "목표 필요", tone: "warn" };
  if (!Number.isFinite(params.budgetNumber) || params.budgetNumber <= 0) {
    return { label: "예산 확인", tone: "warn" };
  }
  if (!params.useMockRuntime && params.unsupportedLiveProviders.length > 0) {
    return {
      label: `${params.unsupportedLiveProviders.join(", ")} 엔진 미지원`,
      tone: "warn"
    };
  }
  return { label: params.useMockRuntime ? "Mock 실행 준비" : "Live 실행 준비", tone: "ready" };
}
