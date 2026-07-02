import Link from "next/link";
import { Folder, FolderPlus } from "lucide-react";
import { ONTOLOGY_UNITS, type OntologyUnit } from "../../lib/ontology";
import type { MemberFolder } from "../../stores/app.store";
import type { OntologyUnitId } from "../../types";
import { ALL_FOLDERS_ID, ALL_UNITS_ID } from "./agent-pool-model";

type AgentPoolFiltersProps = {
  activeUnit: OntologyUnit | null;
  activeUnitId: OntologyUnitId | typeof ALL_UNITS_ID;
  activeFolderId: string;
  folders: MemberFolder[];
  unitCounts: Record<string, number>;
  folderCounts: Record<string, number>;
  showFolderForm: boolean;
  newFolderName: string;
  onSelectUnit: (unitId: OntologyUnitId | typeof ALL_UNITS_ID) => void;
  onSelectFolder: (folderId: string) => void;
  onToggleFolderForm: () => void;
  onNewFolderNameChange: (name: string) => void;
  onCreateFolder: () => void;
  onCloseFolderForm: () => void;
};

export function AgentPoolFilters({
  activeUnit,
  activeUnitId,
  activeFolderId,
  folders,
  unitCounts,
  folderCounts,
  showFolderForm,
  newFolderName,
  onSelectUnit,
  onSelectFolder,
  onToggleFolderForm,
  onNewFolderNameChange,
  onCreateFolder,
  onCloseFolderForm
}: AgentPoolFiltersProps) {
  return (
    <div className="sticky top-0 z-20 -mx-4 -mt-4 border-b border-white/10 bg-[#080a0f]/95 p-4 pb-3 backdrop-blur">
      <div className="mb-4 rounded-2xl border border-white/10 bg-black/25 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-bold text-cyan-100">Ontology Unit</div>
          {activeUnit && (
            <Link
              href={`/studio?panel=agents&unit=${activeUnit.id}`}
              className="text-[11px] font-semibold text-cyan-300 hover:text-cyan-200"
            >
              설정에서 구성 →
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onSelectUnit(ALL_UNITS_ID)}
            className={`rounded-xl border px-2 py-2 text-left text-[11px] transition-colors ${
              activeUnitId === ALL_UNITS_ID
                ? "border-cyan-300/40 bg-cyan-500/15 text-cyan-50"
                : "border-white/10 bg-white/[0.04] text-gray-400 hover:bg-white/[0.07]"
            }`}
          >
            <span className="block font-bold">All Units</span>
            <span className="text-[10px] opacity-70">{unitCounts[ALL_UNITS_ID] || 0} agents</span>
          </button>
          {ONTOLOGY_UNITS.map((unit) => (
            <button
              key={unit.id}
              type="button"
              onClick={() => onSelectUnit(unit.id)}
              className={`rounded-xl border px-2 py-2 text-left text-[11px] transition-colors ${
                activeUnitId === unit.id
                  ? "border-cyan-300/40 bg-cyan-500/15 text-cyan-50"
                  : "border-white/10 bg-white/[0.04] text-gray-400 hover:bg-white/[0.07]"
              }`}
            >
              <span className="block truncate font-bold">{unit.name}</span>
              <span className="text-[10px] opacity-70">{unitCounts[unit.id] || 0} agents</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-gray-400">
          <Folder className="h-3.5 w-3.5 text-blue-300" />
          폴더
        </div>
        <button
          type="button"
          onClick={onToggleFolderForm}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-gray-300 hover:bg-white/10 hover:text-white"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          추가
        </button>
      </div>
      {showFolderForm && (
        <div className="mb-2 flex gap-1.5">
          <input
            value={newFolderName}
            onChange={(event) => onNewFolderNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onCreateFolder();
              if (event.key === "Escape") onCloseFolderForm();
            }}
            placeholder="새 폴더 이름"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500/50"
          />
          <button
            type="button"
            onClick={onCreateFolder}
            className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
          >
            생성
          </button>
        </div>
      )}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => onSelectFolder(ALL_FOLDERS_ID)}
          className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            activeFolderId === ALL_FOLDERS_ID
              ? "border-blue-400/[0.45] bg-blue-500/20 text-blue-50 shadow-sm shadow-blue-500/10"
              : "border-white/10 bg-white/[0.045] text-gray-400 hover:bg-white/[0.07] hover:text-white"
          }`}
        >
          전체 <span className="ml-1 text-[10px] opacity-70">{folderCounts[ALL_FOLDERS_ID] || 0}</span>
        </button>
        {folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            onClick={() => onSelectFolder(folder.id)}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              activeFolderId === folder.id
                ? "border-blue-400/[0.45] bg-blue-500/20 text-blue-50 shadow-sm shadow-blue-500/10"
                : "border-white/10 bg-white/[0.045] text-gray-400 hover:bg-white/[0.07] hover:text-white"
            }`}
          >
            {folder.name} <span className="ml-1 text-[10px] opacity-70">{folderCounts[folder.id] || 0}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
