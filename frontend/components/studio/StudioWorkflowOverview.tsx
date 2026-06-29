import { type Dispatch, type SetStateAction } from "react";
import { GitBranch, Maximize2, Plus, X } from "lucide-react";
import { type Edge, type Node } from "reactflow";
import { type LoopRegion } from "../../stores/app.store";
import { type Agent } from "../../types";
import { CANVAS_UTILITY_NODES, getNodeCategory, getNodeLabel, NODE_STATE_BADGE } from "./studio-canvas-model";

type StudioWorkflowOverviewProps = {
  showAddPanel: boolean;
  setShowAddPanel: Dispatch<SetStateAction<boolean>>;
  addContextLabel: string;
  hiredAgents: Agent[];
  libraryOnlyAgents: Agent[];
  appendAgentToFlow: (agent: Agent) => void;
  appendUtilityToFlow: (utility: any) => void;
  orderedFlowNodes: Node[];
  nodeExecutionStates: Record<string, string>;
  selectedNodeId: string | null;
  setSelectedNodeId: (nodeId: string | null) => void;
  nodes: Node[];
  edges: Edge[];
  loopRegions: LoopRegion[];
  selectLoopRegionForEdit: (regionId: string) => void;
  openFlowModal: () => void;
};

export function StudioWorkflowOverview({
  showAddPanel,
  setShowAddPanel,
  addContextLabel,
  hiredAgents,
  libraryOnlyAgents,
  appendAgentToFlow,
  appendUtilityToFlow,
  orderedFlowNodes,
  nodeExecutionStates,
  selectedNodeId,
  setSelectedNodeId,
  nodes,
  edges,
  loopRegions,
  selectLoopRegionForEdit,
  openFlowModal
}: StudioWorkflowOverviewProps) {
  return (
      <div className="relative flex-1">
        <div className="flex h-full flex-col overflow-y-auto bg-transparent">
            <div className="flex min-h-[430px] flex-1 p-3">
              <div className="panel-shell flex min-h-0 flex-1 flex-col rounded-2xl p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-lg font-bold text-white">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10">
                        <GitBranch className="h-4 w-4 text-blue-200" />
                      </span>
                      워크플로우 구성
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      실행 순서, 연결, 반복 영역을 카드로 정리합니다.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <span className="stat-chip px-2 py-1 text-gray-300">
                      nodes {nodes.length}
                    </span>
                    <span className="stat-chip px-2 py-1 text-gray-300">
                      edges {edges.length}
                    </span>
                    <span className="rounded-lg border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-violet-100">
                      loops {loopRegions.length}
                    </span>
                  </div>
                </div>

                {showAddPanel && (
                  <div className="mb-4 rounded-2xl border border-white/10 bg-black/[0.24] p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-white">노드 추가</div>
                        <div className="mt-0.5 text-[10px] text-gray-500">{addContextLabel}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAddPanel(false)}
                        className="rounded-lg p-1 text-gray-500 hover:bg-white/10 hover:text-white"
                        aria-label="노드 추가 닫기"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid gap-3 xl:grid-cols-3">
                      <div>
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">에이전트 풀</div>
                        <div className="space-y-1.5">
                          {hiredAgents.slice(0, 4).map((agent) => (
                            <button
                              key={agent.id}
                              type="button"
                              onClick={() => appendAgentToFlow(agent)}
                              className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-2 py-2 text-left hover:border-blue-400/40 hover:bg-blue-500/10"
                            >
                              <span className="text-base">{agent.creator_avatar}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-semibold text-gray-200">{agent.name}</span>
                                <span className="block truncate text-[10px] text-gray-500">{agent.category}</span>
                              </span>
                              <Plus className="h-3.5 w-3.5 text-blue-300" />
                            </button>
                          ))}
                          {hiredAgents.length === 0 && (
                            <div className="rounded-lg bg-white/5 px-2 py-2 text-xs text-gray-500">에이전트 풀이 비어 있습니다.</div>
                          )}
                        </div>
                      </div>
                      {libraryOnlyAgents.length > 0 && (
                        <div>
                          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">내 라이브러리</div>
                          <div className="space-y-1.5">
                            {libraryOnlyAgents.slice(0, 4).map((agent) => (
                              <button
                                key={agent.id}
                                type="button"
                                onClick={() => appendAgentToFlow(agent)}
                                className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-2 py-2 text-left hover:border-cyan-400/40 hover:bg-cyan-500/10"
                              >
                                <span className="text-base">{agent.creator_avatar}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-semibold text-gray-200">{agent.name}</span>
                                  <span className="block truncate text-[10px] text-gray-500">{agent.category}</span>
                                </span>
                                <Plus className="h-3.5 w-3.5 text-cyan-300" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">플로우 유틸리티</div>
                        <div className="grid grid-cols-1 gap-1.5">
                          {CANVAS_UTILITY_NODES.map((utility) => (
                            <button
                              key={utility.kind}
                              type="button"
                              onClick={() => appendUtilityToFlow(utility)}
                              className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-2 py-2 text-left text-xs text-gray-200 hover:border-amber-400/40 hover:bg-amber-500/10"
                            >
                              <span>{utility.label}</span>
                              <GitBranch className="h-3.5 w-3.5 text-amber-300" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid flex-1 gap-3 2xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="surface-card min-w-0 rounded-2xl p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="text-sm font-bold text-white">실행 순서</div>
                      <span className="text-[11px] text-gray-500">{orderedFlowNodes.length} steps</span>
                    </div>
                    <div className="space-y-2">
                      {orderedFlowNodes.map((node, index) => {
                        const state = nodeExecutionStates[node.id] || "idle";
                        return (
                          <button
                            key={node.id}
                            type="button"
                            onClick={() => setSelectedNodeId(node.id)}
                            className={`flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                              selectedNodeId === node.id
                                ? "border-blue-400/60 bg-blue-500/10"
                                : "border-white/5 bg-white/[0.045] hover:border-white/15 hover:bg-white/[0.065]"
                            }`}
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-gray-100">{getNodeLabel(node)}</span>
                              <span className="block truncate text-[11px] text-gray-500">{getNodeCategory(node)}</span>
                            </span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${NODE_STATE_BADGE[state] || NODE_STATE_BADGE.idle}`}>
                              {state}
                            </span>
                          </button>
                        );
                      })}
                      {orderedFlowNodes.length === 0 && (
                        <div className="rounded-xl border border-dashed border-white/10 px-3 py-10 text-center text-sm text-gray-500">
                          노드를 추가하면 실행 순서가 표시됩니다.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="surface-card rounded-2xl p-3">
                      <div className="mb-2 text-sm font-bold text-white">구성 요약</div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-lg border border-white/5 bg-black/25 px-2 py-2 text-gray-300">
                          <div className="text-gray-500">Router</div>
                          <div className="mt-0.5 font-semibold text-amber-200">
                            {nodes.filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "router").length}
                          </div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/25 px-2 py-2 text-gray-300">
                          <div className="text-gray-500">Approval</div>
                          <div className="mt-0.5 font-semibold text-yellow-200">
                            {nodes.filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "hitl").length}
                          </div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/25 px-2 py-2 text-gray-300">
                          <div className="text-gray-500">반복 영역</div>
                          <div className="mt-0.5 font-semibold text-violet-100">{loopRegions.length}</div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/25 px-2 py-2 text-gray-300">
                          <div className="text-gray-500">연결</div>
                          <div className="mt-0.5 font-semibold text-cyan-100">{edges.length}</div>
                        </div>
                      </div>
                    </div>

                    <div className="surface-card rounded-2xl p-3">
                      <div className="mb-2 text-sm font-bold text-white">반복 영역</div>
                      <div className="space-y-1.5 text-[11px]">
                        {loopRegions.slice(0, 4).map((region) => (
                          <button
                            key={region.id}
                            type="button"
                            onClick={() => selectLoopRegionForEdit(region.id)}
                            className="flex w-full items-center justify-between gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-2 text-left text-violet-100 hover:border-violet-300/40"
                          >
                            <span className="min-w-0 truncate">{region.name}</span>
                            <span className="shrink-0 text-[10px] text-violet-200/70">
                              {region.nodeIds.length} nodes · {region.repeatCount}x
                            </span>
                          </button>
                        ))}
                        {loopRegions.length === 0 && (
                          <div className="rounded-lg border border-dashed border-white/10 px-2 py-4 text-center text-gray-500">
                            아직 반복 영역이 없습니다.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#090b10]/95 pt-4 backdrop-blur">
                  <div className="text-xs text-gray-500">연결, 반복, 조건은 자세히 설정에서 카드로 관리합니다.</div>
                  <button
                    type="button"
                    onClick={openFlowModal}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-colors hover:from-blue-500 hover:to-cyan-400"
                  >
                    <Maximize2 className="h-4 w-4" />
                    상세 설정 열기
                  </button>
                </div>
              </div>
            </div>

            <div className="grid h-auto min-h-44 grid-cols-1 gap-3 border-t border-white/10 bg-black/20 p-3 md:grid-cols-3">
              <div className="panel-shell min-w-0 rounded-xl p-3">
                <div className="mb-2 text-xs font-semibold text-cyan-300">연결 목록</div>
                <div className="max-h-32 space-y-1 overflow-y-auto text-[11px]">
                  {edges.map((edge) => (
                    <div key={edge.id} className="log-row flex items-center gap-2 px-2 py-1 text-gray-300">
                      <span className="truncate">{getNodeLabel(nodes.find((node) => node.id === edge.source) || ({ id: edge.source, data: {} } as Node))}</span>
                      <span className="text-gray-600">→</span>
                      <span className="truncate">{getNodeLabel(nodes.find((node) => node.id === edge.target) || ({ id: edge.target, data: {} } as Node))}</span>
                    </div>
                  ))}
                  {edges.length === 0 && <div className="text-gray-500">연결이 없습니다.</div>}
                </div>
              </div>

              <div className="panel-shell min-w-0 rounded-xl p-3">
                <div className="mb-2 text-xs font-semibold text-purple-300">노드 타입</div>
                <div className="space-y-1.5 text-[11px] text-gray-300">
                  {Array.from(new Set(nodes.map((node) => getNodeCategory(node)))).map((category) => (
                    <div key={category} className="log-row flex items-center justify-between px-2 py-1">
                      <span className="truncate">{category}</span>
                      <span className="font-semibold text-gray-100">
                        {nodes.filter((node) => getNodeCategory(node) === category).length}
                      </span>
                    </div>
                  ))}
                  {nodes.length === 0 && <div className="text-gray-500">노드가 없습니다.</div>}
                </div>
              </div>

              <div className="panel-shell min-w-0 rounded-xl p-3">
                <div className="mb-2 text-xs font-semibold text-violet-300">반복/게이트</div>
                <div className="space-y-1.5 text-[11px] text-gray-300">
                  <div className="log-row flex items-center justify-between px-2 py-1">
                    <span>반복 영역</span>
                    <span className="font-semibold text-violet-100">{loopRegions.length}</span>
                  </div>
                  <div className="log-row flex items-center justify-between px-2 py-1">
                    <span>승인 게이트</span>
                    <span className="font-semibold text-yellow-100">
                      {nodes.filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "hitl").length}
                    </span>
                  </div>
                  <div className="log-row flex items-center justify-between px-2 py-1">
                    <span>조건 라우터</span>
                    <span className="font-semibold text-amber-100">
                      {nodes.filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "router").length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
        </div>
      </div>

  );
}