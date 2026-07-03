import { Clock3, GitBranch } from "lucide-react";
import { type ConditionDslContract } from "../../lib/workflow-graph";
import { conditionCheckLabel, describeConditionCheck } from "./studio-canvas-model";

type StudioFlowConditionSettingsProps = {
  selectedNodeData: Record<string, any>;
  updateSelectedNodeData: (patch: Record<string, any>) => void;
  selectedConditionMode: string;
  updateSelectedConditionMode: (mode: string) => void;
  selectedConditionDsl: ConditionDslContract;
};

export function StudioFlowConditionSettings({
  selectedNodeData,
  updateSelectedNodeData,
  selectedConditionMode,
  updateSelectedConditionMode,
  selectedConditionDsl
}: StudioFlowConditionSettingsProps) {
  return (
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
      {selectedConditionMode === "time" || selectedConditionMode === "composite" ? (
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
      {selectedConditionMode === "data" || selectedConditionMode === "composite" ? (
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
      {selectedConditionMode === "condition" || selectedConditionMode === "composite" ? (
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
  );
}
