import type { Dispatch, SetStateAction } from "react";
import { AlertCircle, Bot, CheckCircle, Save, Trash2 } from "lucide-react";
import { API_PROVIDER_CONFIG } from "../../lib/constants";
import { getOntologyUnit, ONTOLOGY_UNITS, type OntologyUnit } from "../../lib/ontology";
import type { Agent, AgentCategory, APIProvider } from "../../types";
import { MEMBER_CATEGORIES, MEMBER_PROVIDERS, type MemberForm } from "./studio-member-model";

type StudioAgentSettingsPanelProps = {
  selectedAgent: Agent | null;
  memberForm: MemberForm;
  setMemberForm: Dispatch<SetStateAction<MemberForm>>;
  selectedUnit: OntologyUnit;
  providerModels: string[];
  memberNotice: string;
  memberError: string;
  canvasPlacementCount: number;
  onSave: () => void;
  onRemove: () => void;
  onAddCustom: () => void;
};

export function StudioAgentSettingsPanel({
  selectedAgent,
  memberForm,
  setMemberForm,
  selectedUnit,
  providerModels,
  memberNotice,
  memberError,
  canvasPlacementCount,
  onSave,
  onRemove,
  onAddCustom
}: StudioAgentSettingsPanelProps) {
  return (
    <section className="panel-shell min-h-0 rounded-2xl lg:overflow-y-auto">
      {selectedAgent ? (
        <div className="p-4 lg:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-white/5 pb-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Agent Settings</div>
              <h2 className="mt-1 truncate text-lg font-bold">{selectedAgent.name}</h2>
              <p className="mt-1 text-xs text-gray-500">
                캔버스 배치 {canvasPlacementCount}개 · 실행 단가 ${selectedAgent.royalty_per_use.toFixed(2)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onSave}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
              >
                <Save className="h-3.5 w-3.5" />
                저장
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/15"
              >
                <Trash2 className="h-3.5 w-3.5" />
                제거
              </button>
            </div>
          </div>

          {memberNotice && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              <CheckCircle className="h-4 w-4 shrink-0" />
              {memberNotice}
            </div>
          )}
          {memberError && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {memberError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <label className="space-y-1 text-xs text-gray-400">
              이름
              <input
                value={memberForm.name}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-400">
              아바타
              <input
                value={memberForm.avatar}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, avatar: event.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-400">
              역할
              <select
                value={memberForm.category}
                onChange={(event) =>
                  setMemberForm((prev) => ({
                    ...prev,
                    category: event.target.value as Exclude<AgentCategory, "전체">
                  }))
                }
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
              >
                {MEMBER_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-gray-400">
              Ontology Unit
              <select
                value={memberForm.ontologyUnit}
                onChange={(event) => {
                  const unit = getOntologyUnit(event.target.value);
                  setMemberForm((prev) => ({
                    ...prev,
                    ontologyUnit: unit.id,
                    category: unit.defaultCategory,
                    unitRole: prev.unitRole || unit.memberRole,
                    responsibility: prev.responsibility || unit.responsibility
                  }));
                }}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
              >
                {ONTOLOGY_UNITS.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} · {unit.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-gray-400">
              Unit 담당 역할
              <input
                value={memberForm.unitRole}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, unitRole: event.target.value }))}
                placeholder={selectedUnit.memberRole}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-400">
              API Provider
              <select
                value={memberForm.provider}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, provider: event.target.value as APIProvider }))}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
              >
                {MEMBER_PROVIDERS.map((provider) => (
                  <option key={provider} value={provider}>
                    {API_PROVIDER_CONFIG[provider]?.label || provider}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-gray-400">
              실행 단가
              <input
                value={memberForm.royalty}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, royalty: event.target.value }))}
                inputMode="decimal"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-400">
              모델 이름
              <input
                value={memberForm.modelName}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, modelName: event.target.value }))}
                placeholder={providerModels[0] || "custom-model"}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-400">
              모델 버전
              <input
                value={memberForm.modelVersion}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, modelVersion: event.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-400">
              태그
              <input
                value={memberForm.tags}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder="code, review"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-400 xl:col-span-2">
              Unit 책임
              <textarea
                value={memberForm.responsibility}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, responsibility: event.target.value }))}
                rows={3}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
              />
              <div className="text-[11px] leading-relaxed text-gray-600">{selectedUnit.dataContract}</div>
            </label>
            <label className="space-y-1 text-xs text-gray-400 xl:col-span-2">
              기능
              <input
                value={memberForm.capabilities}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, capabilities: event.target.value }))}
                placeholder="planning, coding, qa"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
              />
            </label>
            <label className="space-y-1 text-xs text-gray-400 xl:col-span-2">
              설명
              <textarea
                value={memberForm.description}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={5}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-6 text-center text-gray-500">
          <Bot className="h-8 w-8" />
          <div className="text-sm">설정할 에이전트가 없습니다.</div>
          <button
            type="button"
            onClick={onAddCustom}
            className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
          >
            직접 추가
          </button>
        </div>
      )}
    </section>
  );
}
