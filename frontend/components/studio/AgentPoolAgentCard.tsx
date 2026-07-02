import Link from "next/link";
import { Bookmark, BookmarkCheck, Check, Folder, Plus, Settings, Trash2, X } from "lucide-react";
import { getAgentOntologyUnit } from "../../lib/ontology";
import type { MemberFolder } from "../../stores/app.store";
import type { Agent } from "../../types";
import type { PoolTab } from "./agent-pool-model";

type AgentPoolAgentCardProps = {
  agent: Agent;
  activeTab: PoolTab;
  folders: MemberFolder[];
  inPool: boolean;
  inLibrary: boolean;
  currentFolderId: string;
  onMoveToFolder: (agentId: string, folderId: string) => void;
  onSaveToLibrary: (agent: Agent) => void;
  onFireAgent: (agentId: string) => void;
  onHireAgent: (agent: Agent) => void;
  onRemoveFromLibrary: (agentId: string) => void;
};

export function AgentPoolAgentCard({
  agent,
  activeTab,
  folders,
  inPool,
  inLibrary,
  currentFolderId,
  onMoveToFolder,
  onSaveToLibrary,
  onFireAgent,
  onHireAgent,
  onRemoveFromLibrary
}: AgentPoolAgentCardProps) {
  const unit = getAgentOntologyUnit(agent);
  return (
    <div className="surface-card group flex items-center rounded-2xl p-3 transition-all hover:-translate-y-0.5 hover:border-blue-300/25 hover:shadow-lg hover:shadow-blue-950/20">
      <div className="flex min-w-0 flex-1 items-center">
        <div className="mr-3 text-xl">{agent.creator_avatar}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-gray-100 transition-colors group-hover:text-blue-200">{agent.name}</div>
          <div className="truncate text-xs text-gray-500">
            {unit.name} · {agent.unit_role || unit.memberRole}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
            <span className={`rounded border border-white/10 bg-black/25 px-1.5 py-0.5 ${unit.accent}`}>
              {unit.shortLabel}
            </span>
            <Folder className="h-3 w-3 text-gray-600" />
            <select
              value={currentFolderId}
              onChange={(event) => onMoveToFolder(agent.id, event.target.value)}
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
            onClick={() => onSaveToLibrary(agent)}
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
            type="button"
            onClick={() => onFireAgent(agent.id)}
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
            onClick={() => onHireAgent(agent)}
            disabled={inPool}
            className={`relative z-10 mr-1 shrink-0 rounded-lg p-1 transition-colors ${
              inPool ? "cursor-default text-emerald-300" : "text-gray-500 hover:bg-white/10 hover:text-blue-300"
            }`}
            aria-label={inPool ? `${agent.name} 에이전트 풀에 있음` : `${agent.name} 에이전트 풀에 추가`}
            title={inPool ? "에이전트 풀에 있음" : "에이전트 풀에 추가"}
          >
            {inPool ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onRemoveFromLibrary(agent.id)}
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
}
