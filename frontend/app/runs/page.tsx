"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Activity, ArrowRight, Clock, Filter, PlayCircle, Search } from "lucide-react";
import { MOCK_MISSION_RUNS, type MockMissionRunRecord } from "../../lib/mock-data";

const STATE_STYLE: Record<MockMissionRunRecord["state"], string> = {
  queued: "border-slate-500/40 bg-slate-900/40 text-slate-200",
  running: "border-blue-500/40 bg-blue-900/30 text-blue-200",
  completed: "border-emerald-500/40 bg-emerald-900/25 text-emerald-200",
  failed: "border-rose-500/40 bg-rose-900/25 text-rose-200",
  awaiting_approval: "border-amber-500/40 bg-amber-900/25 text-amber-200",
  blocked: "border-violet-500/40 bg-violet-900/25 text-violet-200"
};

const STATE_LABEL: Record<MockMissionRunRecord["state"], string> = {
  queued: "대기",
  running: "실행 중",
  completed: "완료",
  failed: "실패",
  awaiting_approval: "승인 대기",
  blocked: "차단"
};

type FilterKey = "all" | MockMissionRunRecord["state"];

export default function RunsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const rows = useMemo(() => {
    let r = [...MOCK_MISSION_RUNS];
    if (filter !== "all") r = r.filter((row) => row.state === filter);
    if (q.trim()) {
      const n = q.trim().toLowerCase();
      r = r.filter(
        (row) =>
          row.goal.toLowerCase().includes(n) ||
          row.team_label.toLowerCase().includes(n) ||
          row.id.toLowerCase().includes(n)
      );
    }
    return r.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
  }, [filter, q]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 text-white">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <Link href="/" className="hover:text-gray-300">
          홈
        </Link>
        <span>/</span>
        <span className="text-gray-400">실행 기록</span>
      </div>
      <h1 className="mb-2 text-3xl font-black">실행 기록</h1>
      <p className="mb-8 text-sm text-gray-400">
        MissionRun 단위로 런타임 옵저버빌리티에 진입합니다. 데모 미션은 WebSocket 없이 로컬 시뮬레이션됩니다.
      </p>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="목표, 팀, 미션 ID 검색…"
            className="w-full rounded-xl border border-white/10 bg-[#111] py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-gray-600 focus:border-blue-500/40"
          />
        </div>
        <button
          type="button"
          onClick={() => router.push(`/chat/demo-${Date.now()}`)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold hover:bg-blue-500 sm:shrink-0"
        >
          <PlayCircle className="h-4 w-4" />
          새 데모 미션
        </button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <Filter className="h-3.5 w-3.5" />
          상태
        </span>
        {(["all", "running", "awaiting_approval", "blocked", "completed", "failed", "queued"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
              filter === key ? "bg-white/15 text-white" : "bg-black/40 text-gray-500 hover:text-gray-300"
            }`}
          >
            {key === "all" ? "전체" : STATE_LABEL[key]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/chat/${row.id}`}
            className="block rounded-2xl border border-white/8 bg-[#111] p-4 transition hover:border-blue-500/35 hover:bg-[#141414]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <code className="rounded bg-black/50 px-1.5 py-0.5 text-[11px] text-cyan-300">{row.id}</code>
                  {row.demo ? (
                    <span className="rounded border border-cyan-500/30 bg-cyan-900/20 px-1.5 py-0.5 text-[10px] text-cyan-200">
                      DEMO
                    </span>
                  ) : null}
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${STATE_STYLE[row.state]}`}>
                    {STATE_LABEL[row.state]}
                  </span>
                </div>
                <div className="font-medium text-gray-100">{row.goal}</div>
                <div className="mt-1 text-xs text-gray-500">{row.team_label}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-gray-400">
                <div className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {row.started_at.replace("T", " ").slice(0, 16)}
                </div>
                <div className="flex items-center gap-3">
                  <span>~${row.est_cost_usd.toFixed(3)}</span>
                  <span>{row.latency_sec}s</span>
                </div>
                <span className="mt-1 flex items-center gap-0.5 text-blue-400">
                  옵스룸 <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          <Activity className="mx-auto mb-3 h-10 w-10 opacity-40" />
          조건에 맞는 실행이 없습니다.
        </div>
      ) : null}

      <p className="mt-8 text-center text-xs text-gray-600">
        실제 백엔드 연동 시 이 목록은 MissionRun 컬렉션에서 페이지네이션됩니다.
      </p>
    </div>
  );
}
