import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "../../stores/app.store";
import { isDemoModeEnabled } from "../../lib/demo-mode";
import {
  CANVAS_UTILITY_NODES,
  isConditionNode,
  type FlowModalTab
} from "./studio-canvas-model";
import { resolveAutoAddPosition } from "./studio-state-builders";
import { useStudioApprovalChannels } from "./useStudioApprovalChannels";
import { useStudioCanvasDerivedState } from "./useStudioCanvasDerivedState";
import { useStudioConditionActions } from "./useStudioConditionActions";
import { useStudioDraftActions } from "./useStudioDraftActions";
import { useStudioLoopActions } from "./useStudioLoopActions";
import { useStudioMissionExecution } from "./useStudioMissionExecution";

export function useStudioCanvasState() {
  const searchParams = useSearchParams();
  const flowModalReturnScrollYRef = useRef(0);
  const [missionGoal, setMissionGoal] = useState("새로운 실행 워크플로우");
  const [missionBudget, setMissionBudget] = useState("5");
  const [useMockRuntime, setUseMockRuntime] = useState(true);
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
  const {
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
  } = useStudioCanvasDerivedState({
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
  });
  const selectLoopRegionForEdit = useCallback(
    (regionId: string) => {
      setSelectedLoopRegionId(regionId);
      setSelectedNodeId(null);
      setLoopBandMode(false);
      setFlowModalTab("routes");
    },
    [setSelectedLoopRegionId, setSelectedNodeId]
  );
  const {
    draftSavedAt,
    draftNotice,
    handleSaveDraft,
    handleRestoreDraft,
    handleDiscardDraft,
    handleClearCanvas
  } = useStudioDraftActions({
    missionGoal,
    setMissionGoal,
    missionBudget,
    setMissionBudget,
    useMockRuntime,
    setUseMockRuntime,
    nodes,
    edges,
    nodeExecutionStates,
    loopRegions,
    replaceCanvas,
    clearCanvas
  });

  useEffect(() => {
    setShowFlowModal(searchParams.get("panel") === "flow");
  }, [searchParams]);

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
    return resolveAutoAddPosition(selectedNode, orderedFlowNodes);
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

  const {
    approvalChannelStates,
    selectedUnreadyApprovalChannels,
    toggleSelectedApprovalChannel
  } = useStudioApprovalChannels({
    selectedApprovalChannels,
    updateSelectedNodeData
  });

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

  const {
    toggleLoopBandNode,
    createLoopRegionFromBand,
    updateSelectedLoopRegion
  } = useStudioLoopActions({
    bandSelectedNodeIds,
    nodes,
    edges,
    orderedFlowNodes,
    loopRegions,
    selectedLoopRegion,
    createLoopRegion,
    updateLoopRegion,
    setSelectedNodeId,
    setBandSelectedNodeIds,
    setLoopBandMode,
    setFlowModalTab
  });

  const {
    updateConditionNodeData,
    addConditionNode,
    addConditionBranch,
    updateConditionBranch,
    removeConditionBranch,
    applyConditionBranchConnection
  } = useStudioConditionActions({
    activeConditionNode,
    conditionBranches,
    conditionTargetNodes,
    appendUtilityToFlow,
    updateNodeData,
    connectNodes,
    setFlowModalTab
  });

  const { isExecuting, executeError, handleExecute } = useStudioMissionExecution({
    missionGoal,
    missionBudget,
    useMockRuntime,
    isDemoMode,
    nodes,
    edges,
    loopRegions,
    resetMissionRunState,
    setMissionRunState,
    setNodeExecutionState
  });

  return {
    missionGoal,
    setMissionGoal,
    missionBudget,
    setMissionBudget,
    useMockRuntime,
    setUseMockRuntime,
    isExecuting,
    executeError,
    draftSavedAt,
    draftNotice,
    showFlowModal,
    flowModalTab,
    setFlowModalTab,
    showAddPanel,
    setShowAddPanel,
    linkTargetId,
    setLinkTargetId,
    loopBandMode,
    setLoopBandMode,
    setBandSelectedNodeIds,
    addContextLabel,
    isDemoMode,
    hiredAgents,
    nodes,
    edges,
    loopRegions,
    setSelectedLoopRegionId,
    removeLoopRegion,
    selectedNodeId,
    setSelectedNodeId,
    missionRunTransitionWarning,
    clearMissionRunTransitionWarning,
    nodeExecutionStates,
    orderedFlowNodes,
    stepIndexByNodeId,
    selectLoopRegionForEdit,
    selectedNode,
    selectedNodeData,
    selectedNodeLabel,
    selectedConditionMode,
    selectedConditionDsl,
    selectedApprovalChannels,
    approvalChannelStates,
    selectedUnreadyApprovalChannels,
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
    setSelectedConditionNodeId,
    activeConditionData,
    conditionBranches,
    activeConditionDsl,
    conditionTargetNodes,
    libraryOnlyAgents,
    approvalGateCount,
    conditionRuleCount,
    runReadiness,
    openFlowModal,
    closeFlowModal,
    appendAgentToFlow,
    appendUtilityToFlow,
    connectSelectedToTarget,
    updateSelectedNodeData,
    updateSelectedConditionMode,
    toggleSelectedApprovalChannel,
    toggleLoopBandNode,
    createLoopRegionFromBand,
    updateSelectedLoopRegion,
    updateConditionNodeData,
    addConditionNode,
    addConditionBranch,
    updateConditionBranch,
    removeConditionBranch,
    applyConditionBranchConnection,
    handleSaveDraft,
    handleRestoreDraft,
    handleDiscardDraft,
    handleClearCanvas,
    handleExecute
  };
}
