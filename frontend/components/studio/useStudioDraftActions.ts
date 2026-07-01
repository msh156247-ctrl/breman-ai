import { useCallback, useEffect, useState } from "react";
import { type Edge, type Node } from "reactflow";
import { type LoopRegion } from "../../stores/app.store";
import { type NodeExecutionState } from "../../types";
import {
  formatDraftTime,
  readStudioDraft,
  STUDIO_DRAFT_STORAGE_KEY
} from "./studio-canvas-model";
import { buildStudioDraftPayload } from "./studio-state-builders";

type UseStudioDraftActionsParams = {
  missionGoal: string;
  setMissionGoal: (value: string) => void;
  missionBudget: string;
  setMissionBudget: (value: string) => void;
  useMockRuntime: boolean;
  setUseMockRuntime: (value: boolean) => void;
  nodes: Node[];
  edges: Edge[];
  nodeExecutionStates: Record<string, NodeExecutionState>;
  loopRegions: LoopRegion[];
  replaceCanvas: (payload: {
    nodes: Node[];
    edges: Edge[];
    nodeExecutionStates?: Record<string, NodeExecutionState>;
    loopRegions?: LoopRegion[];
  }) => void;
  clearCanvas: () => void;
};

export function useStudioDraftActions({
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
}: UseStudioDraftActionsParams) {
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState("");

  useEffect(() => {
    const draft = readStudioDraft();
    if (draft) setDraftSavedAt(draft.savedAt);
  }, []);

  const handleSaveDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    const savedAt = new Date().toISOString();
    const draft = buildStudioDraftPayload({
      savedAt,
      missionGoal,
      missionBudget,
      useMockRuntime,
      nodes,
      edges,
      nodeExecutionStates,
      loopRegions
    });
    try {
      window.localStorage.setItem(STUDIO_DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setDraftSavedAt(savedAt);
      setDraftNotice(`Draft 저장됨 · ${formatDraftTime(savedAt)}`);
    } catch {
      setDraftNotice("브라우저 저장소를 사용할 수 없어 draft를 저장하지 못했습니다.");
    }
  }, [edges, loopRegions, missionBudget, missionGoal, nodeExecutionStates, nodes, useMockRuntime]);

  const handleRestoreDraft = useCallback(() => {
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
  }, [replaceCanvas, setMissionBudget, setMissionGoal, setUseMockRuntime]);

  const handleDiscardDraft = useCallback(() => {
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
  }, []);

  const handleClearCanvas = useCallback(() => {
    clearCanvas();
    setDraftNotice(draftSavedAt ? "워크플로우를 비웠습니다. 저장된 draft는 유지됩니다." : "");
  }, [clearCanvas, draftSavedAt]);

  return {
    draftSavedAt,
    draftNotice,
    handleSaveDraft,
    handleRestoreDraft,
    handleDiscardDraft,
    handleClearCanvas
  };
}
