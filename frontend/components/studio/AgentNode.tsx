"use client";

import { memo } from "react";
import { Handle, Position } from "reactflow";
import { Settings } from "lucide-react";
import { API_PROVIDER_CONFIG } from "../../lib/constants";

function AgentNode({ data, selected }: { data: any; selected: boolean }) {
  const provider =
    API_PROVIDER_CONFIG[data.required_api as keyof typeof API_PROVIDER_CONFIG] || { color: "#6B7280" };

  return (
    <div
      className={`relative min-w-[200px] rounded-xl border bg-[#111111] p-4 transition-all ${
        selected ? "border-blue-500 shadow-lg shadow-blue-500/20" : "border-white/10"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="h-3 w-3 border-2 border-[#111111] bg-gray-700 transition-colors hover:bg-blue-500"
      />

      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center space-x-2">
          <div className="text-xl">{data.avatar}</div>
          <div>
            <div className="line-clamp-1 text-sm font-bold text-white">{data.label}</div>
            <div className="text-xs text-gray-500">{data.category}</div>
          </div>
        </div>
        {selected && <Settings className="h-4 w-4 animate-pulse text-blue-400" />}
      </div>

      <div className="mb-3">
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            data.execution_mode === "auto"
              ? "border border-green-500/30 bg-green-500/20 text-green-400"
              : "border border-yellow-500/30 bg-yellow-500/20 text-yellow-400"
          }`}
        >
          {data.execution_mode === "auto" ? "자동 실행" : "승인 후 실행"}
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-white/5 pt-2">
        <span
          className="rounded px-1.5 py-0.5 text-[10px]"
          style={{ background: `${provider.color}20`, color: provider.color }}
        >
          {data.required_api}
        </span>
        <span className="font-mono text-xs text-gray-500">${data.royalty}/실행</span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="h-3 w-3 border-2 border-[#111111] bg-blue-500 transition-colors hover:bg-green-500"
      />
    </div>
  );
}

export default memo(AgentNode);
