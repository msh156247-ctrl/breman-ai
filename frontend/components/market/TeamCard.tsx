"use client";

import { ArrowRight, Clock, DollarSign, Star, Users } from "lucide-react";
import Link from "next/link";
import { TeamTemplate } from "../../types";

export default function TeamCard({ team }: { team: TeamTemplate }) {
  return (
    <div className="group rounded-2xl border border-gray-800 bg-gray-900 p-6 transition-all hover:-translate-y-0.5 hover:border-purple-600/50">
      {team.is_featured && (
        <div className="mb-3 inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-xs font-bold text-purple-400">
          🏆 검증된 팀
        </div>
      )}
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="font-black group-hover:text-purple-400">{team.name}</h3>
          <p className="text-xs text-gray-500">by @{team.creator}</p>
        </div>
        <div className="flex items-center gap-1">
          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
          <span className="font-bold">{team.rating}</span>
        </div>
      </div>
      <p className="mb-3 line-clamp-2 text-sm text-gray-400">{team.description}</p>
      <div className="mb-3 flex items-center gap-2 overflow-x-auto rounded-xl bg-gray-800/50 p-3">
        {team.workflow.map((step, idx) => (
          <div key={`${step}-${idx}`} className="flex items-center gap-2 text-xs text-gray-300">
            <span className="rounded bg-purple-700/40 px-2 py-1">{step}</span>
            {idx < team.workflow.length - 1 && <ArrowRight className="h-3 w-3 text-gray-500" />}
          </div>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded bg-gray-800/60 p-2 text-center">
          <Users className="mx-auto mb-1 h-3.5 w-3.5 text-blue-400" />
          {team.usage_count.toLocaleString()}
        </div>
        <div className="rounded bg-gray-800/60 p-2 text-center">
          <Clock className="mx-auto mb-1 h-3.5 w-3.5 text-green-400" />
          {team.estimated_time}
        </div>
        <div className="rounded bg-gray-800/60 p-2 text-center">
          <DollarSign className="mx-auto mb-1 h-3.5 w-3.5 text-yellow-400" />${team.estimated_cost}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="flex-1 rounded-xl bg-purple-600 py-2 text-sm font-semibold hover:bg-purple-500">가져오기</button>
        <Link href={`/market/team/${team.id}`} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-300 hover:bg-white/5">
          상세
        </Link>
      </div>
    </div>
  );
}
