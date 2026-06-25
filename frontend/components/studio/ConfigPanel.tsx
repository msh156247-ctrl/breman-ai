"use client";

import {
  AlignLeft,
  Bell,
  CheckCircle,
  CircleStop,
  Clock3,
  GitBranch,
  Link2,
  Mail,
  MessageCircle,
  Plus,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  Zap
} from "lucide-react";
import { useAppStore } from "../../stores/app.store";

type ConditionBranchAction = "node" | "end" | "notify";

type ConditionBranchDraft = {
  id: string;
  label: string;
  expression: string;
  action: ConditionBranchAction;
  targetNodeId: string;
  notifyMessage: string;
};

function normalizeConditionBranches(value: unknown): ConditionBranchDraft[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const rawAction = String(row.action || "node");
    const action: ConditionBranchAction =
      rawAction === "end" || rawAction === "notify" || rawAction === "node" ? rawAction : "node";
    return {
      id: String(row.id || `branch-${index + 1}`),
      label: String(row.label || `분기 ${index + 1}`),
      expression: String(row.expression || row.condition_expression || (index === 0 ? "true" : "else")),
      action,
      targetNodeId: String(row.targetNodeId || row.target_node_id || ""),
      notifyMessage: String(row.notifyMessage || row.notify_message || "")
    };
  });
}

function serializeConditionBranches(branches: ConditionBranchDraft[]) {
  return branches.map((branch, index) => ({
    id: branch.id,
    label: branch.label.trim() || `분기 ${index + 1}`,
    expression: branch.expression.trim() || (index === 0 ? "true" : "else"),
    action: branch.action,
    ...(branch.action === "node" && branch.targetNodeId ? { targetNodeId: branch.targetNodeId } : {}),
    ...(branch.action === "notify" && branch.notifyMessage.trim()
      ? { notifyMessage: branch.notifyMessage.trim() }
      : {})
  }));
}

function newConditionBranchId() {
  return `branch_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
}

export default function ConfigPanel() {
  const { nodes, selectedNodeId, updateNodeData, nodeExecutionStates } = useAppStore();
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedExecutionState = selectedNode ? nodeExecutionStates[selectedNode.id] || "idle" : "idle";
  const selectedData = (selectedNode?.data as any) || {};
  const conditionMode = String(
    selectedData.condition_mode || (String(selectedData.condition_expression || "").trim() ? "condition" : "always")
  );
  const executionMode = String(selectedData.execution_mode || "auto");
  const approvalChannels: string[] = Array.isArray(selectedData.approval_channels)
    ? selectedData.approval_channels
    : ["admin_queue"];
  const conditionBranches = normalizeConditionBranches(selectedData.condition_branches);
  const branchTargetNodes = selectedNode ? nodes.filter((node) => node.id !== selectedNode.id) : [];
  const approvalChannelOptions = [
    { id: "admin_queue", label: "관리자 대기열", description: "관리자 페이지에서 승인 대기", icon: ShieldCheck },
    { id: "email", label: "이메일", description: "승인 요청 메일 발송", icon: Mail },
    { id: "sms", label: "문자", description: "SMS로 즉시 알림", icon: Smartphone },
    { id: "kakao", label: "카톡", description: "카카오 알림톡/채널 알림", icon: MessageCircle }
  ];
  const conditionModeLabels: Record<string, string> = {
    always: "항상 실행",
    time: "시간 조건",
    data: "데이터 조건",
    composite: "시간 + 데이터 조건",
    condition: "직접 조건식"
  };
  const updateConditionMode = (mode: string) => {
    if (!selectedNodeId) return;
    updateNodeData(selectedNodeId, {
      condition_mode: mode,
      condition_expression:
        mode === "always"
          ? ""
          : mode === "composite"
            ? String(selectedData.condition_expression || "time.in_window == true && payload.status == 'ready'")
            : mode === "condition"
              ? String(selectedData.condition_expression || "risk_score > 0.7")
              : String(selectedData.condition_expression || "")
    });
  };
  const toggleApprovalChannel = (channelId: string) => {
    if (!selectedNodeId) return;
    const nextChannels = approvalChannels.includes(channelId)
      ? approvalChannels.filter((id) => id !== channelId)
      : [...approvalChannels, channelId];
    updateNodeData(selectedNodeId, {
      approval_channels: nextChannels.length > 0 ? nextChannels : ["admin_queue"]
    });
  };
  const commitConditionBranches = (branches: ConditionBranchDraft[], patch?: Record<string, unknown>) => {
    if (!selectedNodeId) return;
    updateNodeData(selectedNodeId, {
      condition_branches: serializeConditionBranches(branches),
      ...patch
    });
  };
  const addConditionBranch = () => {
    const targetNodeId = branchTargetNodes[0]?.id || "";
    commitConditionBranches(
      [
        ...conditionBranches,
        {
          id: newConditionBranchId(),
          label: `분기 ${conditionBranches.length + 1}`,
          expression: conditionBranches.length === 0 ? "true" : "else",
          action: targetNodeId ? "node" : "end",
          targetNodeId,
          notifyMessage: ""
        }
      ],
      conditionMode === "always" ? { condition_mode: "condition" } : undefined
    );
  };
  const updateConditionBranch = (branchId: string, patch: Partial<ConditionBranchDraft>) => {
    commitConditionBranches(conditionBranches.map((branch) => (branch.id === branchId ? { ...branch, ...patch } : branch)));
  };
  const removeConditionBranch = (branchId: string) => {
    commitConditionBranches(conditionBranches.filter((branch) => branch.id !== branchId));
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

        <div className="surface-card rounded-xl p-3">
          <div className="mb-3 text-xs font-semibold text-gray-400">조건</div>
          <label className="mb-2 block text-xs text-gray-500">실행 조건</label>
          <select
            value={conditionMode}
            onChange={(e) => updateConditionMode(e.target.value)}
            className="mb-3 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none focus:border-amber-500/50"
          >
            <option value="always">항상 실행</option>
            <option value="time">시간 조건</option>
            <option value="data">데이터 조건</option>
            <option value="composite">시간 + 데이터 조건</option>
            <option value="condition">직접 조건식</option>
          </select>
          {(conditionMode === "time" || conditionMode === "composite") && (
            <div className="mb-3 rounded-lg border border-blue-500/15 bg-blue-500/[0.06] p-2">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-blue-200">
                <Clock3 className="h-3.5 w-3.5" />
                시간 조건
              </div>
              <input
                value={String(selectedData.condition_time_rule || "")}
                onChange={(e) => updateNodeData(selectedNode.id, { condition_time_rule: e.target.value })}
                placeholder="예: 평일 09:00-18:00, 매일 10:00 이후"
                className="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-blue-500/50"
              />
              <select
                value={String(selectedData.condition_timezone || "Asia/Seoul")}
                onChange={(e) => updateNodeData(selectedNode.id, { condition_timezone: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none focus:border-blue-500/50"
              >
                <option value="Asia/Seoul">Asia/Seoul</option>
                <option value="UTC">UTC</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
              </select>
            </div>
          )}
          {(conditionMode === "data" || conditionMode === "composite") && (
            <div className="mb-3 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] p-2">
              <div className="mb-2 text-xs font-semibold text-emerald-200">데이터 조건</div>
              <div className="grid grid-cols-[1fr_82px] gap-2">
                <input
                  value={String(selectedData.condition_data_path || "")}
                  onChange={(e) => updateNodeData(selectedNode.id, { condition_data_path: e.target.value })}
                  placeholder="예: result.quality_score"
                  className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-emerald-500/50"
                />
                <select
                  value={String(selectedData.condition_operator || ">=")}
                  onChange={(e) => updateNodeData(selectedNode.id, { condition_operator: e.target.value })}
                  className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none focus:border-emerald-500/50"
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
                value={String(selectedData.condition_value || "")}
                onChange={(e) => updateNodeData(selectedNode.id, { condition_value: e.target.value })}
                placeholder="예: 0.9 또는 approved"
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-emerald-500/50"
              />
            </div>
          )}
          {(conditionMode === "condition" || conditionMode === "composite") && (
            <input
              value={String(selectedData.condition_expression || "")}
              onChange={(e) => updateNodeData(selectedNode.id, { condition_expression: e.target.value })}
              placeholder="예: risk_score > 0.7 또는 previous.status == 'failed'"
              className="mb-3 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-amber-500/50"
            />
          )}
          <div className="mb-3 rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-[11px] leading-relaxed text-gray-500">
            현재 정책: <span className="font-semibold text-gray-300">{conditionModeLabels[conditionMode] || "직접 조건식"}</span>
            {executionMode === "auto" ? "을 만족할 때 자동 실행합니다." : "을 만족한 뒤 승인 정책을 적용합니다."}
          </div>
          <div className="mb-3 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-100">
                <GitBranch className="h-3.5 w-3.5" />
                조건 분기
              </div>
              <button
                type="button"
                onClick={addConditionBranch}
                className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
              >
                <Plus className="h-3.5 w-3.5" />
                추가
              </button>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-cyan-100/65">
              조건 함수가 맞으면 특정 노드로 이동하고, 맞지 않으면 다른 분기나 종료/알림으로 보낼 수 있습니다.
            </p>
            {conditionBranches.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-3 py-4 text-center text-xs text-gray-500">
                아직 분기가 없습니다. 조건 라우터나 승인 게이트가 여러 경로를 가져야 할 때 추가하세요.
              </div>
            ) : (
              <div className="space-y-2">
                {conditionBranches.map((branch, index) => (
                  <div key={branch.id} className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-black text-cyan-100">
                          {index + 1}
                        </span>
                        <input
                          value={branch.label}
                          onChange={(e) => updateConditionBranch(branch.id, { label: e.target.value })}
                          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs font-semibold text-gray-100 outline-none focus:border-cyan-400/50"
                        />
                      </div>
                      <button
                        type="button"
                        title="분기 삭제"
                        onClick={() => removeConditionBranch(branch.id)}
                        className="rounded-lg border border-red-500/20 bg-red-500/10 p-1.5 text-red-200 transition hover:bg-red-500/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <label className="mb-1 block text-[11px] text-gray-500">조건 함수</label>
                    <input
                      value={branch.expression}
                      onChange={(e) => updateConditionBranch(branch.id, { expression: e.target.value })}
                      placeholder="예: result.quality >= 0.9 또는 else"
                      className="mb-2 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 font-mono text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-cyan-400/50"
                    />
                    <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
                      <select
                        value={branch.action}
                        onChange={(e) => {
                          const action = e.target.value as ConditionBranchAction;
                          updateConditionBranch(branch.id, {
                            action,
                            targetNodeId: action === "node" ? branch.targetNodeId || branchTargetNodes[0]?.id || "" : "",
                            notifyMessage: action === "notify" ? branch.notifyMessage : ""
                          });
                        }}
                        className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none focus:border-cyan-400/50"
                      >
                        <option value="node">노드로 이동</option>
                        <option value="end">흐름 종료</option>
                        <option value="notify">알림 보내기</option>
                      </select>
                      {branch.action === "node" ? (
                        <div className="relative">
                          <Link2 className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-200/60" />
                          <select
                            value={branch.targetNodeId}
                            onChange={(e) => updateConditionBranch(branch.id, { targetNodeId: e.target.value })}
                            className="w-full rounded-lg border border-white/10 bg-black/30 py-2 pl-7 pr-2 text-xs text-gray-200 outline-none focus:border-cyan-400/50"
                          >
                            <option value="">연결할 노드 선택</option>
                            {branchTargetNodes.map((node) => (
                              <option key={node.id} value={node.id}>
                                {String((node.data as any)?.label || node.id)}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : branch.action === "notify" ? (
                        <div className="relative">
                          <Bell className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-200/60" />
                          <input
                            value={branch.notifyMessage}
                            onChange={(e) => updateConditionBranch(branch.id, { notifyMessage: e.target.value })}
                            placeholder="예: 품질 기준 미달 알림"
                            className="w-full rounded-lg border border-white/10 bg-black/30 py-2 pl-7 pr-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-cyan-400/50"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-gray-400">
                          <CircleStop className="h-3.5 w-3.5 text-red-200/70" />
                          조건 만족 시 워크플로우를 종료합니다.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-2 text-[11px] leading-relaxed text-violet-100/80">
            반복은 플로우 자세히 보기에서 마우스로 노드 영역을 선택한 뒤 반복 영역으로 설정합니다.
          </div>
        </div>

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
