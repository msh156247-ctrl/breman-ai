import { Bot } from "lucide-react";
import { getAgentOntologyUnit } from "../../lib/ontology";
import type { Agent } from "../../types";

type StudioAgentPoolSidebarProps = {
  workspaceHydrated: boolean;
  hiredAgents: Agent[];
  canvasNodeCount: number;
  selectedAgentId?: string;
  onSelectAgent: (agentId: string) => void;
};

export function StudioAgentPoolSidebar({
  workspaceHydrated,
  hiredAgents,
  canvasNodeCount,
  selectedAgentId,
  onSelectAgent
}: StudioAgentPoolSidebarProps) {
  return (
    <aside className="panel-shell min-h-0 rounded-2xl lg:overflow-hidden">
      <div className="border-b border-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-blue-300" />
            <h2 className="text-sm font-semibold">에이전트 풀</h2>
          </div>
          <span className="rounded-full bg-white/5 px-2 py-1 text-xs text-gray-500">
            {workspaceHydrated ? `${hiredAgents.length}개` : "..."}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-gray-500">
          <div className="rounded-lg bg-black/25 px-2 py-2">
            <div className="text-sm font-semibold text-gray-200">{hiredAgents.length}</div>
            에이전트
          </div>
          <div className="rounded-lg bg-black/25 px-2 py-2">
            <div className="text-sm font-semibold text-gray-200">{canvasNodeCount}</div>
            노드
          </div>
          <div className="rounded-lg bg-black/25 px-2 py-2">
            <div className="text-sm font-semibold text-gray-200">
              {hiredAgents.filter((agent) => agent.id.startsWith("custom-")).length}
            </div>
            직접 추가
          </div>
        </div>
      </div>
      <div className="max-h-[320px] space-y-2 overflow-y-auto p-3 lg:h-[calc(100vh-18rem)] lg:max-h-none">
        {!workspaceHydrated ? (
          [0, 1, 2].map((index) => (
            <div key={index} className="h-14 animate-pulse rounded-xl border border-white/5 bg-black/25" />
          ))
        ) : hiredAgents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-sm text-gray-500">
            에이전트가 없습니다.
          </div>
        ) : (
          hiredAgents.map((agent) => {
            const unit = getAgentOntologyUnit(agent);
            return (
              <button
                type="button"
                key={agent.id}
                onClick={() => onSelectAgent(agent.id)}
                className={`flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                  selectedAgentId === agent.id
                    ? "border-blue-400/60 bg-blue-500/10"
                    : "border-white/5 bg-black/20 hover:border-white/15 hover:bg-white/5"
                }`}
              >
                <span className="text-xl">{agent.creator_avatar}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{agent.name}</span>
                  <span className="block truncate text-xs text-gray-500">
                    {unit.name} · {agent.unit_role || unit.memberRole}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
