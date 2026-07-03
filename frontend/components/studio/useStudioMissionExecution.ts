import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { Edge, Node } from "reactflow";
import type { LoopRegion } from "../../stores/app.store";
import { createMission } from "../../lib/api";
import { buildWorkflowGraphPayload } from "../../lib/workflow-graph";
import type { MissionRunState, NodeExecutionState } from "../../types";
import { describeExecuteError } from "./studio-canvas-model";

type UseStudioMissionExecutionArgs = {
  missionGoal: string;
  missionBudget: string;
  useMockRuntime: boolean;
  isDemoMode: boolean;
  nodes: Node[];
  edges: Edge[];
  loopRegions: LoopRegion[];
  resetMissionRunState: (state: MissionRunState, source?: string) => void;
  setMissionRunState: (state: MissionRunState, source?: string) => void;
  setNodeExecutionState: (nodeId: string, state: NodeExecutionState) => void;
};

export function useStudioMissionExecution({
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
}: UseStudioMissionExecutionArgs) {
  const router = useRouter();
  const [isExecuting, setIsExecuting] = useState(false);
  const [executeError, setExecuteError] = useState("");

  const handleExecute = useCallback(async () => {
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
  }, [
    edges,
    isDemoMode,
    isExecuting,
    loopRegions,
    missionBudget,
    missionGoal,
    nodes,
    resetMissionRunState,
    router,
    setMissionRunState,
    setNodeExecutionState,
    useMockRuntime
  ]);

  return {
    isExecuting,
    executeError,
    handleExecute
  };
}
