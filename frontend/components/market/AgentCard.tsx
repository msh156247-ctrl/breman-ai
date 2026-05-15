"use client";

import { Check, Plus, Star, Zap } from "lucide-react";
import { Code, FileText, Image } from "lucide-react";
import Link from "next/link";
import { API_PROVIDER_CONFIG, CATEGORY_CONFIG } from "../../lib/constants";
import { useAppStore } from "../../stores/app.store";
import { Agent } from "../../types";

interface AgentCardProps {
  agent: Agent;
  connectedApis?: string[];
}

const IO_ICONS = {
  text: FileText,
  code: Code,
  image: Image
};

export default function AgentCard({ agent, connectedApis = [] }: AgentCardProps) {
  const { hireAgent, fireAgent, isHired } = useAppStore();
  const hired = isHired(agent.id);
  const isAvailable = connectedApis.includes(agent.required_api);
  const provider = API_PROVIDER_CONFIG[agent.required_api];
  const category = CATEGORY_CONFIG[agent.category];
  const InputIcon = IO_ICONS[agent.input_type || "text"];
  const OutputIcon = IO_ICONS[agent.output_type || "text"];

  return (
    <div
      className={`group relative flex cursor-pointer flex-col rounded-2xl border bg-[#111111] p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50 ${
        hired ? "border-blue-500/40 shadow-lg shadow-blue-500/10" : "border-white/5 hover:border-white/15"
      }`}
    >
      {agent.is_featured && (
        <div className="absolute -top-2.5 left-4 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 px-2.5 py-0.5 text-xs font-bold text-black">
          🔥 인기
        </div>
      )}

      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/5 bg-[#1A1A1A] text-2xl transition-transform group-hover:scale-110">
            {agent.creator_avatar}
          </div>
          <div>
            <div className="text-xs text-gray-600">@{agent.creator}</div>
            <div className="mt-0.5 flex items-center space-x-1">
              <span className="text-xs" style={{ color: category.color }}>
                {category.emoji}
              </span>
              <span className="text-xs text-gray-500">{agent.category}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end space-y-1.5">
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{
              background: provider.bg,
              color: provider.color,
              border: `1px solid ${provider.color}30`
            }}
          >
            {provider.label}
          </span>
          <span className={`text-xs ${isAvailable ? "text-green-400" : "text-gray-600"}`}>
            {isAvailable ? "✓ 사용가능" : "키 필요"}
          </span>
        </div>
      </div>

      <h3 className="mb-2 line-clamp-1 text-[15px] font-bold leading-snug transition-colors group-hover:text-blue-400">
        {agent.name}
      </h3>
      <div className="mb-2 text-[11px] text-gray-500">
        {agent.model_name || "Model"} {agent.model_version ? `• ${agent.model_version}` : ""}{" "}
        {agent.updated_at ? `• ${agent.updated_at}` : ""}
      </div>
      <p className="mb-4 line-clamp-2 flex-1 text-xs leading-relaxed text-gray-500">{agent.description}</p>

      <div className="mb-4 flex items-center space-x-2 text-xs text-gray-600">
        <div className="flex items-center space-x-1">
          <InputIcon className="h-3 w-3" />
          <span>{agent.input_type || "text"}</span>
        </div>
        <span>→</span>
        <div className="flex items-center space-x-1">
          <OutputIcon className="h-3 w-3" />
          <span>{agent.output_type || "text"}</span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {agent.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-lg border border-white/5 bg-white/5 px-2 py-0.5 text-xs text-gray-500">
            {tag}
          </span>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between border-t border-white/5 pt-3">
        <div className="flex items-center space-x-1.5">
          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
          <span className="text-sm font-bold">{agent.rating}</span>
          <span className="text-xs text-gray-600">({agent.usage_count.toLocaleString()})</span>
        </div>
        <div className="flex items-center space-x-1">
          <Zap className="h-3 w-3 text-yellow-500" />
          <span className="font-mono text-xs text-green-400">${agent.royalty_per_use}/실행</span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-1 text-[10px]">
        <div className="rounded bg-white/5 p-1 text-center text-gray-400">
          <div>지연</div>
          <div className="font-semibold text-gray-200">{agent.avg_latency_ms ?? 0}ms</div>
        </div>
        <div className="rounded bg-white/5 p-1 text-center text-gray-400">
          <div>성공률</div>
          <div className="font-semibold text-green-300">{agent.success_rate ?? 0}%</div>
        </div>
        <div className="rounded bg-white/5 p-1 text-center text-gray-400">
          <div>재사용률</div>
          <div className="font-semibold text-cyan-300">{agent.reuse_rate ?? 0}%</div>
        </div>
      </div>

      <div className="mb-2">
        <Link href={`/market/member/${agent.id}`} className="text-xs text-blue-300 hover:text-blue-200">
          상세 프로필 보기
        </Link>
      </div>

      <button
        onClick={() => (hired ? fireAgent(agent.id) : isAvailable && hireAgent(agent))}
        disabled={!isAvailable && !hired}
        className={`flex w-full items-center justify-center space-x-2 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 ${
          hired
            ? "border border-blue-500/30 bg-blue-500/15 text-blue-400 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
            : isAvailable
              ? "bg-blue-600 text-white hover:scale-[1.02] hover:bg-blue-500 active:scale-[0.98]"
              : "cursor-not-allowed border border-white/5 bg-white/5 text-gray-600"
        }`}
      >
        {hired ? (
          <>
            <Check className="h-4 w-4" />
            <span>채용됨 (클릭시 해제)</span>
          </>
        ) : isAvailable ? (
          <>
            <Plus className="h-4 w-4" />
            <span>조직에 배치하기</span>
          </>
        ) : (
          <span>{provider.label} API 키 필요</span>
        )}
      </button>
    </div>
  );
}
