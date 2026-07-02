import { useMemo } from "react";
import { type Edge, type Node } from "reactflow";
import type { LoopRegion } from "../../stores/app.store";
import type { Agent } from "../../types";
import { buildConditionDslContract } from "../../lib/workflow-graph";
import {
  getNodeLabel,
  isConditionNode,
  LOOP_EXIT_FINISH,
  normalizeConditionBranches,
  orderFlowNodes
} from "./studio-canvas-model";
import { getRunReadiness, getUnsupportedLiveProviders } from "./studio-state-builders";

type UseStudioCanvasDerivedStateArgs = {
  nodes: Node[];
  edges: Edge[];
  loopRegions: LoopRegion[];
  selectedLoopRegionId: string | null;
  selectedNodeId: string | null;
  selectedConditionNodeId: string;
  bandSelectedNodeIds: string[];
  hiredAgents: Agent[];
  libraryAgents: Agent[];
  missionGoal: string;
  missionBudget: string;
  useMockRuntime: boolean;
};

export function useStudioCanvasDerivedState({
  nodes,
  edges,
  loopRegions,
  selectedLoopRegionId,
  selectedNodeId,
  selectedConditionNodeId,
  bandSelectedNodeIds,
  hiredAgents,
  libraryAgents,
  missionGoal,
  missionBudget,
  useMockRuntime
}: UseStudioCanvasDerivedStateArgs) {
  const orderedFlowNodes = useMemo(() => orderFlowNodes(nodes, edges), [edges, nodes]);
  const stepIndexByNodeId = useMemo(
    () => new Map(orderedFlowNodes.map((node, index) => [node.id, index + 1])),
    [orderedFlowNodes]
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
  const linkableTargetNodes = useMemo(
    () => nodes.filter((node) => node.id !== selectedNodeId),
    [nodes, selectedNodeId]
  );
  const selectedLoopRegion = useMemo(
    () => loopRegions.find((region) => region.id === selectedLoopRegionId) || loopRegions[0] || null,
    [loopRegions, selectedLoopRegionId]
  );
  const bandSelectedNodes = useMemo(
    () =>
      bandSelectedNodeIds
        .map((nodeId) => nodes.find((node) => node.id === nodeId))
        .filter((node): node is Node => Boolean(node)),
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
    return conditionNodes.find((node) => node.id === selectedConditionNodeId) || conditionNodes[0] || null;
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
  const addContextLabel = selectedNode
    ? `${getNodeLabel(selectedNode)} 뒤에 연결`
    : nodes.length > 0
      ? "마지막 노드 뒤에 연결"
      : "첫 노드로 추가";
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
  const unsupportedLiveProviders = useMemo(() => getUnsupportedLiveProviders(nodes), [nodes]);
  const runReadiness = useMemo(() => {
    return getRunReadiness({
      nodeCount: nodes.length,
      missionGoal,
      budgetNumber,
      useMockRuntime,
      unsupportedLiveProviders
    });
  }, [budgetNumber, missionGoal, nodes.length, unsupportedLiveProviders, useMockRuntime]);

  return {
    orderedFlowNodes,
    stepIndexByNodeId,
    selectedNode,
    selectedNodeData,
    selectedNodeLabel,
    selectedConditionMode,
    selectedConditionDsl,
    selectedApprovalChannels,
    linkableTargetNodes,
    selectedLoopRegion,
    bandSelectedNodes,
    bandSelectedNodeIdSet,
    bandSelectedEdges,
    selectedLoopNodes,
    outsideLoopNodes,
    selectedLoopStartNode,
    selectedLoopEndNode,
    selectedLoopConditionNodeId,
    selectedLoopConditionNode,
    selectedLoopExitNode,
    conditionNodes,
    activeConditionNode,
    activeConditionData,
    conditionBranches,
    activeConditionDsl,
    conditionTargetNodes,
    connectSourceId,
    addContextLabel,
    libraryOnlyAgents,
    approvalGateCount,
    conditionRuleCount,
    runReadiness
  };
}
