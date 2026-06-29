import { type Dispatch, type SetStateAction } from "react";
import { GitBranch, Plus } from "lucide-react";
import { type Node } from "reactflow";
import { type ConditionDslContract } from "../../lib/workflow-graph";
import { type Agent } from "../../types";
import {
  CANVAS_UTILITY_NODES,
  getNodeLabel,
  type ConditionBranch,
  type FlowModalTab
} from "./studio-canvas-model";

type StudioFlowConditionsTabProps = {
  flowModalTab: FlowModalTab;
  addContextLabel: string;
  conditionNodes: Node[];
  activeConditionNode: Node | null;
  setSelectedConditionNodeId: Dispatch<SetStateAction<string>>;
  setSelectedNodeId: (nodeId: string | null) => void;
  setFlowModalTab: (tab: FlowModalTab) => void;
  activeConditionData: Record<string, any>;
  updateConditionNodeData: (patch: Record<string, any>) => void;
  activeConditionDsl: ConditionDslContract;
  conditionBranches: ConditionBranch[];
  conditionTargetNodes: Node[];
  stepIndexByNodeId: Map<string, number>;
  addConditionNode: () => void;
  addConditionBranch: () => void;
  updateConditionBranch: (branchId: string, patch: Partial<ConditionBranch>) => void;
  removeConditionBranch: (branchId: string) => void;
  applyConditionBranchConnection: (branch: ConditionBranch) => void;
  hiredAgents: Agent[];
  appendAgentToFlow: (agent: Agent) => void;
  appendUtilityToFlow: (utility: any) => void;
};

export function StudioFlowConditionsTab({
  flowModalTab,
  addContextLabel,
  conditionNodes,
  activeConditionNode,
  setSelectedConditionNodeId,
  setSelectedNodeId,
  setFlowModalTab,
  activeConditionData,
  updateConditionNodeData,
  activeConditionDsl,
  conditionBranches,
  conditionTargetNodes,
  stepIndexByNodeId,
  addConditionNode,
  addConditionBranch,
  updateConditionBranch,
  removeConditionBranch,
  applyConditionBranchConnection,
  hiredAgents,
  appendAgentToFlow,
  appendUtilityToFlow
}: StudioFlowConditionsTabProps) {
  return (
    <>
                <div className={`${flowModalTab === "conditions" ? "block" : "hidden"} mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-3`}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-amber-200" />
                      <div>
                        <div className="text-sm font-bold text-white">조건 영역</div>
                        <div className="text-[11px] text-amber-100/60">
                          조건 함수 결과에 따라 여러 경로로 분기합니다.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addConditionNode}
                      className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/15"
                    >
                      조건 노드 추가
                    </button>
                  </div>

                  {conditionNodes.length > 0 ? (
                    <div className="space-y-3">
                      <label className="block text-[11px] font-semibold text-gray-400">
                        조건 노드
                        <select
                          value={activeConditionNode?.id || ""}
                          onChange={(event) => {
                            setSelectedConditionNodeId(event.target.value);
                            setSelectedNodeId(event.target.value || null);
                          }}
                          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none focus:border-amber-500/50"
                        >
                          {conditionNodes.map((node) => (
                            <option key={node.id} value={node.id}>
                              {stepIndexByNodeId.get(node.id) || "-"} · {getNodeLabel(node)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setFlowModalTab("settings")}
                          disabled={!activeConditionNode}
                          className="mt-2 w-full rounded-lg border border-amber-400/25 bg-amber-500/10 px-2 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          선택 조건 노드 기본 설정 보기
                        </button>
                      </label>

                      {activeConditionNode ? (
                        <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
                          <label className="block text-[11px] text-gray-500">
                            조건 함수
                            <textarea
                              rows={3}
                              value={String(activeConditionData.condition_function || "")}
                              onChange={(event) => updateConditionNodeData({ condition_function: event.target.value })}
                              placeholder="예: return { route: quality >= 0.9 ? 'pass' : 'revise', notify: cost > budget }"
                              className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-[#101010] px-2 py-2 font-mono text-[11px] text-gray-200 outline-none placeholder:text-gray-700 focus:border-amber-500/50"
                            />
                          </label>

                          <div className="rounded-lg border border-amber-400/20 bg-amber-500/[0.055] p-2 text-[11px]">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="font-semibold text-amber-100">분기 런타임</span>
                              <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-amber-200">
                                {activeConditionDsl.engine}
                              </span>
                            </div>
                            <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 rounded-md bg-black/20 px-2 py-1.5">
                              <span className="font-semibold text-amber-200">선택 방식</span>
                              <span className="truncate text-gray-300">위에서부터 평가 · first match wins · else는 fallback</span>
                            </div>
                            {conditionBranches.length > 0 ? (
                              <div className="mt-1.5 space-y-1.5">
                                {conditionBranches.slice(0, 4).map((branch, index) => {
                                  const targetNode = conditionTargetNodes.find((node) => node.id === branch.targetNodeId);
                                  const actionLabel =
                                    branch.action === "node"
                                      ? targetNode
                                        ? getNodeLabel(targetNode)
                                        : "대상 노드 선택"
                                      : branch.action === "notify"
                                        ? branch.notifyMessage || "알림 발송"
                                        : "플로우 종료";
                                  return (
                                    <div
                                      key={`runtime-${branch.id}`}
                                      className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 rounded-md bg-black/20 px-2 py-1.5"
                                    >
                                      <span className="font-semibold text-amber-200">#{index + 1} {branch.action}</span>
                                      <span className="min-w-0 truncate text-gray-300">
                                        {branch.expression || "else"} → {actionLabel}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="mt-1.5 rounded-md bg-black/20 px-2 py-1.5 text-gray-500">
                                분기 경로를 추가하면 런타임 라우팅 계약이 생성됩니다.
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[11px] font-semibold text-amber-100">분기 경로</div>
                            <button
                              type="button"
                              onClick={addConditionBranch}
                              className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/15"
                            >
                              분기 추가
                            </button>
                          </div>

                          <div className="space-y-2">
                            {conditionBranches.map((branch, index) => (
                              <div key={branch.id} className="rounded-xl border border-white/10 bg-[#101010] p-2">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <div className="text-[11px] font-semibold text-gray-300">분기 {index + 1}</div>
                                  <button
                                    type="button"
                                    onClick={() => removeConditionBranch(branch.id)}
                                    className="rounded border border-red-500/25 px-1.5 py-0.5 text-[10px] text-red-200 hover:bg-red-500/10"
                                  >
                                    삭제
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <label className="text-[11px] text-gray-500">
                                    이름
                                    <input
                                      value={branch.label}
                                      onChange={(event) => updateConditionBranch(branch.id, { label: event.target.value })}
                                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none"
                                    />
                                  </label>
                                  <label className="text-[11px] text-gray-500">
                                    액션
                                    <select
                                      value={branch.action}
                                      onChange={(event) =>
                                        updateConditionBranch(branch.id, {
                                          action: event.target.value as ConditionBranch["action"]
                                        })
                                      }
                                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none"
                                    >
                                      <option value="node">다른 노드로 이동</option>
                                      <option value="end">플로우 종료</option>
                                      <option value="notify">알림</option>
                                    </select>
                                  </label>
                                </div>
                                <label className="mt-2 block text-[11px] text-gray-500">
                                  조건식
                                  <input
                                    value={branch.expression}
                                    onChange={(event) => updateConditionBranch(branch.id, { expression: event.target.value })}
                                    placeholder="예: route == 'pass' 또는 quality >= 0.9"
                                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 font-mono text-[11px] text-gray-200 outline-none placeholder:text-gray-700"
                                  />
                                </label>
                                {branch.action === "node" ? (
                                  <div className="mt-2 flex gap-2">
                                    <select
                                      value={branch.targetNodeId}
                                      onChange={(event) => updateConditionBranch(branch.id, { targetNodeId: event.target.value })}
                                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none"
                                    >
                                      <option value="">대상 노드 선택</option>
                                      {conditionTargetNodes.map((node) => (
                                        <option key={node.id} value={node.id}>
                                          {stepIndexByNodeId.get(node.id) || "-"} · {getNodeLabel(node)}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => applyConditionBranchConnection(branch)}
                                      disabled={!branch.targetNodeId}
                                      className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      연결
                                    </button>
                                  </div>
                                ) : branch.action === "notify" ? (
                                  <label className="mt-2 block text-[11px] text-gray-500">
                                    알림 메시지
                                    <input
                                      value={branch.notifyMessage}
                                      onChange={(event) => updateConditionBranch(branch.id, { notifyMessage: event.target.value })}
                                      placeholder="예: 품질 기준 미달, 리뷰 요청"
                                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700"
                                    />
                                  </label>
                                ) : (
                                  <div className="mt-2 rounded-lg bg-black/25 px-2 py-2 text-[11px] text-gray-400">
                                    조건이 맞으면 이 지점에서 플로우를 종료합니다.
                                  </div>
                                )}
                              </div>
                            ))}
                            {conditionBranches.length === 0 && (
                              <div className="rounded-xl border border-dashed border-amber-400/20 px-3 py-4 text-center text-xs text-amber-100/50">
                                아직 분기 경로가 없습니다.
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-amber-400/20 px-3 py-5 text-center text-xs text-amber-100/50">
                      조건 노드를 추가하면 분기 경로를 여러 갈래로 설정할 수 있습니다.
                    </div>
                  )}
                </div>

                <div className={`${flowModalTab === "conditions" ? "block" : "hidden"} border-t border-white/10 pt-4`}>
                  <div className="mb-2 text-sm font-bold">빠른 추가</div>
                  <div className="mb-3 text-[11px] text-gray-500">{addContextLabel}</div>
                  <div className="space-y-1.5">
                    {hiredAgents.slice(0, 4).map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => appendAgentToFlow(agent)}
                        className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-2 py-2 text-left hover:border-blue-400/40 hover:bg-blue-500/10"
                      >
                        <span className="text-base">{agent.creator_avatar}</span>
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-200">{agent.name}</span>
                        <Plus className="h-3.5 w-3.5 text-blue-300" />
                      </button>
                    ))}
                    {CANVAS_UTILITY_NODES.map((utility) => (
                      <button
                        key={utility.kind}
                        type="button"
                        onClick={() => appendUtilityToFlow(utility)}
                        className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/5 px-2 py-2 text-left text-xs text-gray-200 hover:border-amber-400/40 hover:bg-amber-500/10"
                      >
                        <span>{utility.label}</span>
                        <GitBranch className="h-3.5 w-3.5 text-amber-300" />
                      </button>
                    ))}
                  </div>
                </div>
    </>
  );
}