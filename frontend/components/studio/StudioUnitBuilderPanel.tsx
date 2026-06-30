import type { Dispatch, SetStateAction } from "react";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CheckCircle,
  Coins,
  Copy,
  GitBranch,
  Layers,
  LineChart,
  PackagePlus,
  Save,
  Target,
  Trash2,
  UploadCloud,
  Workflow
} from "lucide-react";
import { getOntologyUnit, ONTOLOGY_UNITS, type OntologyUnit } from "../../lib/ontology";
import type { AgentCategory, OntologyUnitId, ProjectUnit } from "../../types";
import { MEMBER_CATEGORIES, type UnitDraft } from "./studio-member-model";

type UnitRuntimePathItem = {
  label: string;
  value: string;
  detail: string;
};

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

      <div className="mb-4 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/[0.12] via-blue-500/[0.055] to-transparent p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-100">
                Unit 상세
              </span>
              {unitEntryFromHome && (
                <span className="rounded-lg border border-blue-300/20 bg-blue-400/10 px-2 py-1 text-[10px] font-semibold text-blue-100">
                  홈에서 선택한 Unit
                </span>
              )}
              <span
                className={`rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-[10px] font-semibold ${selectedDraftBaseUnit.accent}`}
              >
                {selectedDraftBaseUnit.shortLabel}
              </span>
            </div>
            <h3 className="text-xl font-black text-white">{selectedDraftBaseUnit.name}</h3>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-cyan-50/75">{unitDraft.description}</p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">책임</div>
                <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-200">{unitDraft.responsibility}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">데이터 계약</div>
                <div className="mt-1 line-clamp-2 font-mono text-xs leading-relaxed text-cyan-100">
                  {unitDraft.dataContract}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">생성되는 에이전트</div>
                <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-200">{unitDraft.memberRole}</div>
              </div>
            </div>
          </div>

          <div className="w-full shrink-0 rounded-2xl border border-white/10 bg-black/25 p-3 xl:w-[360px]">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-300">
              <Workflow className="h-3.5 w-3.5 text-blue-300" />
              Unit → Runtime 연결
            </div>
            <div className="space-y-2">
              {unitRuntimePath.map((item, index) => (
                <div key={item.label} className="flex items-center gap-2 rounded-xl bg-white/[0.045] px-3 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-gray-100">{item.value}</span>
                    <span className="block truncate text-[11px] text-gray-500">
                      {item.label} · {item.detail}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {unitCapabilities.slice(0, 5).map((capability) => (
                <span
                  key={capability}
                  className="rounded-lg border border-cyan-300/15 bg-cyan-500/[0.07] px-2 py-1 text-[10px] font-semibold text-cyan-100"
                >
                  {capability}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.08] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-200">
            <Target className="h-4 w-4" />
            이 Unit의 효과
          </div>
          <h3 className="text-base font-bold text-white">{selectedDraftBaseUnit.name} 중심으로 작업을 나눕니다</h3>
          <p className="mt-2 text-sm leading-relaxed text-cyan-50/80">{unitDraft.effectSummary}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {unitCapabilities.slice(0, 4).map((capability) => (
              <span
                key={capability}
                className="rounded-lg border border-cyan-300/15 bg-black/20 px-2 py-1 text-[11px] font-semibold text-cyan-100"
              >
                {capability}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <LineChart className="h-4 w-4 text-emerald-300" />
            성공 지표
          </div>
          <div className="space-y-2">
            {draftSuccessMetrics.slice(0, 4).map((metric) => (
              <div key={metric} className="flex items-center gap-2 rounded-xl bg-white/[0.045] px-3 py-2 text-xs text-gray-200">
                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                <span className="min-w-0 truncate">{metric}</span>
              </div>
            ))}
            {draftSuccessMetrics.length === 0 && (
              <div className="text-xs text-gray-600">성공 지표를 입력하면 여기에 표시됩니다.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <Workflow className="h-4 w-4 text-blue-300" />
            구성 흐름
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
            아래 단계는 버튼을 누르면 순서가 연결된 워크플로우 카드로 펼쳐집니다.
          </p>
          <div className="space-y-2">
            {draftSetupSteps.slice(0, 3).map((step, index) => (
              <div key={step} className="flex items-start gap-2 rounded-xl bg-white/[0.045] px-3 py-2 text-xs text-gray-200">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">
                  {index + 1}
                </span>
                <span className="min-w-0 leading-relaxed">{step}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onCreateWorkflowFromUnit}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/20 transition-colors hover:from-blue-500 hover:to-cyan-400"
          >
            Unit 흐름으로 워크플로우 생성
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <div>
            <div className="mb-2 text-xs font-semibold text-gray-400">기본 Unit 템플릿</div>
            <div className="grid grid-cols-2 gap-2">
              {ONTOLOGY_UNITS.map((unit) => (
                <button
                  type="button"
                  key={unit.id}
                  onClick={() => onSelectBaseUnitTemplate(unit.id)}
                  className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                    unitDraft.baseUnitId === unit.id && !selectedProjectUnit
                      ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-100"
                      : "border-white/5 bg-black/20 text-gray-400 hover:border-white/15 hover:bg-white/5"
                  }`}
                >
                  <span className="block font-semibold text-gray-100">{unit.name}</span>
                  <span className="mt-1 block truncate text-[11px] text-gray-500">{unit.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-gray-400">
              <span>저장된 프로젝트 Unit</span>
              <span className="text-[11px] text-gray-600">{projectUnits.length}개</span>
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {projectUnits.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-gray-600">
                  아직 저장된 Unit이 없습니다.
                </div>
              ) : (
                projectUnits.map((unit) => (
                  <button
                    type="button"
                    key={unit.id}
                    onClick={() => onSelectProjectUnit(unit.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                      selectedProjectUnit?.id === unit.id
                        ? "border-blue-400/60 bg-blue-500/10"
                        : "border-white/5 bg-black/20 hover:border-white/15 hover:bg-white/5"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-gray-100">{unit.name}</span>
                      <span className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-400">
                        {unit.version}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-gray-500">
                      {getOntologyUnit(unit.base_unit_id).name} · {unit.member_role}
                    </span>
                    {unit.published && (
                      <span className="mt-2 inline-flex rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                        Market
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

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

        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-300">
              <GitBranch className="h-3.5 w-3.5 text-purple-300" />
              버전 관리
            </div>
            <label className="space-y-1 text-xs text-gray-400">
              버전 메모
              <input
                value={unitVersionNote}
                onChange={(event) => setUnitVersionNote(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-purple-500/50"
              />
            </label>
            <div className="mt-3 max-h-32 space-y-2 overflow-y-auto pr-1 text-xs">
              {(selectedProjectUnit?.versions || []).slice(0, 5).map((version) => (
                <div key={`${version.version}-${version.timestamp}`} className="rounded-lg bg-white/[0.04] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-purple-200">{version.version}</span>
                    <span className="text-[10px] text-gray-600">
                      {new Date(version.timestamp).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-gray-500">{version.note}</div>
                </div>
              ))}
              {!selectedProjectUnit && <div className="text-gray-600">저장 후 버전 히스토리가 표시됩니다.</div>}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-300">
              <Coins className="h-3.5 w-3.5 text-yellow-300" />
              운영 조언
            </div>
            <div className="space-y-2 text-xs leading-relaxed">
              <div className="rounded-xl border border-yellow-500/15 bg-yellow-500/[0.06] px-3 py-2 text-yellow-50/85">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-yellow-200">Cost</div>
                {unitDraft.costGuidance}
              </div>
              <div className="rounded-xl border border-purple-500/15 bg-purple-500/[0.06] px-3 py-2 text-purple-50/85">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-purple-200">Quality</div>
                {unitDraft.qualityGuidance}
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <button
              type="button"
              onClick={onSaveProjectUnitDraft}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/15"
            >
              <Save className="h-3.5 w-3.5" />
              Unit 저장
            </button>
            <button
              type="button"
              onClick={onSaveProjectUnitVersion}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-500/25 bg-purple-500/10 px-3 py-2 text-xs font-semibold text-purple-100 transition-colors hover:bg-purple-500/15"
            >
              <GitBranch className="h-3.5 w-3.5" />
              버전 저장
            </button>
            <button
              type="button"
              onClick={onDuplicateProjectUnit}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/10"
            >
              <Copy className="h-3.5 w-3.5" />
              Unit 복제
            </button>
            <button
              type="button"
              onClick={onCreateMemberFromProjectUnit}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
            >
              <PackagePlus className="h-3.5 w-3.5" />
              Unit으로 에이전트 생성
            </button>
            <button
              type="button"
              onClick={selectedProjectUnit?.published ? onUnpublishProjectUnit : onPublishProjectUnit}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                selectedProjectUnit?.published
                  ? "border-yellow-500/25 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-500/15"
                  : "border-emerald-500/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
              }`}
            >
              <UploadCloud className="h-3.5 w-3.5" />
              {selectedProjectUnit?.published ? "게시 해제" : "프로젝트 마켓 게시"}
            </button>
            <button
              type="button"
              onClick={onDeleteProjectUnit}
              disabled={!selectedProjectUnit}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Unit 삭제
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
