import type { Dispatch, SetStateAction } from "react";
import { AlertCircle, CheckCircle, Layers } from "lucide-react";
import { ONTOLOGY_UNITS, type OntologyUnit } from "../../lib/ontology";
import type { AgentCategory, OntologyUnitId, ProjectUnit } from "../../types";
import { MEMBER_CATEGORIES, type UnitDraft } from "./studio-member-model";
import { StudioUnitActionsPanel } from "./StudioUnitActionsPanel";
import { StudioUnitOverviewPanel, type UnitRuntimePathItem } from "./StudioUnitOverviewPanel";
import { StudioUnitSelectorRail } from "./StudioUnitSelectorRail";

type StudioUnitBuilderPanelProps = {
  unitDraft: UnitDraft;
  setUnitDraft: Dispatch<SetStateAction<UnitDraft>>;
  selectedDraftBaseUnit: OntologyUnit;
  selectedProjectUnit: ProjectUnit | null;
  projectUnits: ProjectUnit[];
  publishedProjectUnitCount: number;
  draftSuccessMetrics: string[];
  draftSetupSteps: string[];
  unitCapabilities: string[];
  unitEntryFromHome: boolean;
  unitRuntimePath: UnitRuntimePathItem[];
  unitNotice: string;
  unitError: string;
  unitVersionNote: string;
  setUnitVersionNote: Dispatch<SetStateAction<string>>;
  onSelectBaseUnitTemplate: (unitId: OntologyUnitId) => void;
  onSelectProjectUnit: (unitId: string) => void;
  onSaveProjectUnitDraft: () => void;
  onSaveProjectUnitVersion: () => void;
  onDuplicateProjectUnit: () => void;
  onCreateMemberFromProjectUnit: () => void;
  onCreateWorkflowFromUnit: () => void;
  onPublishProjectUnit: () => void;
  onUnpublishProjectUnit: () => void;
  onDeleteProjectUnit: () => void;
};

export function StudioUnitBuilderPanel({
  unitDraft,
  setUnitDraft,
  selectedDraftBaseUnit,
  selectedProjectUnit,
  projectUnits,
  publishedProjectUnitCount,
  draftSuccessMetrics,
  draftSetupSteps,
  unitCapabilities,
  unitEntryFromHome,
  unitRuntimePath,
  unitNotice,
  unitError,
  unitVersionNote,
  setUnitVersionNote,
  onSelectBaseUnitTemplate,
  onSelectProjectUnit,
  onSaveProjectUnitDraft,
  onSaveProjectUnitVersion,
  onDuplicateProjectUnit,
  onCreateMemberFromProjectUnit,
  onCreateWorkflowFromUnit,
  onPublishProjectUnit,
  onUnpublishProjectUnit,
  onDeleteProjectUnit
}: StudioUnitBuilderPanelProps) {
  return (
    <section className="panel-shell rounded-2xl p-4 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-300">
            <Layers className="h-4 w-4" />
            Ontology Unit 구성
          </div>
          <h2 className="mt-1 text-lg font-bold">Unit을 먼저 설계하고 그 Unit으로 에이전트를 구성합니다</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
            {selectedDraftBaseUnit.name} 템플릿의 책임, 데이터 계약, 기능을 프로젝트용 Unit으로 저장한 뒤 버전을 남기고
            마켓에 게시할 수 있습니다.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-gray-500">
          <div className="rounded-lg bg-black/25 px-3 py-2">
            <div className="text-sm font-semibold text-gray-100">{projectUnits.length}</div>
            프로젝트 Unit
          </div>
          <div className="rounded-lg bg-black/25 px-3 py-2">
            <div className="text-sm font-semibold text-emerald-200">{publishedProjectUnitCount}</div>
            게시됨
          </div>
          <div className="rounded-lg bg-black/25 px-3 py-2">
            <div className="text-sm font-semibold text-cyan-200">{selectedProjectUnit?.version || "draft"}</div>
            현재 버전
          </div>
        </div>
      </div>

      {unitNotice && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {unitNotice}
        </div>
      )}
      {unitError && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {unitError}
        </div>
      )}

      <StudioUnitOverviewPanel
        unitDraft={unitDraft}
        selectedDraftBaseUnit={selectedDraftBaseUnit}
        draftSuccessMetrics={draftSuccessMetrics}
        draftSetupSteps={draftSetupSteps}
        unitCapabilities={unitCapabilities}
        unitEntryFromHome={unitEntryFromHome}
        unitRuntimePath={unitRuntimePath}
        onCreateWorkflowFromUnit={onCreateWorkflowFromUnit}
      />

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <StudioUnitSelectorRail
          unitDraft={unitDraft}
          selectedProjectUnit={selectedProjectUnit}
          projectUnits={projectUnits}
          onSelectBaseUnitTemplate={onSelectBaseUnitTemplate}
          onSelectProjectUnit={onSelectProjectUnit}
        />

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs text-gray-400">
            기준 Ontology Unit
            <select
              value={unitDraft.baseUnitId}
              onChange={(event) => onSelectBaseUnitTemplate(event.target.value as OntologyUnitId)}
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
            실행 역할 카테고리
            <select
              value={unitDraft.defaultCategory}
              onChange={(event) =>
                setUnitDraft((prev) => ({
                  ...prev,
                  defaultCategory: event.target.value as Exclude<AgentCategory, "전체">
                }))
              }
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
            >
              {MEMBER_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-gray-400">
            Unit 이름
            <input
              value={unitDraft.name}
              onChange={(event) => setUnitDraft((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
            />
          </label>
          <label className="space-y-1 text-xs text-gray-400">
            화면 라벨
            <input
              value={unitDraft.label}
              onChange={(event) => setUnitDraft((prev) => ({ ...prev, label: event.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
            />
          </label>
          <label className="space-y-1 text-xs text-gray-400">
            짧은 배지
            <input
              value={unitDraft.shortLabel}
              onChange={(event) => setUnitDraft((prev) => ({ ...prev, shortLabel: event.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
            />
          </label>
          <label className="space-y-1 text-xs text-gray-400">
            담당 역할
            <input
              value={unitDraft.memberRole}
              onChange={(event) => setUnitDraft((prev) => ({ ...prev, memberRole: event.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
            />
          </label>
          <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
            Unit 설명
            <textarea
              value={unitDraft.description}
              onChange={(event) => setUnitDraft((prev) => ({ ...prev, description: event.target.value }))}
              rows={2}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
            />
          </label>
          <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
            사용 효과
            <textarea
              value={unitDraft.effectSummary}
              onChange={(event) => setUnitDraft((prev) => ({ ...prev, effectSummary: event.target.value }))}
              rows={2}
              className="w-full resize-none rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] px-3 py-2 text-sm text-cyan-50 outline-none focus:border-cyan-400/50"
            />
          </label>
          <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
            책임
            <textarea
              value={unitDraft.responsibility}
              onChange={(event) => setUnitDraft((prev) => ({ ...prev, responsibility: event.target.value }))}
              rows={2}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
            />
          </label>
          <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
            데이터 계약
            <input
              value={unitDraft.dataContract}
              onChange={(event) => setUnitDraft((prev) => ({ ...prev, dataContract: event.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
            />
          </label>
          <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
            기능
            <input
              value={unitDraft.capabilities}
              onChange={(event) => setUnitDraft((prev) => ({ ...prev, capabilities: event.target.value }))}
              placeholder="planning, execution, audit"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
            />
          </label>
          <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
            성공 지표
            <input
              value={unitDraft.successMetrics}
              onChange={(event) => setUnitDraft((prev) => ({ ...prev, successMetrics: event.target.value }))}
              placeholder="완료율, 비용 절감률, 품질 점수"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
          <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
            구성 단계
            <input
              value={unitDraft.setupSteps}
              onChange={(event) => setUnitDraft((prev) => ({ ...prev, setupSteps: event.target.value }))}
              placeholder="목표 분해, 입출력 계약 정의, 승인 지점 연결"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
            />
          </label>
          <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
            비용 관리 조언
            <textarea
              value={unitDraft.costGuidance}
              onChange={(event) => setUnitDraft((prev) => ({ ...prev, costGuidance: event.target.value }))}
              rows={2}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-yellow-500/50"
            />
          </label>
          <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
            품질 관리 조언
            <textarea
              value={unitDraft.qualityGuidance}
              onChange={(event) => setUnitDraft((prev) => ({ ...prev, qualityGuidance: event.target.value }))}
              rows={2}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-purple-500/50"
            />
          </label>
        </div>

        <StudioUnitActionsPanel
          unitDraft={unitDraft}
          selectedProjectUnit={selectedProjectUnit}
          unitVersionNote={unitVersionNote}
          setUnitVersionNote={setUnitVersionNote}
          onSaveProjectUnitDraft={onSaveProjectUnitDraft}
          onSaveProjectUnitVersion={onSaveProjectUnitVersion}
          onDuplicateProjectUnit={onDuplicateProjectUnit}
          onCreateMemberFromProjectUnit={onCreateMemberFromProjectUnit}
          onPublishProjectUnit={onPublishProjectUnit}
          onUnpublishProjectUnit={onUnpublishProjectUnit}
          onDeleteProjectUnit={onDeleteProjectUnit}
        />
      </div>
    </section>
  );
}
