import { type Dispatch, type SetStateAction } from "react";
import { Link2, ListOrdered } from "lucide-react";
import { type Edge, type Node } from "reactflow";
import { type LoopRegion } from "../../stores/app.store";
import {
  flowConditionBadgeLabel,
  getNodeCategory,
  getNodeLabel,
  NODE_STATE_BADGE,
  normalizeConditionBranches,
  type FlowModalTab
} from "./studio-canvas-model";

type StudioFlowStepsTabProps = {
  flowModalTab: FlowModalTab;
  nodes: Node[];
  edges: Edge[];
  loopRegions: LoopRegion[];
  loopBandMode: boolean;
  bandSelectedNodes: Node[];
  createLoopRegionFromBand: () => void;
  setBandSelectedNodeIds: Dispatch<SetStateAction<string[]>>;
  orderedFlowNodes: Node[];
  nodeExecutionStates: Record<string, string>;
  selectedNodeId: string | null;
  bandSelectedNodeIdSet: Set<string>;
  toggleLoopBandNode: (nodeId: string) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setFlowModalTab: (tab: FlowModalTab) => void;
};

export function StudioFlowStepsTab({
  flowModalTab,
  nodes,
  edges,
  loopRegions,
  loopBandMode,
  bandSelectedNodes,
  createLoopRegionFromBand,
  setBandSelectedNodeIds,
  orderedFlowNodes,
  nodeExecutionStates,
  selectedNodeId,
  bandSelectedNodeIdSet,
  toggleLoopBandNode,
  setSelectedNodeId,
  setFlowModalTab
}: StudioFlowStepsTabProps) {
  return (
                  <div className={`${flowModalTab === "steps" ? "block" : "hidden"} rounded-2xl border border-white/10 bg-white/[0.035] p-4`}>
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-base font-bold text-white">
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10">
                            <ListOrdered className="h-4 w-4 text-blue-200" />
                          </span>
                          실행 단계
                        </div>
                        <div className="mt-1 text-xs leading-relaxed text-gray-500">
                          빈 그래프 대신 각 Unit 실행 단계를 카드로 보고, 선택해서 설정합니다.
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className="stat-chip px-2 py-1 text-gray-300">nodes {nodes.length}</span>
                        <span className="stat-chip px-2 py-1 text-gray-300">edges {edges.length}</span>
                        <span className="rounded-lg border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-violet-100">
                          loops {loopRegions.length}
                        </span>
                      </div>
                    </div>

                    {loopBandMode ? (
                      <div className="mb-4 rounded-2xl border border-violet-500/30 bg-violet-500/[0.08] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-violet-100">반복 영역 선택 중</div>
                            <div className="mt-0.5 text-[11px] text-violet-100/65">
                              반복할 단계 카드를 2개 이상 선택한 뒤 영역을 만드세요.
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-lg border border-violet-400/20 bg-black/25 px-2 py-1 text-[11px] font-semibold text-violet-100">
                              {bandSelectedNodes.length}개 선택
                            </span>
                            <button
                              type="button"
                              onClick={createLoopRegionFromBand}
                              disabled={bandSelectedNodes.length < 2}
                              className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              반복 영역 만들기
                            </button>
                            <button
                              type="button"
                              onClick={() => setBandSelectedNodeIds([])}
                              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-white/10"
                            >
                              선택 해제
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-3 xl:grid-cols-2">
                      {orderedFlowNodes.map((node, index) => {
                        const state = nodeExecutionStates[node.id] || "idle";
                        const data = (node.data as any) || {};
                        const selected = selectedNodeId === node.id;
                        const selectedForLoop = bandSelectedNodeIdSet.has(node.id);
                        const outgoingEdges = edges.filter((edge) => edge.source === node.id);
                        const nodeLoopRegion = loopRegions.find((region) => region.nodeIds.includes(node.id));
                        const branchCount = normalizeConditionBranches(data.condition_branches).length;
                        const isApprovalNode = String(data.agent_id || "").toLowerCase() === "hitl";
                        const executionLabel = data.execution_mode === "confirm" || isApprovalNode ? "승인 후 실행" : "자동 실행";
                        const conditionLabel = flowConditionBadgeLabel(data);
                        return (
                          <button
                            key={node.id}
                            type="button"
                            onClick={() => {
                              if (loopBandMode) {
                                toggleLoopBandNode(node.id);
                                return;
                              }
                              setSelectedNodeId(node.id);
                              setFlowModalTab("settings");
                            }}
                            className={`min-w-0 rounded-2xl border p-3 text-left transition-colors ${
                              selected
                                ? "border-blue-400/70 bg-blue-500/[0.14] shadow-sm shadow-blue-500/10"
                                : selectedForLoop
                                  ? "border-violet-400/70 bg-violet-500/[0.16]"
                                  : "border-white/10 bg-black/25 hover:border-white/20 hover:bg-white/[0.045]"
                            }`}
                          >
                            <div className="mb-3 flex items-start gap-3">
                              <span
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-white ${
                                  selectedForLoop ? "bg-violet-600" : "bg-blue-600"
                                }`}
                              >
                                {selectedForLoop ? "✓" : index + 1}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="shrink-0 text-lg">{String(data.avatar || data.creator_avatar || "🧩")}</span>
                                  <span className="truncate text-sm font-black text-white">{getNodeLabel(node)}</span>
                                </span>
                                <span className="mt-0.5 block truncate text-[11px] text-gray-500">{getNodeCategory(node)}</span>
                              </span>
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${NODE_STATE_BADGE[state] || NODE_STATE_BADGE.idle}`}>
                                {state}
                              </span>
                            </div>

                            <div className="mb-3 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                              <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-100">
                                {executionLabel}
                              </span>
                              <span className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-100">
                                {conditionLabel}
                              </span>
                              {isApprovalNode ? (
                                <span className="rounded-lg border border-yellow-500/25 bg-yellow-500/10 px-2 py-1 text-yellow-100">
                                  관리자 승인
                                </span>
                              ) : null}
                              {branchCount > 0 ? (
                                <span className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-cyan-100">
                                  분기 {branchCount}
                                </span>
                              ) : null}
                              {nodeLoopRegion ? (
                                <span className="rounded-lg border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-violet-100">
                                  {nodeLoopRegion.name}
                                </span>
                              ) : null}
                            </div>

                            <div className="space-y-1.5 border-t border-white/10 pt-2 text-[11px]">
                              {outgoingEdges.length > 0 ? (
                                outgoingEdges.map((edge) => {
                                  const targetNode = nodes.find((item) => item.id === edge.target);
                                  const edgeLabel = String((edge as any).label || (edge.data as any)?.condition || "다음 단계");
                                  return (
                                    <div key={edge.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5 text-gray-300">
                                      <Link2 className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                                      <span className="truncate">{targetNode ? getNodeLabel(targetNode) : edge.target}</span>
                                      <span className="shrink-0 rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[10px] text-gray-500">
                                        {edgeLabel}
                                      </span>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="rounded-lg border border-dashed border-white/10 px-2 py-2 text-gray-600">
                                  다음 연결이 없습니다.
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      {orderedFlowNodes.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-gray-500 xl:col-span-2">
                          노드를 추가하면 실행 단계 카드가 표시됩니다.
                        </div>
                      )}
                    </div>
                  </div>


  );
}