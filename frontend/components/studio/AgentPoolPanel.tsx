"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { useAppStoreHydrated } from "../../hooks/useAppStoreHydrated";
import { getAgentOntologyUnit, ONTOLOGY_UNITS } from "../../lib/ontology";
import { DEFAULT_MEMBER_FOLDERS, getDefaultMemberFolderId, useAppStore, type MemberFolder } from "../../stores/app.store";
import type { Agent, OntologyUnitId } from "../../types";
import { AgentPoolAgentCard } from "./AgentPoolAgentCard";
import { AgentPoolFilters } from "./AgentPoolFilters";
import { ALL_FOLDERS_ID, ALL_UNITS_ID, agentMatchesPoolQuery, type PoolTab } from "./agent-pool-model";

export default function AgentPoolPanel() {
  const searchParams = useSearchParams();
  const {
    hiredAgents,
    libraryAgents,
    memberFolders,
    agentFolderIds,
    hireAgent,
    fireAgent,
    saveAgentToLibrary,
    removeAgentFromLibrary,
    addMemberFolder,
    moveAgentToFolder,
    isInLibrary
  } = useAppStore();
  const workspaceHydrated = useAppStoreHydrated();
  const [activeTab, setActiveTab] = useState<PoolTab>("pool");
  const [activeUnitId, setActiveUnitId] = useState<OntologyUnitId | typeof ALL_UNITS_ID>("all");
  const [activeFolderId, setActiveFolderId] = useState(ALL_FOLDERS_ID);
  const [query, setQuery] = useState("");
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const activeAgents = activeTab === "pool" ? hiredAgents : libraryAgents;
  const hiredIds = useMemo(() => new Set(hiredAgents.map((agent) => agent.id)), [hiredAgents]);
  const folders = memberFolders.length > 0 ? memberFolders : DEFAULT_MEMBER_FOLDERS;
  const unitParam = searchParams.get("unit");
  const activeUnit = activeUnitId === ALL_UNITS_ID ? null : ONTOLOGY_UNITS.find((unit) => unit.id === activeUnitId) || null;
  const resolveFolderId = (agent: Agent) => agentFolderIds[agent.id] || getDefaultMemberFolderId(agent);
  const unitScopedAgents = useMemo(
    () =>
      activeUnitId === ALL_UNITS_ID
        ? activeAgents
        : activeAgents.filter((agent) => getAgentOntologyUnit(agent).id === activeUnitId),
    [activeAgents, activeUnitId]
  );
  const folderScopedAgents = useMemo(
    () =>
      activeFolderId === ALL_FOLDERS_ID
        ? unitScopedAgents
        : unitScopedAgents.filter((agent) => resolveFolderId(agent) === activeFolderId),
    [activeFolderId, agentFolderIds, unitScopedAgents]
  );
  const unitCounts = useMemo(() => {
    const counts: Record<string, number> = { [ALL_UNITS_ID]: activeAgents.length };
    ONTOLOGY_UNITS.forEach((unit) => {
      counts[unit.id] = 0;
    });
    activeAgents.forEach((agent) => {
      const unitId = getAgentOntologyUnit(agent).id;
      counts[unitId] = (counts[unitId] || 0) + 1;
    });
    return counts;
  }, [activeAgents]);
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = { [ALL_FOLDERS_ID]: unitScopedAgents.length };
    folders.forEach((folder) => {
      counts[folder.id] = 0;
    });
    unitScopedAgents.forEach((agent) => {
      const folderId = resolveFolderId(agent);
      counts[folderId] = (counts[folderId] || 0) + 1;
    });
    return counts;
  }, [agentFolderIds, folders, unitScopedAgents]);
  const filteredAgents = useMemo(() => {
    return folderScopedAgents.filter((agent) => agentMatchesPoolQuery(agent, query));
  }, [folderScopedAgents, query]);

  const agentCountLabel = workspaceHydrated ? `${hiredAgents.length}개` : "...";
  const libraryCountLabel = workspaceHydrated ? `${libraryAgents.length}개` : "...";
  const activeCountLabel =
    activeUnitId === ALL_UNITS_ID && activeFolderId === ALL_FOLDERS_ID
      ? activeTab === "pool"
        ? agentCountLabel
        : libraryCountLabel
      : workspaceHydrated
        ? `${folderScopedAgents.length}개`
        : "...";
  const searchPlaceholder =
    activeTab === "pool" ? "Unit, 역할, 에이전트 검색..." : "Unit 라이브러리 검색...";

  useEffect(() => {
    if (!unitParam) return;
    const nextUnit = ONTOLOGY_UNITS.find((unit) => unit.id === unitParam);
    if (!nextUnit) return;
    setActiveUnitId(nextUnit.id);
    setActiveFolderId(ALL_FOLDERS_ID);
  }, [unitParam]);

  const selectPoolTab = (tab: PoolTab) => {
    setActiveTab(tab);
    setQuery("");
    setActiveFolderId(ALL_FOLDERS_ID);
  };

  const createFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    const existing = folders.find((folder) => folder.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setActiveFolderId(existing.id);
      setNewFolderName("");
      setShowFolderForm(false);
      return;
    }
    const folder: MemberFolder = {
      id: `folder-${Date.now()}`,
      name
    };
    addMemberFolder(folder);
    setActiveFolderId(folder.id);
    setNewFolderName("");
    setShowFolderForm(false);
  };

  const saveToLibrary = (agent: Agent) => {
    saveAgentToLibrary(agent);
    setActiveTab("library");
    setActiveUnitId(getAgentOntologyUnit(agent).id);
    setActiveFolderId(resolveFolderId(agent));
  };

  const selectUnit = (unitId: OntologyUnitId | typeof ALL_UNITS_ID) => {
    setActiveUnitId(unitId);
    setActiveFolderId(ALL_FOLDERS_ID);
  };

  const closeFolderForm = () => {
    setShowFolderForm(false);
    setNewFolderName("");
  };

  return (
    <div className="flex h-full min-h-0 w-full shrink-0 flex-col border-b border-white/10 bg-[#080a0f]/90 backdrop-blur 2xl:w-80 2xl:border-b-0 2xl:border-r">
      <div className="relative overflow-hidden border-b border-white/10 p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-blue-500/10 to-transparent" />
        <div className="mb-4 flex items-center justify-between">
          <div className="relative">
            <h2 className="text-lg font-black tracking-tight text-white">{activeTab === "pool" ? "Unit 구성" : "Unit 라이브러리"}</h2>
            <div className="mt-0.5 text-[11px] font-medium text-gray-500">
              {activeUnit ? `${activeUnit.name} 담당 에이전트` : "온톨로지 Unit 기준으로 구성"}
            </div>
          </div>
          <span className="relative rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-xs font-semibold text-gray-300">
            {activeCountLabel}
          </span>
        </div>
        <div className="relative mb-3 grid grid-cols-2 rounded-xl border border-white/10 bg-black/30 p-1 text-xs font-semibold shadow-inner shadow-black/20">
          <button
            type="button"
            onClick={() => selectPoolTab("pool")}
            className={`rounded-lg px-2 py-1.5 transition-colors ${
              activeTab === "pool" ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-sm shadow-blue-500/20" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            구성 풀
          </button>
          <button
            type="button"
            onClick={() => selectPoolTab("library")}
            className={`rounded-lg px-2 py-1.5 transition-colors ${
              activeTab === "library" ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-sm shadow-blue-500/20" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            라이브러리
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-blue-400/60 focus:bg-black/40"
          />
        </div>
        <Link
          href="/market?tab=agents"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/25 bg-gradient-to-r from-cyan-500/[0.14] to-emerald-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 shadow-sm shadow-cyan-500/10 transition-colors hover:border-cyan-300/[0.45] hover:from-cyan-500/20 hover:to-emerald-500/[0.14]"
        >
          <UserPlus className="h-3.5 w-3.5" />
          에이전트 마켓 열기
        </Link>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <AgentPoolFilters
          activeUnit={activeUnit}
          activeUnitId={activeUnitId}
          activeFolderId={activeFolderId}
          folders={folders}
          unitCounts={unitCounts}
          folderCounts={folderCounts}
          showFolderForm={showFolderForm}
          newFolderName={newFolderName}
          onSelectUnit={selectUnit}
          onSelectFolder={setActiveFolderId}
          onToggleFolderForm={() => setShowFolderForm((value) => !value)}
          onNewFolderNameChange={setNewFolderName}
          onCreateFolder={createFolder}
          onCloseFolderForm={closeFolderForm}
        />
        {!workspaceHydrated ? (
          <div className="space-y-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="surface-card h-[72px] animate-pulse rounded-xl" />
            ))}
          </div>
        ) : activeAgents.length === 0 ? (
          <div className="surface-card rounded-2xl px-4 py-12 text-center text-gray-500">
            <div className="mb-3 text-4xl">{activeTab === "pool" ? "🤖" : "⭐"}</div>
            <div className="text-sm font-semibold text-gray-300">
              {activeTab === "pool" ? "아직 배치된 에이전트가 없어요" : "아직 저장된 에이전트가 없어요"}
            </div>
            <div className="mt-1 text-xs text-gray-700">
              {activeTab === "pool"
                ? "마켓이나 라이브러리에서 에이전트를 가져오세요"
                : "에이전트 풀에서 북마크하거나 마켓에서 가져오세요"}
            </div>
          </div>
        ) : folderScopedAgents.length === 0 ? (
          <div className="surface-card rounded-2xl px-4 py-12 text-center text-gray-500">
            <div className="mb-3 text-4xl">🧩</div>
            <div className="text-sm font-semibold text-gray-300">이 Unit에는 아직 에이전트가 없어요</div>
            <div className="mt-1 text-xs text-gray-700">설정에서 에이전트에 Unit을 바인딩하세요</div>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="surface-card rounded-2xl px-4 py-12 text-center text-gray-500">
            <div className="text-sm font-semibold text-gray-300">검색 결과가 없습니다</div>
            <button onClick={() => setQuery("")} className="mt-2 text-xs text-blue-300 hover:text-blue-200">
              필터 지우기
            </button>
          </div>
        ) : (
          filteredAgents.map((agent) => {
            const inPool = hiredIds.has(agent.id);
            const inLibrary = isInLibrary(agent.id);
            const currentFolderId = resolveFolderId(agent);
            return (
              <AgentPoolAgentCard
                key={agent.id}
                agent={agent}
                activeTab={activeTab}
                folders={folders}
                inPool={inPool}
                inLibrary={inLibrary}
                currentFolderId={currentFolderId}
                onMoveToFolder={moveAgentToFolder}
                onSaveToLibrary={saveToLibrary}
                onFireAgent={fireAgent}
                onHireAgent={hireAgent}
                onRemoveFromLibrary={removeAgentFromLibrary}
              />
            );
          })
        )}
      </div>

      {workspaceHydrated && activeAgents.length > 0 && (
        <div className="border-t border-white/10 bg-black/20 p-4">
          <div className="text-center text-xs text-gray-600">
            {filteredAgents.length}/{folderScopedAgents.length}
            {activeTab === "pool"
              ? `개 표시 · ${activeUnit ? activeUnit.name : "전체 Unit"} 구성 풀`
              : `개 표시 · ${activeUnit ? activeUnit.name : "전체 Unit"} 라이브러리`}
          </div>
        </div>
      )}
    </div>
  );
}
