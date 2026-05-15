"use client";

import { GripVertical, Search, Trash2 } from "lucide-react";
import { useAppStore } from "../../stores/app.store";

export default function AgentPoolPanel() {
  const { hiredAgents, fireAgent } = useAppStore();

  const onDragStart = (event: React.DragEvent, payload: unknown) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
  };

  const utilityNodes = [
    { kind: "router", label: "Router Node", description: "조건 기반 라우팅 (if/else, risk score)" },
    { kind: "hitl", label: "Human Approval", description: "사람 승인 체인 및 정책 게이트" },
    { kind: "team", label: "Team Node", description: "팀 단위 실행/위임 오케스트레이션" }
  ] as const;

  return (
    <div className="flex h-full w-80 flex-col border-r border-white/5 bg-[#0A0A0A]">
      <div className="border-b border-white/5 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">내 팀원 풀</h2>
          <span className="rounded-full bg-white/5 px-2 py-1 text-xs text-gray-500">{hiredAgents.length}명</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="배치된 팀원 검색..."
            className="w-full rounded-xl border border-white/10 bg-[#111111] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {hiredAgents.length === 0 ? (
          <div className="py-12 text-center text-gray-600">
            <div className="mb-3 text-4xl">🤖</div>
            <div className="text-sm">아직 배치된 팀원이 없어요</div>
            <div className="mt-1 text-xs text-gray-700">마켓에서 팀원을 가져와 배치해보세요</div>
          </div>
        ) : (
          hiredAgents.map((agent) => (
            <div
              key={agent.id}
              draggable
              onDragStart={(e) => onDragStart(e, { payloadType: "agent", data: agent })}
              className="group flex cursor-grab items-center rounded-xl border border-white/5 bg-[#111111] p-3 transition-all hover:border-white/15 hover:shadow-lg hover:shadow-black/20"
            >
              <GripVertical className="mr-3 h-4 w-4 text-gray-600 group-hover:text-gray-400" />
              <div className="mr-3 text-xl">{agent.creator_avatar}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold transition-colors group-hover:text-blue-400">{agent.name}</div>
                <div className="truncate text-xs text-gray-500">{agent.category}</div>
              </div>
              <button
                onClick={() => fireAgent(agent.id)}
                className="p-1 text-gray-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-white/5 p-4">
        <div className="mb-2 text-xs font-semibold text-gray-400">Node Palette</div>
        <div className="space-y-2">
          {utilityNodes.map((node) => (
            <div
              key={node.kind}
              draggable
              onDragStart={(e) => onDragStart(e, { payloadType: "utility", data: node })}
              className="cursor-grab rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-xs text-gray-300 hover:border-cyan-500/40"
            >
              {node.label}
            </div>
          ))}
        </div>
      </div>

      {hiredAgents.length > 0 && (
        <div className="border-t border-white/5 bg-[#111111]/50 p-4">
          <div className="text-center text-xs text-gray-600">💡 팀원을 캔버스로 드래그해서 실행 조직을 설계하세요</div>
        </div>
      )}
    </div>
  );
}
