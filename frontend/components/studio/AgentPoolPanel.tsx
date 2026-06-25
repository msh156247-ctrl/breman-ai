"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Folder,
  FolderPlus,
  Plus,
  Search,
  Settings,
  Trash2,
  UserPlus,
  X
} from "lucide-react";
import { useAppStoreHydrated } from "../../hooks/useAppStoreHydrated";
import { getAgentOntologyUnit, ONTOLOGY_UNITS } from "../../lib/ontology";
import { DEFAULT_MEMBER_FOLDERS, getDefaultMemberFolderId, useAppStore, type MemberFolder } from "../../stores/app.store";
import type { Agent, OntologyUnitId } from "../../types";

type PoolTab = "pool" | "library";
const ALL_FOLDERS_ID = "all";
const ALL_UNITS_ID = "all";

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
    const needle = query.trim().toLowerCase();
    if (!needle) return folderScopedAgents;
    return folderScopedAgents.filter((agent) =>
      {
        const unit = getAgentOntologyUnit(agent);
        return (
      [
        agent.name,
        agent.category,
        agent.required_api,
        agent.description,
        unit.name,
        unit.label,
        unit.memberRole,
        agent.unit_role,
        agent.responsibility,
        ...(agent.tags || []),
        ...(agent.capabilities || [])
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
        );
      }
    );
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
                onClick={() => {
                  setActiveUnitId(ALL_UNITS_ID);
                  setActiveFolderId(ALL_FOLDERS_ID);
                }}
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
                  onClick={() => {
                    setActiveUnitId(unit.id);
                    setActiveFolderId(ALL_FOLDERS_ID);
                  }}
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
              onClick={() => setShowFolderForm((value) => !value)}
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
                onChange={(event) => setNewFolderName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") createFolder();
                  if (event.key === "Escape") {
                    setShowFolderForm(false);
                    setNewFolderName("");
                  }
                }}
                placeholder="새 폴더 이름"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500/50"
              />
              <button
                type="button"
                onClick={createFolder}
                className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
              >
                생성
              </button>
            </div>
          )}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveFolderId(ALL_FOLDERS_ID)}
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
                onClick={() => setActiveFolderId(folder.id)}
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
            const unit = getAgentOntologyUnit(agent);
            return (
            <div
              key={agent.id}
              className="surface-card group flex items-center rounded-2xl p-3 transition-all hover:-translate-y-0.5 hover:border-blue-300/25 hover:shadow-lg hover:shadow-blue-950/20"
            >
              <div
                className="flex min-w-0 flex-1 items-center"
              >
                <div className="mr-3 text-xl">{agent.creator_avatar}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-gray-100 transition-colors group-hover:text-blue-200">{agent.name}</div>
                  <div className="truncate text-xs text-gray-500">{unit.name} · {agent.unit_role || unit.memberRole}</div>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
                    <span className={`rounded border border-white/10 bg-black/25 px-1.5 py-0.5 ${unit.accent}`}>
                      {unit.shortLabel}
                    </span>
                    <Folder className="h-3 w-3 text-gray-600" />
                    <select
                      value={currentFolderId}
                      onChange={(event) => moveAgentToFolder(agent.id, event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onDragStart={(event) => event.preventDefault()}
                      className="max-w-[120px] rounded-md border border-white/10 bg-black/30 px-1.5 py-0.5 text-[10px] text-gray-300 outline-none hover:border-white/20"
                      aria-label={`${agent.name} 폴더 이동`}
                      title="폴더 이동"
                    >
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              {activeTab === "pool" ? (
                <>
                  <button
                    type="button"
                    onClick={() => saveToLibrary(agent)}
                    className={`relative z-10 mr-1 shrink-0 rounded-lg p-1 transition-colors hover:bg-white/10 ${
                      inLibrary ? "text-yellow-300" : "text-gray-500 hover:text-yellow-300"
                    }`}
                    aria-label={inLibrary ? `${agent.name} 라이브러리에서 보기` : `${agent.name} 라이브러리에 저장`}
                    title={inLibrary ? "라이브러리에서 보기" : "라이브러리에 저장"}
                  >
                    {inLibrary ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                  </button>
                  <Link
                    href={`/studio?panel=agents&agent=${encodeURIComponent(agent.id)}`}
                    onClick={(event) => event.stopPropagation()}
                    onDragStart={(event) => event.preventDefault()}
                    className="relative z-10 mr-1 shrink-0 rounded-lg p-1 text-gray-500 transition-colors hover:bg-white/10 hover:text-cyan-300"
                    aria-label={`${agent.name} 설정`}
                    title="에이전트 설정"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    onClick={() => fireAgent(agent.id)}
                    className="relative z-10 shrink-0 rounded-lg p-1 text-gray-600 opacity-0 transition-all hover:bg-white/10 hover:text-red-400 group-hover:opacity-100"
                    aria-label={`${agent.name} 제거`}
                    title="에이전트 풀에서 제거"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => hireAgent(agent)}
                    disabled={inPool}
                    className={`relative z-10 mr-1 shrink-0 rounded-lg p-1 transition-colors ${
                      inPool
                        ? "cursor-default text-emerald-300"
                        : "text-gray-500 hover:bg-white/10 hover:text-blue-300"
                    }`}
                    aria-label={inPool ? `${agent.name} 에이전트 풀에 있음` : `${agent.name} 에이전트 풀에 추가`}
                    title={inPool ? "에이전트 풀에 있음" : "에이전트 풀에 추가"}
                  >
                    {inPool ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAgentFromLibrary(agent.id)}
                    className="relative z-10 shrink-0 rounded-lg p-1 text-gray-600 opacity-0 transition-all hover:bg-white/10 hover:text-red-400 group-hover:opacity-100"
                    aria-label={`${agent.name} 라이브러리에서 제거`}
                    title="라이브러리에서 제거"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
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
