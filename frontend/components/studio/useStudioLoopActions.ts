import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Edge, Node } from "reactflow";
import type { LoopRegion } from "../../stores/app.store";
import type { FlowModalTab } from "./studio-canvas-model";
import { buildLoopRegionFromBand } from "./studio-state-builders";

type UseStudioLoopActionsArgs = {
  bandSelectedNodeIds: string[];
  nodes: Node[];
  edges: Edge[];
  orderedFlowNodes: Node[];
  loopRegions: LoopRegion[];
  selectedLoopRegion: LoopRegion | null;
  createLoopRegion: (region: Omit<LoopRegion, "id" | "createdAt"> & { id?: string; createdAt?: string }) => void;
  updateLoopRegion: (id: string, patch: Partial<Omit<LoopRegion, "id" | "createdAt">>) => void;
  setSelectedNodeId: (id: string | null) => void;
  setBandSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  setLoopBandMode: Dispatch<SetStateAction<boolean>>;
  setFlowModalTab: Dispatch<SetStateAction<FlowModalTab>>;
};

export function useStudioLoopActions({
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
}: UseStudioLoopActionsArgs) {
  const toggleLoopBandNode = useCallback(
    (nodeId: string) => {
      setBandSelectedNodeIds((selectedIds) =>
        selectedIds.includes(nodeId) ? selectedIds.filter((id) => id !== nodeId) : [...selectedIds, nodeId]
      );
      setSelectedNodeId(nodeId);
    },
    [setBandSelectedNodeIds, setSelectedNodeId]
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
  }, [
    bandSelectedNodeIds,
    createLoopRegion,
    edges,
    loopRegions.length,
    nodes,
    orderedFlowNodes,
    setBandSelectedNodeIds,
    setFlowModalTab,
    setLoopBandMode,
    setSelectedNodeId
  ]);

  const updateSelectedLoopRegion = useCallback(
    (patch: Partial<Omit<LoopRegion, "id" | "createdAt">>) => {
      if (!selectedLoopRegion) return;
      updateLoopRegion(selectedLoopRegion.id, patch);
    },
    [selectedLoopRegion, updateLoopRegion]
  );

  return {
    toggleLoopBandNode,
    createLoopRegionFromBand,
    updateSelectedLoopRegion
  };
}
