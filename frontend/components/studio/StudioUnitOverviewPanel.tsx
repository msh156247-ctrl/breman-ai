import {
  ArrowRight,
  BadgeCheck,
  LineChart,
  Target,
  Workflow
} from "lucide-react";
import type { OntologyUnit } from "../../lib/ontology";
import type { UnitDraft } from "./studio-member-model";

export type UnitRuntimePathItem = {
  label: string;
  value: string;
  detail: string;
};

type StudioUnitOverviewPanelProps = {
  unitDraft: UnitDraft;
  selectedDraftBaseUnit: OntologyUnit;
  draftSuccessMetrics: string[];
  draftSetupSteps: string[];
  unitCapabilities: string[];
  unitEntryFromHome: boolean;
  unitRuntimePath: UnitRuntimePathItem[];
  onCreateWorkflowFromUnit: () => void;
};

export function StudioUnitOverviewPanel({
  unitDraft,
  selectedDraftBaseUnit,
  draftSuccessMetrics,
  draftSetupSteps,
  unitCapabilities,
  unitEntryFromHome,
  unitRuntimePath,
  onCreateWorkflowFromUnit
}: StudioUnitOverviewPanelProps) {
  return (
    <>
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
    </>
  );
}
