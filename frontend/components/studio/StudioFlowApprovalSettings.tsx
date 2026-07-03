import Link from "next/link";
import { type ApprovalChannelId } from "../../lib/api";
import {
  APPROVAL_CHANNEL_OPTIONS,
  approvalChannelStateClass,
  type StudioApprovalChannelState
} from "./studio-canvas-model";

type StudioFlowApprovalSettingsProps = {
  selectedNodeData: Record<string, any>;
  updateSelectedNodeData: (patch: Record<string, any>) => void;
  selectedApprovalChannels: string[];
  approvalChannelStates: Record<ApprovalChannelId, StudioApprovalChannelState>;
  toggleSelectedApprovalChannel: (channel: ApprovalChannelId) => void;
  selectedUnreadyApprovalChannels: string[];
};

export function StudioFlowApprovalSettings({
  selectedNodeData,
  updateSelectedNodeData,
  selectedApprovalChannels,
  approvalChannelStates,
  toggleSelectedApprovalChannel,
  selectedUnreadyApprovalChannels
}: StudioFlowApprovalSettingsProps) {
  return (
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
          const channelSelectable = active || channel.id === "admin_queue" || channelState.tone === "ready";
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
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${approvalChannelStateClass(channelState.tone)}`}
                >
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
  );
}
