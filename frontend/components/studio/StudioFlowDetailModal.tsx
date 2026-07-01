import { type Dispatch, type SetStateAction } from "react";
import { Maximize2, RotateCcw, Save, X } from "lucide-react";
import { type Edge, type Node } from "reactflow";
import { StudioFlowStepsTab } from "./StudioFlowStepsTab";
import { StudioFlowSettingsTab } from "./StudioFlowSettingsTab";
import { StudioFlowConditionsTab } from "./StudioFlowConditionsTab";
import { StudioFlowLoopPanel } from "./StudioFlowLoopPanel";
import { StudioFlowRoutesTab } from "./StudioFlowRoutesTab";
import { type LoopRegion } from "../../stores/app.store";
import { type ApprovalChannelId } from "../../lib/api";
import { type ConditionDslContract } from "../../lib/workflow-graph";
import { type Agent } from "../../types";
import {
  FLOW_MODAL_TABS,
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

  return (
    <>
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
