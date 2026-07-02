import { getOntologyUnit, ONTOLOGY_UNITS } from "../../lib/ontology";
import type { OntologyUnitId, ProjectUnit } from "../../types";
import type { UnitDraft } from "./studio-member-model";

type StudioUnitSelectorRailProps = {
  unitDraft: UnitDraft;
  selectedProjectUnit: ProjectUnit | null;
  projectUnits: ProjectUnit[];
  onSelectBaseUnitTemplate: (unitId: OntologyUnitId) => void;
  onSelectProjectUnit: (unitId: string) => void;
};

export function StudioUnitSelectorRail({
  unitDraft,
  selectedProjectUnit,
  projectUnits,
  onSelectBaseUnitTemplate,
  onSelectProjectUnit
}: StudioUnitSelectorRailProps) {
  return (
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
  );
}
