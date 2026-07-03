import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Node } from "reactflow";
import {
  CANVAS_UTILITY_NODES,
  LOOP_EXIT_FINISH,
  type ConditionBranch,
  type FlowModalTab
} from "./studio-canvas-model";
import { createDefaultConditionBranch } from "./studio-state-builders";

type CanvasUtilityNode = (typeof CANVAS_UTILITY_NODES)[number];

type UseStudioConditionActionsArgs = {
  activeConditionNode: Node | null;
  conditionBranches: ConditionBranch[];
  conditionTargetNodes: Node[];
  appendUtilityToFlow: (utility: CanvasUtilityNode) => void;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  connectNodes: (
    sourceId: string,
    targetId: string,
    options?: { label?: string; condition?: string; animated?: boolean }
  ) => void;
  setFlowModalTab: Dispatch<SetStateAction<FlowModalTab>>;
};

export function useStudioConditionActions({
  activeConditionNode,
  conditionBranches,
  conditionTargetNodes,
  appendUtilityToFlow,
  updateNodeData,
  connectNodes,
  setFlowModalTab
}: UseStudioConditionActionsArgs) {
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
  }, [appendUtilityToFlow, setFlowModalTab]);

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

  return {
    updateConditionNodeData,
    addConditionNode,
    addConditionBranch,
    updateConditionBranch,
    removeConditionBranch,
    applyConditionBranchConnection
  };
}
