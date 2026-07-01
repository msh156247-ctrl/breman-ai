"use client";

import {
  AlignLeft,
  CheckCircle,
  Mail,
  MessageCircle,
  Settings,
  ShieldCheck,
  Smartphone,
  Zap
} from "lucide-react";
import { useAppStore } from "../../stores/app.store";
import { ConfigPanelConditionSection } from "./ConfigPanelConditionSection";

export default function ConfigPanel() {
  const { nodes, selectedNodeId, updateNodeData, nodeExecutionStates } = useAppStore();
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedExecutionState = selectedNode ? nodeExecutionStates[selectedNode.id] || "idle" : "idle";
  const selectedData = (selectedNode?.data as any) || {};
  const executionMode = String(selectedData.execution_mode || "auto");
  const approvalChannels: string[] = Array.isArray(selectedData.approval_channels)
    ? selectedData.approval_channels
    : ["admin_queue"];
  const approvalChannelOptions = [
    { id: "admin_queue", label: "관리자 대기열", description: "관리자 페이지에서 승인 대기", icon: ShieldCheck },
    { id: "email", label: "이메일", description: "승인 요청 메일 발송", icon: Mail },
    { id: "sms", label: "문자", description: "SMS로 즉시 알림", icon: Smartphone },
    { id: "kakao", label: "카톡", description: "카카오 알림톡/채널 알림", icon: MessageCircle }
  ];
  const toggleApprovalChannel = (channelId: string) => {
    if (!selectedNodeId) return;
    const nextChannels = approvalChannels.includes(channelId)
      ? approvalChannels.filter((id) => id !== channelId)
      : [...approvalChannels, channelId];
    updateNodeData(selectedNodeId, {
      approval_channels: nextChannels.length > 0 ? nextChannels : ["admin_queue"]
    });
  };
  if (!selectedNode) {
    return (
      <div className="relative flex min-h-0 w-full flex-1 shrink-0 flex-col items-center justify-center overflow-hidden border-t border-white/10 bg-[#080a0f]/90 p-6 text-center text-gray-500 2xl:w-80 2xl:flex-none 2xl:border-l 2xl:border-t-0">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(59,130,246,0.12),transparent_34%),radial-gradient(circle_at_80%_70%,rgba(16,185,129,0.08),transparent_32%)]" />
        <div className="panel-shell relative w-full max-w-[250px] p-5">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-blue-200 shadow-lg shadow-blue-500/10">
            <Settings className="h-5 w-5" />
          </div>
          <h3 className="mb-2 font-bold text-gray-100">설정 대기</h3>
          <p className="text-sm leading-relaxed text-gray-500">
            노드나 반복 프레임을 선택하면 실행 조건과 연결 옵션이 열립니다.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="h-12 rounded-xl border border-white/[0.08] bg-white/[0.04]" />
            <div className="h-12 rounded-xl border border-blue-400/20 bg-blue-500/10" />
            <div className="h-12 rounded-xl border border-white/[0.08] bg-white/[0.04]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full shrink-0 flex-col border-t border-white/10 bg-[#080a0f]/90 2xl:w-80 2xl:border-l 2xl:border-t-0">
      <div className="relative overflow-hidden border-b border-white/10 p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-blue-500/10 to-transparent" />
        <div className="relative flex items-center space-x-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-2xl shadow-sm shadow-black/20">{String((selectedNode.data as any).avatar || "🤖")}</div>
        <div>
          <h2 className="font-bold text-white">{String((selectedNode.data as any).label || "AI")}</h2>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
            <span>실행 유닛 설정</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                selectedExecutionState === "completed"
                  ? "border border-emerald-500/40 bg-emerald-900/40 text-emerald-200"
                  : selectedExecutionState === "failed"
                    ? "border border-rose-500/40 bg-rose-900/40 text-rose-200"
                    : selectedExecutionState === "running" || selectedExecutionState === "streaming"
                      ? "border border-blue-500/40 bg-blue-900/40 text-blue-200"
                      : selectedExecutionState === "waiting_input"
                        ? "border border-yellow-500/40 bg-yellow-900/40 text-yellow-200"
                        : "border border-gray-600/50 bg-gray-900/50 text-gray-300"
              }`}
            >
              {selectedExecutionState}
            </span>
          </div>
        </div>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        <div>
          <label className="mb-2 block text-xs font-semibold text-gray-400">역할 이름 (별칭)</label>
          <input
            type="text"
            value={String((selectedNode.data as any).label || "")}
            onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-500/50"
          />
        </div>

        <div>
          <label className="mb-3 block text-xs font-semibold text-gray-400">실행 모드</label>
          <div className="space-y-2">
            <button
              onClick={() => updateNodeData(selectedNode.id, { execution_mode: "auto" })}
              className={`w-full rounded-xl border p-3 transition-all ${
                executionMode === "auto"
                  ? "border-green-500/30 bg-green-500/10 text-green-400"
                  : "border-white/10 bg-white/[0.045] text-gray-400 hover:border-white/20 hover:bg-white/[0.065]"
              }`}
            >
              <div className="flex items-center space-x-3">
                <Zap className="h-4 w-4" />
                <div className="text-left">
                  <div className="text-sm font-medium">자동 실행</div>
                  <div className="text-xs opacity-70">승인 없이 바로 실행</div>
                </div>
              </div>
            </button>
            <button
              onClick={() => updateNodeData(selectedNode.id, { execution_mode: "confirm" })}
              className={`w-full rounded-xl border p-3 transition-all ${
                executionMode === "confirm"
                  ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                  : "border-white/10 bg-white/[0.045] text-gray-400 hover:border-white/20 hover:bg-white/[0.065]"
              }`}
            >
              <div className="flex items-center space-x-3">
                <CheckCircle className="h-4 w-4" />
                <div className="text-left">
                  <div className="text-sm font-medium">승인 후 실행</div>
                  <div className="text-xs opacity-70">결과 확인 후 다음 단계</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {executionMode === "confirm" && (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.06] p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-yellow-100">승인 수신/처리</div>
              <span className="rounded bg-black/25 px-2 py-1 text-[10px] font-semibold text-yellow-200">
                {approvalChannels.length} channels
              </span>
            </div>
            <label className="mb-2 block text-xs text-gray-500">승인 시점</label>
            <select
              value={String(selectedData.approval_gate_stage || "after_result")}
              onChange={(e) => updateNodeData(selectedNode.id, { approval_gate_stage: e.target.value })}
              className="mb-3 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none focus:border-yellow-500/50"
            >
              <option value="after_result">결과 확인 후 다음 단계 진행</option>
              <option value="before_run">이 노드 실행 전 승인 필요</option>
              <option value="both">실행 전 + 결과 확인 모두 승인</option>
            </select>
            <div className="mb-2 text-xs text-gray-500">승인 요청 받을 곳</div>
            <div className="grid grid-cols-2 gap-2">
              {approvalChannelOptions.map((channel) => {
                const Icon = channel.icon;
                const active = approvalChannels.includes(channel.id);
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => toggleApprovalChannel(channel.id)}
                    className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                      active
                        ? "border-yellow-400/40 bg-yellow-500/15 text-yellow-100"
                        : "border-white/10 bg-black/20 text-gray-500 hover:border-white/20 hover:text-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <Icon className="h-3.5 w-3.5" />
                      {channel.label}
                    </div>
                    <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed opacity-70">{channel.description}</div>
                  </button>
                );
              })}
            </div>
            <label className="mt-3 block text-xs text-gray-500">승인 담당/대상</label>
            <input
              value={String(selectedData.approval_target || "")}
              onChange={(e) => updateNodeData(selectedNode.id, { approval_target: e.target.value })}
              placeholder="예: admin@company.com, 운영 관리자, 카카오 채널명"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-yellow-500/50"
            />
            <div className="mt-2 rounded-lg border border-yellow-500/15 bg-black/20 px-2 py-2 text-[11px] leading-relaxed text-yellow-100/75">
              관리자 대기열을 선택하면 승인 요청은 운영자가 처리할 항목으로 남고, 승인 후 다음 노드로 진행하는 정책으로 저장됩니다.
            </div>
          </div>
        )}

        <ConfigPanelConditionSection
          selectedNode={selectedNode}
          selectedData={selectedData}
          executionMode={executionMode}
          nodes={nodes}
          updateNodeData={updateNodeData}
        />

        <div>
          <label className="mb-3 flex items-center text-xs font-semibold text-gray-400">
            <AlignLeft className="mr-2 h-3.5 w-3.5" />
            시스템 프롬프트 (지시사항)
          </label>
          <textarea
            value={String((selectedNode.data as any).system_prompt || "")}
            onChange={(e) => updateNodeData(selectedNode.id, { system_prompt: e.target.value })}
            rows={6}
            placeholder="이 실행 유닛이 수행할 역할/책임/지시사항을 적어주세요..."
            className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none placeholder:text-gray-700 focus:border-blue-500/50"
          />
          <div className="mt-2 text-xs text-gray-600">💡 구체적인 지시사항을 작성하면 더 정확한 결과를 얻을 수 있어요</div>
        </div>

      </div>
    </div>
  );
}
