import { type Dispatch, type SetStateAction } from "react";
import { type Edge, type Node } from "reactflow";
import { StudioFlowStepsTab } from "./StudioFlowStepsTab";
import { StudioFlowSettingsTab } from "./StudioFlowSettingsTab";
import { StudioFlowConditionsTab } from "./StudioFlowConditionsTab";
import { StudioFlowLoopPanel } from "./StudioFlowLoopPanel";
import { StudioFlowModalHeader } from "./StudioFlowModalHeader";
import { StudioFlowModalTabs } from "./StudioFlowModalTabs";
import { StudioFlowRoutesTab } from "./StudioFlowRoutesTab";
import { type LoopRegion } from "../../stores/app.store";
import { type ApprovalChannelId } from "../../lib/api";
import { type ConditionDslContract } from "../../lib/workflow-graph";
import { type Agent } from "../../types";
import {
  type ConditionBranch,
  type FlowModalTab,
  type StudioApprovalChannelState
} from "./studio-canvas-model";

type StudioFlowDetailModalProps = {
  showFlowModal: boolean;
  addContextLabel: string;
  loopBandMode: boolean;
  setFlowModalTab: (tab: FlowModalTab) => void;
  setLoopBandMode: Dispatch<SetStateAction<boolean>>;
  setBandSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  handleSaveDraft: () => void;
  closeFlowModal: () => void;
  flowModalTab: FlowModalTab;
  nodes: Node[];
  edges: Edge[];
  loopRegions: LoopRegion[];
  bandSelectedNodes: Node[];
  bandSelectedEdges: Edge[];
  createLoopRegionFromBand: () => void;
  orderedFlowNodes: Node[];
  nodeExecutionStates: Record<string, string>;
  selectedNodeId: string | null;
  bandSelectedNodeIdSet: Set<string>;
  toggleLoopBandNode: (nodeId: string) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  selectedNode: Node | null;
  selectedNodeData: Record<string, any>;
  selectedNodeLabel: string;
  linkTargetId: string;
  setLinkTargetId: Dispatch<SetStateAction<string>>;
  linkableTargetNodes: Node[];
  connectSelectedToTarget: () => void;
  selectedConditionMode: string;
  updateSelectedConditionMode: (mode: string) => void;
  updateSelectedNodeData: (patch: Record<string, any>) => void;
  selectedApprovalChannels: string[];
  toggleSelectedApprovalChannel: (channel: ApprovalChannelId) => void;
  approvalChannelStates: Record<ApprovalChannelId, StudioApprovalChannelState>;
  selectedUnreadyApprovalChannels: string[];
  selectedConditionDsl: ConditionDslContract;
  selectLoopRegionForEdit: (regionId: string) => void;
  selectedLoopRegion: LoopRegion | null;
  setSelectedLoopRegionId: (regionId: string | null) => void;
  stepIndexByNodeId: Map<string, number>;
  selectedLoopNodes: Node[];
  selectedLoopStartNode: Node | null;
  selectedLoopEndNode: Node | null;
  selectedLoopConditionNodeId: string;
  updateSelectedLoopRegion: (patch: Partial<LoopRegion>) => void;
  outsideLoopNodes: Node[];
  selectedLoopConditionNode: Node | null;
  selectedLoopExitNode: Node | null;
  removeLoopRegion: (regionId: string) => void;
  conditionNodes: Node[];
  activeConditionNode: Node | null;
  setSelectedConditionNodeId: Dispatch<SetStateAction<string>>;
  activeConditionData: Record<string, any>;
  updateConditionNodeData: (patch: Record<string, any>) => void;
  activeConditionDsl: ConditionDslContract;
  conditionBranches: ConditionBranch[];
  addConditionNode: () => void;
  addConditionBranch: () => void;
  updateConditionBranch: (branchId: string, patch: Partial<ConditionBranch>) => void;
  removeConditionBranch: (branchId: string) => void;
  conditionTargetNodes: Node[];
  applyConditionBranchConnection: (branch: ConditionBranch) => void;
  hiredAgents: Agent[];
  appendAgentToFlow: (agent: Agent) => void;
  appendUtilityToFlow: (utility: any) => void;
};

export function StudioFlowDetailModal(props: StudioFlowDetailModalProps) {
  const {
    showFlowModal,
    addContextLabel,
    loopBandMode,
    setFlowModalTab,
    setLoopBandMode,
    setBandSelectedNodeIds,
    handleSaveDraft,
    closeFlowModal,
    flowModalTab,
    nodes,
    edges,
    loopRegions,
    bandSelectedNodes,
    bandSelectedEdges,
    createLoopRegionFromBand,
    orderedFlowNodes,
    nodeExecutionStates,
    selectedNodeId,
    bandSelectedNodeIdSet,
    toggleLoopBandNode,
    setSelectedNodeId,
    selectedNode,
    selectedNodeData,
    selectedNodeLabel,
    linkTargetId,
    setLinkTargetId,
    linkableTargetNodes,
    connectSelectedToTarget,
    selectedConditionMode,
    updateSelectedConditionMode,
    updateSelectedNodeData,
    selectedApprovalChannels,
    toggleSelectedApprovalChannel,
    approvalChannelStates,
    selectedUnreadyApprovalChannels,
    selectedConditionDsl,
    selectLoopRegionForEdit,
    selectedLoopRegion,
    setSelectedLoopRegionId,
    stepIndexByNodeId,
    selectedLoopNodes,
    selectedLoopStartNode,
    selectedLoopEndNode,
    selectedLoopConditionNodeId,
    updateSelectedLoopRegion,
    outsideLoopNodes,
    selectedLoopConditionNode,
    selectedLoopExitNode,
    removeLoopRegion,
    conditionNodes,
    activeConditionNode,
    setSelectedConditionNodeId,
    activeConditionData,
    updateConditionNodeData,
    activeConditionDsl,
    conditionBranches,
    addConditionNode,
    addConditionBranch,
    updateConditionBranch,
    removeConditionBranch,
    conditionTargetNodes,
    applyConditionBranchConnection,
    hiredAgents,
    appendAgentToFlow,
    appendUtilityToFlow
  } = props;

  const toggleLoopBandMode = () => {
    setFlowModalTab("steps");
    setLoopBandMode((value) => {
      const next = !value;
      if (!next) setBandSelectedNodeIds([]);
      return next;
    });
  };

  return (
    <>
      {showFlowModal && (
        <div className="fixed inset-0 z-50 flex bg-black/80 p-3 text-white backdrop-blur md:p-6">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#080808] shadow-2xl shadow-black">
            <StudioFlowModalHeader
              addContextLabel={addContextLabel}
              loopBandMode={loopBandMode}
              onToggleLoopBandMode={toggleLoopBandMode}
              handleSaveDraft={handleSaveDraft}
              closeFlowModal={closeFlowModal}
            />
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#090d12] p-4">
              <div className="mx-auto w-full max-w-6xl space-y-4">
                <StudioFlowModalTabs flowModalTab={flowModalTab} setFlowModalTab={setFlowModalTab} />

                <div className="space-y-4">
                  <StudioFlowStepsTab
                    flowModalTab={flowModalTab}
                    nodes={nodes}
                    edges={edges}
                    loopRegions={loopRegions}
                    loopBandMode={loopBandMode}
                    bandSelectedNodes={bandSelectedNodes}
                    createLoopRegionFromBand={createLoopRegionFromBand}
                    setBandSelectedNodeIds={setBandSelectedNodeIds}
                    orderedFlowNodes={orderedFlowNodes}
                    nodeExecutionStates={nodeExecutionStates}
                    selectedNodeId={selectedNodeId}
                    bandSelectedNodeIdSet={bandSelectedNodeIdSet}
                    toggleLoopBandNode={toggleLoopBandNode}
                    setSelectedNodeId={setSelectedNodeId}
                    setFlowModalTab={setFlowModalTab}
                  />
                  <StudioFlowRoutesTab
                    flowModalTab={flowModalTab}
                    nodes={nodes}
                    edges={edges}
                    selectedNode={selectedNode}
                    selectedNodeData={selectedNodeData}
                    selectedNodeLabel={selectedNodeLabel}
                    linkTargetId={linkTargetId}
                    setLinkTargetId={setLinkTargetId}
                    linkableTargetNodes={linkableTargetNodes}
                    connectSelectedToTarget={connectSelectedToTarget}
                    stepIndexByNodeId={stepIndexByNodeId}
                  />
                </div>

                <div className={`${flowModalTab === "settings" || flowModalTab === "routes" || flowModalTab === "conditions" ? "block" : "hidden"} rounded-2xl border border-white/10 bg-white/[0.035] p-3`}>
                  <div className="grid gap-4 xl:grid-cols-2">
                <StudioFlowSettingsTab
                  flowModalTab={flowModalTab}
                  selectedNode={selectedNode}
                  selectedNodeLabel={selectedNodeLabel}
                  selectedNodeData={selectedNodeData}
                  stepIndexByNodeId={stepIndexByNodeId}
                  updateSelectedNodeData={updateSelectedNodeData}
                  selectedApprovalChannels={selectedApprovalChannels}
                  approvalChannelStates={approvalChannelStates}
                  toggleSelectedApprovalChannel={toggleSelectedApprovalChannel}
                  selectedUnreadyApprovalChannels={selectedUnreadyApprovalChannels}
                  selectedConditionMode={selectedConditionMode}
                  updateSelectedConditionMode={updateSelectedConditionMode}
                  selectedConditionDsl={selectedConditionDsl}
                  setFlowModalTab={setFlowModalTab}
                />
                <StudioFlowLoopPanel
                  flowModalTab={flowModalTab}
                  loopBandMode={loopBandMode}
                  bandSelectedNodes={bandSelectedNodes}
                  bandSelectedEdges={bandSelectedEdges}
                  createLoopRegionFromBand={createLoopRegionFromBand}
                  loopRegions={loopRegions}
                  selectedLoopRegion={selectedLoopRegion}
                  setSelectedLoopRegionId={setSelectedLoopRegionId}
                  selectedLoopStartNode={selectedLoopStartNode}
                  selectedLoopEndNode={selectedLoopEndNode}
                  selectedLoopConditionNodeId={selectedLoopConditionNodeId}
                  updateSelectedLoopRegion={updateSelectedLoopRegion}
                  nodes={nodes}
                  stepIndexByNodeId={stepIndexByNodeId}
                  outsideLoopNodes={outsideLoopNodes}
                  selectedLoopConditionNode={selectedLoopConditionNode}
                  selectedLoopExitNode={selectedLoopExitNode}
                  removeLoopRegion={removeLoopRegion}
                />

                <StudioFlowConditionsTab
                  flowModalTab={flowModalTab}
                  addContextLabel={addContextLabel}
                  conditionNodes={conditionNodes}
                  activeConditionNode={activeConditionNode}
                  setSelectedConditionNodeId={setSelectedConditionNodeId}
                  setSelectedNodeId={setSelectedNodeId}
                  setFlowModalTab={setFlowModalTab}
                  activeConditionData={activeConditionData}
                  updateConditionNodeData={updateConditionNodeData}
                  activeConditionDsl={activeConditionDsl}
                  conditionBranches={conditionBranches}
                  conditionTargetNodes={conditionTargetNodes}
                  stepIndexByNodeId={stepIndexByNodeId}
                  addConditionNode={addConditionNode}
                  addConditionBranch={addConditionBranch}
                  updateConditionBranch={updateConditionBranch}
                  removeConditionBranch={removeConditionBranch}
                  applyConditionBranchConnection={applyConditionBranchConnection}
                  hiredAgents={hiredAgents}
                  appendAgentToFlow={appendAgentToFlow}
                  appendUtilityToFlow={appendUtilityToFlow}
                />

                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
