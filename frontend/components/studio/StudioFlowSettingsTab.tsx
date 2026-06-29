import Link from "next/link";
import { Clock3, GitBranch, Settings, ShieldCheck, Zap } from "lucide-react";
import { type Node } from "reactflow";
import { type ApprovalChannelId } from "../../lib/api";
import { type ConditionDslContract } from "../../lib/workflow-graph";
import {
  APPROVAL_CHANNEL_OPTIONS,
  approvalChannelStateClass,
  conditionCheckLabel,
  describeConditionCheck,
  type FlowModalTab,
  type StudioApprovalChannelState
} from "./studio-canvas-model";

type StudioFlowSettingsTabProps = {
  flowModalTab: FlowModalTab;
  selectedNode: Node | null;
  selectedNodeLabel: string;
  selectedNodeData: Record<string, any>;
  stepIndexByNodeId: Map<string, number>;
  updateSelectedNodeData: (patch: Record<string, any>) => void;
  selectedApprovalChannels: string[];
  approvalChannelStates: Record<ApprovalChannelId, StudioApprovalChannelState>;
  toggleSelectedApprovalChannel: (channel: ApprovalChannelId) => void;
  selectedUnreadyApprovalChannels: string[];
  selectedConditionMode: string;
  updateSelectedConditionMode: (mode: string) => void;
  selectedConditionDsl: ConditionDslContract;
  setFlowModalTab: (tab: FlowModalTab) => void;
};

export function StudioFlowSettingsTab({
  flowModalTab,
  selectedNode,
  selectedNodeLabel,
  selectedNodeData,
  stepIndexByNodeId,
  updateSelectedNodeData,
  selectedApprovalChannels,
  approvalChannelStates,
  toggleSelectedApprovalChannel,
  selectedUnreadyApprovalChannels,
  selectedConditionMode,
  updateSelectedConditionMode,
  selectedConditionDsl,
  setFlowModalTab
}: StudioFlowSettingsTabProps) {
  return (
                <div className={`${flowModalTab === "settings" ? "block" : "hidden"} mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Settings className="h-4 w-4 text-blue-300" />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white">선택 노드 설정</div>
                        <div className="truncate text-[11px] text-gray-500">
                          {selectedNode ? selectedNodeLabel : "단계 카드에서 노드를 선택하세요"}
                        </div>
                      </div>
                    </div>
                    {selectedNode ? (
                      <span className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[10px] text-gray-400">
                        step {selectedNodeData.step_index || stepIndexByNodeId.get(selectedNode.id) || "-"}
                      </span>
                    ) : null}
                  </div>

                  {selectedNode ? (
                    <div className="space-y-3">
                      <label className="block text-[11px] font-semibold text-gray-400">
                        이름
                        <input
                          value={String(selectedNodeData.label || "")}
                          onChange={(event) => updateSelectedNodeData({ label: event.target.value })}
                          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-white outline-none focus:border-blue-500/50"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => updateSelectedNodeData({ execution_mode: "auto" })}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold ${
                            selectedNodeData.execution_mode === "auto"
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                              : "border-white/10 bg-black/30 text-gray-400 hover:text-white"
                          }`}
                        >
                          <Zap className="h-3.5 w-3.5" />
                          자동 실행
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedNodeData({ execution_mode: "confirm", approval_channels: selectedApprovalChannels.length > 0 ? selectedApprovalChannels : ["admin_queue"] })}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold ${
                            selectedNodeData.execution_mode === "confirm"
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                              : "border-white/10 bg-black/30 text-gray-400 hover:text-white"
                          }`}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          승인 후 실행
                        </button>
                      </div>

                      {selectedNodeData.execution_mode === "confirm" ? (
                        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-2.5">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                              <div className="text-xs font-semibold text-amber-100">승인 방식</div>
                              <div className="mt-0.5 text-[10px] text-amber-100/55">
                                선택한 채널은 Human Gate 대기 큐와 외부 알림에 같이 사용됩니다.
                              </div>
                            </div>
                            <Link
                              href="/mypage?tab=approval"
                              className="rounded-lg border border-amber-400/20 bg-black/25 px-2 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/10"
                            >
                              채널 설정
                            </Link>
                          </div>
                          <select
                            value={String(selectedNodeData.approval_gate_stage || "after_result")}
                            onChange={(event) => updateSelectedNodeData({ approval_gate_stage: event.target.value })}
                            className="mb-2 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none focus:border-amber-500/50"
                          >
                            <option value="after_result">결과 확인 후 다음 단계 진행</option>
                            <option value="before_run">이 노드 실행 전 승인</option>
                            <option value="both">실행 전 + 결과 확인 모두 승인</option>
                          </select>
                          <div className="grid grid-cols-2 gap-2">
                            {APPROVAL_CHANNEL_OPTIONS.map((channel) => {
                              const Icon = channel.icon;
                              const active = selectedApprovalChannels.includes(channel.id);
                              const channelState = approvalChannelStates[channel.id];
                              const channelSelectable =
                                active || channel.id === "admin_queue" || channelState.tone === "ready";
                              return (
                                <button
                                  key={channel.id}
                                  type="button"
                                  disabled={!channelSelectable}
                                  title={
                                    channelSelectable
                                      ? `${channel.label} 승인 채널`
                                      : `${channel.label} 채널은 내 공간에서 먼저 설정해야 합니다`
                                  }
                                  aria-label={`${channel.label} 승인 채널 ${active ? "선택됨" : channelSelectable ? "선택 가능" : "설정 필요"}`}
                                  onClick={() => toggleSelectedApprovalChannel(channel.id)}
                                  className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                                    active
                                      ? "border-amber-400/50 bg-amber-500/15 text-amber-50"
                                      : !channelSelectable
                                        ? "cursor-not-allowed border-white/5 bg-black/20 text-gray-600 opacity-70"
                                      : "border-white/10 bg-black/20 text-gray-500 hover:border-white/20 hover:text-gray-300"
                                  }`}
                                >
                                  <span className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold">
                                      <Icon className="h-3.5 w-3.5 shrink-0" />
                                      <span className="truncate">{channel.label}</span>
                                    </span>
                                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${approvalChannelStateClass(channelState.tone)}`}>
                                      {channelState.label}
                                    </span>
                                  </span>
                                  <span className="mt-1 block line-clamp-2 text-[10px] leading-relaxed opacity-70">
                                    {channel.description}
                                  </span>
                                  <span className="mt-1 block truncate text-[10px] text-gray-500">
                                    {channelState.transport} · {channelState.detail}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {selectedUnreadyApprovalChannels.length > 0 ? (
                            <div className="mt-2 rounded-lg border border-amber-400/25 bg-amber-500/10 px-2 py-2 text-[11px] leading-relaxed text-amber-100/85">
                              {selectedUnreadyApprovalChannels
                                .map((channel) => APPROVAL_CHANNEL_OPTIONS.find((option) => option.id === channel)?.label || channel)
                                .join(", ")}{" "}
                              채널은 아직 발송 설정이 부족합니다. 실행 시 큐에는 남지만 외부 전송은 대기/실패로 표시될 수 있습니다.
                            </div>
                          ) : null}
                          <input
                            value={String(selectedNodeData.approval_target || "")}
                            onChange={(event) => updateSelectedNodeData({ approval_target: event.target.value })}
                            placeholder="승인 담당/대상: admin@company.com, 운영 관리자, 카카오 채널명"
                            className="mt-2 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-amber-500/50"
                          />
                        </div>
                      ) : null}

                      <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-200">
                          <GitBranch className="h-3.5 w-3.5" />
                          조건
                        </div>
                        <select
                          value={selectedConditionMode}
                          onChange={(event) => updateSelectedConditionMode(event.target.value)}
                          className="mb-2 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none"
                        >
                          <option value="always">항상 실행</option>
                          <option value="time">시간 조건</option>
                          <option value="data">데이터 조건</option>
                          <option value="composite">시간 + 데이터 조건</option>
                          <option value="condition">직접 조건식</option>
                        </select>
                        {(selectedConditionMode === "time" || selectedConditionMode === "composite") ? (
                          <div className="mb-2 rounded-lg border border-blue-500/15 bg-blue-500/[0.06] p-2">
                            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-blue-200">
                              <Clock3 className="h-3.5 w-3.5" />
                              시간 조건
                            </div>
                            <input
                              value={String(selectedNodeData.condition_time_rule || "")}
                              onChange={(event) => updateSelectedNodeData({ condition_time_rule: event.target.value })}
                              placeholder="예: 평일 09:00-18:00, 매일 10:00 이후"
                              className="mb-2 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-blue-500/50"
                            />
                            <select
                              value={String(selectedNodeData.condition_timezone || "Asia/Seoul")}
                              onChange={(event) => updateSelectedNodeData({ condition_timezone: event.target.value })}
                              className="w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none focus:border-blue-500/50"
                            >
                              <option value="Asia/Seoul">Asia/Seoul</option>
                              <option value="UTC">UTC</option>
                              <option value="America/Los_Angeles">America/Los_Angeles</option>
                            </select>
                          </div>
                        ) : null}
                        {(selectedConditionMode === "data" || selectedConditionMode === "composite") ? (
                          <div className="mb-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] p-2">
                            <div className="mb-1 text-[11px] font-semibold text-emerald-200">데이터 조건</div>
                            <div className="grid grid-cols-[1fr_76px] gap-2">
                              <input
                                value={String(selectedNodeData.condition_data_path || "")}
                                onChange={(event) => updateSelectedNodeData({ condition_data_path: event.target.value })}
                                placeholder="예: result.quality_score"
                                className="rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-emerald-500/50"
                              />
                              <select
                                value={String(selectedNodeData.condition_operator || ">=")}
                                onChange={(event) => updateSelectedNodeData({ condition_operator: event.target.value })}
                                className="rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none focus:border-emerald-500/50"
                              >
                                <option value=">=">&gt;=</option>
                                <option value=">">&gt;</option>
                                <option value="==">==</option>
                                <option value="!=">!=</option>
                                <option value="<">&lt;</option>
                                <option value="<=">&lt;=</option>
                                <option value="contains">contains</option>
                              </select>
                            </div>
                            <input
                              value={String(selectedNodeData.condition_value || "")}
                              onChange={(event) => updateSelectedNodeData({ condition_value: event.target.value })}
                              placeholder="예: 0.9 또는 approved"
                              className="mt-2 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-emerald-500/50"
                            />
                          </div>
                        ) : null}
                        {(selectedConditionMode === "condition" || selectedConditionMode === "composite") ? (
                          <input
                            value={String(selectedNodeData.condition_expression || "")}
                            onChange={(event) => updateSelectedNodeData({ condition_expression: event.target.value })}
                            placeholder="예: risk_score > 0.7 또는 previous.status == 'failed'"
                            className="w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-amber-500/50"
                          />
                        ) : null}
                        <div className="mt-2 rounded-lg border border-cyan-400/15 bg-cyan-500/[0.045] p-2">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-cyan-100">런타임 평가</span>
                            <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-cyan-200">
                              {selectedConditionDsl.engine}
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {selectedConditionDsl.checks.map((check, index) => (
                              <div
                                key={`${check.kind}-${index}`}
                                className="grid grid-cols-[82px_minmax(0,1fr)] gap-2 rounded-md bg-black/20 px-2 py-1.5 text-[11px]"
                              >
                                <span className="font-semibold text-cyan-200">{conditionCheckLabel(check)}</span>
                                <span className="min-w-0 truncate text-gray-300">{describeConditionCheck(check)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                            <div className="rounded-md bg-black/20 px-2 py-1.5 text-emerald-100">
                              true → {selectedConditionDsl.on_true === "approval_gate" ? "승인 게이트" : "실행"}
                            </div>
                            <div className="rounded-md bg-black/20 px-2 py-1.5 text-gray-400">
                              false → {selectedConditionDsl.on_false}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-2.5 py-2 text-[11px] leading-relaxed text-violet-100/80">
                        반복은 단계 카드에서 여러 노드를 선택한 뒤 반복 영역으로 설정합니다.
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setFlowModalTab("routes")}
                          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/15"
                        >
                          연결/반복 설정
                        </button>
                        <button
                          type="button"
                          onClick={() => setFlowModalTab("conditions")}
                          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/15"
                        >
                          조건/추가 설정
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-gray-500">
                      노드를 클릭하면 설정, 조건, 반복, 연결 작업이 표시됩니다.
                    </div>
                  )}
                </div>


  );
}