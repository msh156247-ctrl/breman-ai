import { Settings, ShieldCheck, Zap } from "lucide-react";
import { type Node } from "reactflow";
import { type ApprovalChannelId } from "../../lib/api";
import { type ConditionDslContract } from "../../lib/workflow-graph";
import { type FlowModalTab, type StudioApprovalChannelState } from "./studio-canvas-model";
import { StudioFlowApprovalSettings } from "./StudioFlowApprovalSettings";
import { StudioFlowConditionSettings } from "./StudioFlowConditionSettings";

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
  const isSelected = flowModalTab === "settings";

  return (
    <div className={`${isSelected ? "block" : "hidden"} mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3`}>
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
              onClick={() =>
                updateSelectedNodeData({
                  execution_mode: "confirm",
                  approval_channels: selectedApprovalChannels.length > 0 ? selectedApprovalChannels : ["admin_queue"]
                })
              }
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
            <StudioFlowApprovalSettings
              selectedNodeData={selectedNodeData}
              updateSelectedNodeData={updateSelectedNodeData}
              selectedApprovalChannels={selectedApprovalChannels}
              approvalChannelStates={approvalChannelStates}
              toggleSelectedApprovalChannel={toggleSelectedApprovalChannel}
              selectedUnreadyApprovalChannels={selectedUnreadyApprovalChannels}
            />
          ) : null}

          <StudioFlowConditionSettings
            selectedNodeData={selectedNodeData}
            updateSelectedNodeData={updateSelectedNodeData}
            selectedConditionMode={selectedConditionMode}
            updateSelectedConditionMode={updateSelectedConditionMode}
            selectedConditionDsl={selectedConditionDsl}
          />

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
