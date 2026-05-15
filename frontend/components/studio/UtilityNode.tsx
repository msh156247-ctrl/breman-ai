"use client";

import { memo } from "react";
import { Handle, Position } from "reactflow";

function UtilityNode({ data, selected }: { data: any; selected: boolean }) {
  const color = data.node_color || "#6b7280";
  return (
    <div
      className={`relative min-w-[190px] rounded-xl border bg-[#0f172a] p-4 transition-all ${
        selected ? "border-cyan-500 shadow-lg shadow-cyan-500/20" : "border-white/10"
      }`}
    >
      <Handle type="target" position={Position.Left} className="h-3 w-3 border-2 border-[#0f172a] bg-gray-600" />
      <div className="flex items-center gap-2">
        <div className="text-xl">{data.avatar || "🔧"}</div>
        <div>
          <div className="text-sm font-bold text-white">{data.label}</div>
          <div className="text-xs" style={{ color }}>
            {data.category}
          </div>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-gray-400">{data.system_prompt}</p>
      <Handle type="source" position={Position.Right} className="h-3 w-3 border-2 border-[#0f172a] bg-cyan-500" />
    </div>
  );
}

export default memo(UtilityNode);
