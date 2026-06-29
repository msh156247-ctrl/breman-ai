import { type Dispatch, type SetStateAction } from "react";
import { Link2, Maximize2, RotateCcw, Save, X } from "lucide-react";
import { type Edge, type Node } from "reactflow";
import { StudioFlowStepsTab } from "./StudioFlowStepsTab";
import { StudioFlowSettingsTab } from "./StudioFlowSettingsTab";
import { StudioFlowConditionsTab } from "./StudioFlowConditionsTab";
import { type LoopRegion } from "../../stores/app.store";
import { type ApprovalChannelId } from "../../lib/api";
import { type ConditionDslContract } from "../../lib/workflow-graph";
import { type Agent } from "../../types";
import {
  FLOW_MODAL_TABS,
  getNodeCategory,
  getNodeLabel,
  LOOP_EXIT_FINISH,
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
                  <div className={`${flowModalTab === "routes" ? "grid" : "hidden"} gap-4 xl:grid-cols-3`}>
                    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.055] p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-cyan-200" />
                          <div>
                            <div className="text-sm font-bold text-white">연결 목록</div>
                            <div className="text-[11px] text-cyan-100/60">단계 사이 이동 경로입니다.</div>
                          </div>
                        </div>
                        <span className="rounded-lg border border-cyan-400/20 bg-black/25 px-2 py-1 text-[10px] text-cyan-100">
                          {edges.length}
                        </span>
                      </div>
                      <div className="space-y-2 text-xs">
                        {edges.map((edge) => {
                          const sourceNode = nodes.find((node) => node.id === edge.source);
                          const targetNode = nodes.find((node) => node.id === edge.target);
                          const edgeLabel = String((edge as any).label || (edge.data as any)?.condition || "direct");
                          return (
                            <div key={edge.id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                              <div className="flex min-w-0 items-center gap-2 text-gray-200">
                                <span className="truncate">{sourceNode ? getNodeLabel(sourceNode) : edge.source}</span>
                                <span className="text-cyan-300">→</span>
                                <span className="truncate">{targetNode ? getNodeLabel(targetNode) : edge.target}</span>
                              </div>
                              <div className="mt-1 truncate text-[11px] text-gray-500">{edgeLabel}</div>
                            </div>
                          );
                        })}
                        {edges.length === 0 && (
                          <div className="rounded-xl border border-dashed border-cyan-400/20 px-3 py-6 text-center text-cyan-100/50">
                            아직 연결이 없습니다.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.055] p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-cyan-200" />
                          <div>
                            <div className="text-sm font-bold text-white">선택 노드 연결</div>
                            <div className="text-[11px] text-cyan-100/60">
                              선택한 단계에서 다음 단계로 링크를 추가합니다.
                            </div>
                          </div>
                        </div>
                        {selectedNode ? (
                          <span className="rounded-lg border border-cyan-400/20 bg-black/25 px-2 py-1 text-[10px] text-cyan-100">
                            step {selectedNodeData.step_index || stepIndexByNodeId.get(selectedNode.id) || "-"}
                          </span>
                        ) : null}
                      </div>
                      {selectedNode ? (
                        <div className="space-y-2">
                          <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-2 text-xs text-gray-200">
                            <div className="truncate font-semibold">{selectedNodeLabel}</div>
                            <div className="mt-0.5 truncate text-[11px] text-gray-500">{getNodeCategory(selectedNode)}</div>
                          </div>
                          <div className="flex gap-2">
                            <select
                              value={linkTargetId}
                              onChange={(event) => setLinkTargetId(event.target.value)}
                              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none"
                            >
                              {linkableTargetNodes.map((node) => (
                                <option key={node.id} value={node.id}>
                                  {stepIndexByNodeId.get(node.id) || "-"} · {getNodeLabel(node)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={connectSelectedToTarget}
                              disabled={!linkTargetId}
                              className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              연결
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-cyan-400/20 px-3 py-6 text-center text-xs text-cyan-100/50">
                          실행 단계 탭에서 연결 시작 노드를 먼저 선택하세요.
                        </div>
                      )}
                    </div>
                  </div>
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
                <div className={`${flowModalTab === "routes" ? "block" : "hidden"} mb-4 rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-3`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="h-4 w-4 text-violet-200" />
                      <div>
                        <div className="text-sm font-bold text-white">반복 영역</div>
                        <div className="text-[11px] text-violet-100/60">
                          반복 선택 모드에서 연결된 단계 카드를 선택하세요.
                        </div>
                      </div>
                    </div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        loopBandMode ? "bg-violet-500 text-white" : "bg-black/30 text-gray-400"
                      }`}
                    >
                      {loopBandMode ? "selecting" : "idle"}
                    </span>
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-black/25 px-2 py-2 text-gray-300">
                      <div className="text-gray-500">선택 노드</div>
                      <div className="mt-0.5 font-semibold text-violet-100">{bandSelectedNodes.length}개</div>
                    </div>
                    <div className="rounded-lg bg-black/25 px-2 py-2 text-gray-300">
                      <div className="text-gray-500">내부 링크</div>
                      <div className="mt-0.5 font-semibold text-violet-100">{bandSelectedEdges.length}개</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={createLoopRegionFromBand}
                    disabled={bandSelectedNodes.length < 2}
                    className="mb-3 w-full rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    선택 영역을 반복으로 만들기
                  </button>

                  {loopRegions.length > 0 ? (
                    <div className="space-y-3">
                      <label className="block text-[11px] font-semibold text-gray-400">
                        반복 영역 선택
                        <select
                          value={selectedLoopRegion?.id || ""}
                          onChange={(event) => setSelectedLoopRegionId(event.target.value || null)}
                          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none focus:border-violet-500/50"
                        >
                          {loopRegions.map((region) => (
                            <option key={region.id} value={region.id}>
                              {region.name} · {region.nodeIds.length} nodes
                            </option>
                          ))}
                        </select>
                      </label>

                      {selectedLoopRegion ? (
                        <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
                          <label className="block text-[11px] text-gray-500">
                            이름
                            <input
                              value={selectedLoopRegion.name}
                              onChange={(event) => updateSelectedLoopRegion({ name: event.target.value })}
                              className="mt-1 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none focus:border-violet-500/50"
                            />
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="text-[11px] text-gray-500">
                              반복 초기 노드
                              <div className="mt-1 rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200">
                                <div className="truncate">
                                  {selectedLoopStartNode
                                    ? `${stepIndexByNodeId.get(selectedLoopStartNode.id) || "-"} · ${getNodeLabel(selectedLoopStartNode)}`
                                    : "자동 설정됨"}
                                </div>
                                <div className="mt-1 text-[10px] text-violet-300">생성 시 고정</div>
                              </div>
                            </div>
                            <div className="text-[11px] text-gray-500">
                              반복 종료 노드
                              <div className="mt-1 rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200">
                                <div className="truncate">
                                  {selectedLoopEndNode
                                    ? `${stepIndexByNodeId.get(selectedLoopEndNode.id) || "-"} · ${getNodeLabel(selectedLoopEndNode)}`
                                    : "자동 설정됨"}
                                </div>
                                <div className="mt-1 text-[10px] text-violet-300">생성 시 고정</div>
                              </div>
                            </div>
                          </div>
                          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-2">
                            <div className="mb-2 text-[11px] font-semibold text-violet-100">종료 조건 평가 위치</div>
                            <div className="grid grid-cols-2 gap-2">
                              {[selectedLoopRegion.startNodeId, selectedLoopRegion.endNodeId].map((nodeId) => {
                                const node = nodes.find((item) => item.id === nodeId);
                                const active = selectedLoopConditionNodeId === nodeId;
                                return (
                                  <button
                                    key={nodeId}
                                    type="button"
                                    onClick={() => updateSelectedLoopRegion({ exitConditionNodeId: nodeId })}
                                    className={`rounded-lg border px-2 py-2 text-left text-xs font-semibold ${
                                      active
                                        ? "border-violet-400/60 bg-violet-500/20 text-violet-50"
                                        : "border-white/10 bg-black/20 text-gray-400 hover:text-white"
                                    }`}
                                  >
                                    <span className="block truncate">{node ? getNodeLabel(node) : nodeId}</span>
                                    <span className="mt-1 block text-[10px] opacity-70">
                                      {nodeId === selectedLoopRegion.startNodeId ? "초기에서 검사" : "종료에서 검사"}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <label className="block text-[11px] text-gray-500">
                            종료 후 노드
                            <select
                              value={selectedLoopRegion.exitNodeId || LOOP_EXIT_FINISH}
                              onChange={(event) => updateSelectedLoopRegion({ exitNodeId: event.target.value })}
                              className="mt-1 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none"
                            >
                              <option value={LOOP_EXIT_FINISH}>플로우 종료</option>
                              {outsideLoopNodes.map((node) => (
                                <option key={node.id} value={node.id}>
                                  {stepIndexByNodeId.get(node.id) || "-"} · {getNodeLabel(node)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                            <label className="text-[11px] text-gray-500">
                              최대 반복
                              <input
                                type="number"
                                min={1}
                                max={50}
                                value={selectedLoopRegion.repeatCount}
                                onChange={(event) =>
                                  updateSelectedLoopRegion({ repeatCount: Math.max(1, Number(event.target.value) || 1) })
                                }
                                className="mt-1 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none"
                              />
                            </label>
                            <label className="text-[11px] text-gray-500">
                              종료 조건
                              <input
                                value={selectedLoopRegion.exitCondition}
                                onChange={(event) => updateSelectedLoopRegion({ exitCondition: event.target.value })}
                                placeholder="예: result.done == true"
                                className="mt-1 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-violet-500/50"
                              />
                            </label>
                          </div>
                          <div className="rounded-lg bg-black/25 px-2 py-2 text-[11px] leading-relaxed text-gray-400">
                            선택한 평가 위치에서 종료 조건을 만족하면 종료 후 노드로 이동하고, 아니면 반복 초기 노드로 돌아갑니다.
                          </div>
                          <div className="rounded-lg border border-violet-400/20 bg-violet-500/[0.055] p-2 text-[11px]">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="font-semibold text-violet-100">반복 런타임</span>
                              <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-violet-200">
                                loop_region_v1
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 rounded-md bg-black/20 px-2 py-1.5">
                                <span className="text-violet-200">반복 대상</span>
                                <span className="truncate text-gray-300">
                                  {selectedLoopRegion.nodeIds.length} steps · {selectedLoopStartNode ? getNodeLabel(selectedLoopStartNode) : "start"} →{" "}
                                  {selectedLoopEndNode ? getNodeLabel(selectedLoopEndNode) : "end"}
                                </span>
                              </div>
                              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 rounded-md bg-black/20 px-2 py-1.5">
                                <span className="text-violet-200">종료 평가</span>
                                <span className="truncate text-gray-300">
                                  {selectedLoopConditionNode ? getNodeLabel(selectedLoopConditionNode) : "종료 노드"} ·{" "}
                                  {selectedLoopRegion.exitCondition || "조건 없음"}
                                </span>
                              </div>
                              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 rounded-md bg-black/20 px-2 py-1.5">
                                <span className="text-violet-200">true / false</span>
                                <span className="truncate text-gray-300">
                                  true →{" "}
                                  {selectedLoopRegion.exitNodeId === LOOP_EXIT_FINISH
                                    ? "플로우 종료"
                                    : selectedLoopExitNode
                                      ? getNodeLabel(selectedLoopExitNode)
                                      : "종료 후 노드 없음"}
                                  {" · false → 반복 초기로"}
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeLoopRegion(selectedLoopRegion.id)}
                            className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/15"
                          >
                            반복 영역 삭제
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-violet-400/20 px-3 py-4 text-center text-xs text-violet-100/50">
                      아직 반복 영역이 없습니다.
                    </div>
                  )}
                </div>

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
