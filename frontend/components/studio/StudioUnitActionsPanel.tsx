import type { Dispatch, SetStateAction } from "react";
import { Coins, Copy, GitBranch, PackagePlus, Save, Trash2, UploadCloud } from "lucide-react";
import type { ProjectUnit } from "../../types";
import type { UnitDraft } from "./studio-member-model";

type StudioUnitActionsPanelProps = {
  unitDraft: UnitDraft;
  selectedProjectUnit: ProjectUnit | null;
  unitVersionNote: string;
  setUnitVersionNote: Dispatch<SetStateAction<string>>;
  onSaveProjectUnitDraft: () => void;
  onSaveProjectUnitVersion: () => void;
  onDuplicateProjectUnit: () => void;
  onCreateMemberFromProjectUnit: () => void;
  onPublishProjectUnit: () => void;
  onUnpublishProjectUnit: () => void;
  onDeleteProjectUnit: () => void;
};

export function StudioUnitActionsPanel({
  unitDraft,
  selectedProjectUnit,
  unitVersionNote,
  setUnitVersionNote,
  onSaveProjectUnitDraft,
  onSaveProjectUnitVersion,
  onDuplicateProjectUnit,
  onCreateMemberFromProjectUnit,
  onPublishProjectUnit,
  onUnpublishProjectUnit,
  onDeleteProjectUnit
}: StudioUnitActionsPanelProps) {
  return (
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
  );
}
