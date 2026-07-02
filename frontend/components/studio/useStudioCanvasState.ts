import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppStore, type LoopRegion } from "../../stores/app.store";
import { createMission } from "../../lib/api";
import { isDemoModeEnabled } from "../../lib/demo-mode";
import { buildWorkflowGraphPayload } from "../../lib/workflow-graph";
import {
  CANVAS_UTILITY_NODES,
  describeExecuteError,
  isConditionNode,
  LOOP_EXIT_FINISH,
  type ConditionBranch,
  type FlowModalTab
} from "./studio-canvas-model";
import { buildLoopRegionFromBand, createDefaultConditionBranch, resolveAutoAddPosition } from "./studio-state-builders";
import { useStudioApprovalChannels } from "./useStudioApprovalChannels";
import { useStudioCanvasDerivedState } from "./useStudioCanvasDerivedState";
import { useStudioDraftActions } from "./useStudioDraftActions";

export function useStudioCanvasState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const flowModalReturnScrollYRef = useRef(0);
  const [missionGoal, setMissionGoal] = useState("새로운 실행 워크플로우");
  const [missionBudget, setMissionBudget] = useState("5");
  const [useMockRuntime, setUseMockRuntime] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executeError, setExecuteError] = useState("");
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
    const seed = buildLoopRegionFromBand({
      bandSelectedNodeIds,
      nodes,
      edges,
      orderedFlowNodes,
      existingRegionCount: loopRegions.length
    });
    if (!seed) return;
    createLoopRegion(seed.region);
    setSelectedNodeId(seed.startNodeId);
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
      createDefaultConditionBranch({ branchCount: conditionBranches.length, nextTargetId: nextTarget })
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
