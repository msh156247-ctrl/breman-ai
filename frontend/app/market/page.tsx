"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Sparkles, TrendingUp, ChevronDown, Activity, Clock3, ShieldCheck, GitBranch } from "lucide-react";
import AgentCard from "../../components/market/AgentCard";
import TeamCard from "../../components/market/TeamCard";
import { MOCK_AGENTS, MOCK_TEAMS } from "../../lib/mock-data";
import { CATEGORY_CONFIG } from "../../lib/constants";
import { useAppStore } from "../../stores/app.store";
import type { AgentCategory, SortOption } from "../../types";

const CONNECTED_APIS = ["openai", "anthropic"];

function MarketPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    activeTab,
    setActiveTab,
    category,
    setCategory,
    search,
    setSearch,
    sort,
    setSort,
    availableOnly,
    setAvailableOnly,
    teamLinks,
    nodes,
    hiredAgents
  } = useAppStore();

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "teams") setActiveTab("teams");
    else setActiveTab("agents");
  }, [searchParams, setActiveTab]);

  const goTab = (tab: "agents" | "teams") => {
    setActiveTab(tab);
    router.replace(`/market?tab=${tab}`, { scroll: false });
  };

  const filteredAgents = useMemo(() => {
    let r = [...MOCK_AGENTS];
    if (category !== "전체") r = r.filter((a) => a.category === category);
    if (search) {
      r = r.filter(
        (a) => a.name.includes(search) || a.description.includes(search) || a.tags.some((t) => t.includes(search))
      );
    }
    if (availableOnly) r = r.filter((a) => CONNECTED_APIS.includes(a.required_api));

    switch (sort) {
      case "rating":
        return r.sort((a, b) => b.rating - a.rating);
      case "usage":
        return r.sort((a, b) => b.usage_count - a.usage_count);
      case "price_low":
        return r.sort((a, b) => a.royalty_per_use - b.royalty_per_use);
      default:
        return r.sort((a, b) => Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured)));
    }
  }, [availableOnly, category, search, sort]);

  const filteredTeams = useMemo(() => {
    let r = [...MOCK_TEAMS];
    if (category !== "전체") r = r.filter((t) => t.category === category);
    if (search) {
      r = r.filter(
        (t) => t.name.includes(search) || t.description.includes(search) || t.tags.some((tag) => tag.includes(search))
      );
    }
    return r.sort((a, b) => b.rating - a.rating);
  }, [category, search]);

  const categories = Object.entries(CATEGORY_CONFIG) as [AgentCategory, { emoji: string; color: string }][];
  const spotlightAgent = filteredAgents[0] || MOCK_AGENTS[0];
  const runtimeEvents = [
    "Planner 완료: 요구사항 정리",
    "Router 분기: QA Team 라우팅",
    "QA 피드백: schema mismatch 감지",
    "Retry 트리거: Backend Executor 재실행",
    "Artifact 전달: api_spec.json -> Deploy Team"
  ];

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
        <div className="mb-4 flex items-center space-x-2">
          <Sparkles className="h-4 w-4 text-yellow-400" />
          <span className="text-sm font-semibold uppercase tracking-wide text-yellow-400">Workforce Marketplace</span>
        </div>
        <h1 className="mb-4 text-5xl font-black leading-tight tracking-tight">
          역할을 채용하고
          <br />
          <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">실행 조직</span>
          을 설계하세요
        </h1>
        <p className="max-w-2xl text-xl leading-relaxed text-gray-500">
          팀원/팀 자산을 조합해 역할 기반 프로세스를 만들고, 팀 간 실행을 오케스트레이션하세요.
        </p>
      </motion.div>

      <div className="relative mb-8">
        <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-600" />
        <input
          type="text"
          placeholder="팀원/팀을 검색하세요... (예: 코드 리뷰, 보안 검토, 배포)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-2xl border border-white/8 bg-[#111111] py-4 pl-14 pr-6 text-[15px] outline-none transition-colors placeholder:text-gray-700 focus:border-blue-500/50"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex w-fit space-x-1 rounded-2xl border border-white/5 bg-[#111111] p-1">
              <button
                type="button"
                onClick={() => goTab("agents")}
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
                  activeTab === "agents"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                팀원 ({filteredAgents.length})
              </button>
              <button
                type="button"
                onClick={() => goTab("teams")}
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
                  activeTab === "teams"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                팀 ({filteredTeams.length})
              </button>
            </div>

            <div className="flex items-center space-x-3">
              <label className="flex cursor-pointer items-center space-x-2.5">
                <div
                  onClick={() => setAvailableOnly(!availableOnly)}
                  className={`relative w-10 rounded-full transition-all ${availableOnly ? "bg-blue-600" : "bg-gray-800"}`}
                  style={{ height: "22px" }}
                >
                  <div
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                      availableOnly ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </div>
                <span className="select-none text-sm text-gray-400">내 API만 보기</span>
              </label>

              <div className="relative">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortOption)}
                  className="appearance-none rounded-xl border border-white/8 bg-[#111111] py-2.5 pl-4 pr-9 text-sm text-gray-300 outline-none"
                >
                  <option value="recommended">추천순</option>
                  <option value="rating">평점순</option>
                  <option value="usage">사용량순</option>
                  <option value="price_low">가격 낮은순</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
              </div>
            </div>
          </div>

          <div className="scrollbar-hide mb-10 flex space-x-2 overflow-x-auto pb-2">
            {categories.map(([label, { emoji, color }]) => (
              <button
                key={label}
                onClick={() => setCategory(label)}
                className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  category === label
                    ? "text-white shadow-lg"
                    : "border border-white/5 bg-[#111111] text-gray-500 hover:text-gray-300"
                }`}
                style={
                  category === label
                    ? {
                        background: `${color}20`,
                        border: `1px solid ${color}40`,
                        color
                      }
                    : undefined
                }
              >
                <span>{emoji}</span> <span>{label}</span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === "agents" ? (
              <motion.div
                key="agents"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                {category === "전체" && !search && (
                  <section className="mb-12">
                    <div className="mb-5 flex items-center space-x-2">
                      <TrendingUp className="h-4 w-4 text-orange-400" />
                      <h2 className="font-bold text-orange-400">인기 팀원</h2>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {MOCK_AGENTS.filter((a) => a.is_featured).map((agent) => (
                        <AgentCard key={agent.id} agent={agent} connectedApis={CONNECTED_APIS} />
                      ))}
                    </div>
                  </section>
                )}

                <section>
                  <div className="mb-5 flex items-center justify-between">
                    <h2 className="font-bold text-gray-400">
                      {search
                        ? `"${search}" 검색결과`
                        : category !== "전체"
                          ? `${CATEGORY_CONFIG[category].emoji} ${category}`
                          : "전체 팀원"}
                    </h2>
                    <span className="text-sm text-gray-600">{filteredAgents.length}개</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredAgents.map((agent) => (
                      <AgentCard key={agent.id} agent={agent} connectedApis={CONNECTED_APIS} />
                    ))}
                  </div>
                  {filteredAgents.length === 0 && (
                    <div className="py-24 text-center text-gray-700">
                      <div className="mb-4 text-5xl">🔍</div>
                      <div className="text-lg font-semibold">검색 결과가 없어요</div>
                      <div className="mt-2 text-sm">다른 키워드로 검색해보세요</div>
                    </div>
                  )}
                </section>
              </motion.div>
            ) : (
              <motion.div
                key="teams"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-bold text-gray-300">인기 워크플로우</h2>
                  <span className="text-xs text-gray-500">가져온 후 수정 가능</span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredTeams.map((team) => (
                    <TeamCard key={team.id} team={team} />
                  ))}
                </div>
                {filteredTeams.length === 0 && (
                  <div className="py-24 text-center text-gray-700">
                    <div className="mb-4 text-5xl">👥</div>
                    <div className="text-lg font-semibold">팀 검색 결과가 없어요</div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="panel-shell p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-cyan-300">팀 연결</h3>
                <span className="text-xs text-gray-500">{teamLinks.length} links</span>
              </div>
              <div className="space-y-2 text-xs">
                {teamLinks.slice(0, 4).map((link, idx) => (
                  <div key={`${link.from}-${link.to}-${idx}`} className="log-row px-3 py-2 text-gray-300">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-3.5 w-3.5 text-cyan-300" />
                      <span className="font-medium">{link.from}</span>
                      <span>→</span>
                      <span className="font-medium">{link.to}</span>
                    </div>
                    <div className="mt-1 text-gray-500">artifact: {link.artifact} · mode: {link.mode} · SLA: {link.sla}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-shell p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-purple-300">스튜디오 캔버스 프리뷰</h3>
                <span className="text-xs text-gray-500">nodes {nodes.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {nodes.slice(0, 6).map((node) => (
                  <div key={node.id} className="stat-chip bg-black/30 px-2.5 py-2 text-gray-300">
                    <div className="truncate font-medium text-gray-100">{String((node.data as { label?: string })?.label || node.id)}</div>
                    <div className="mt-1 text-gray-500">mode: {String((node.data as { execution_mode?: string })?.execution_mode || "auto")}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="panel-shell p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Role Spotlight</div>
              <button className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-500">
                + 추가
              </button>
            </div>
            <div className="mb-2 text-xs text-gray-500">{spotlightAgent.required_api.toUpperCase()} · {spotlightAgent.model_name || "model"}</div>
            <div className="text-base font-bold text-gray-100">{spotlightAgent.name}</div>
            <div className="mt-2 text-xs leading-relaxed text-gray-400">{spotlightAgent.description}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              <div className="stat-chip bg-black/30 p-2 text-center">
                <div className="text-gray-500">평점</div>
                <div className="font-semibold text-yellow-300">{spotlightAgent.rating}</div>
              </div>
              <div className="stat-chip bg-black/30 p-2 text-center">
                <div className="text-gray-500">실행</div>
                <div className="font-semibold text-cyan-300">{spotlightAgent.usage_count.toLocaleString()}</div>
              </div>
              <div className="stat-chip bg-black/30 p-2 text-center">
                <div className="text-gray-500">성공률</div>
                <div className="font-semibold text-emerald-300">{spotlightAgent.success_rate ?? 0}%</div>
              </div>
            </div>
          </div>

          <div className="panel-shell p-4">
            <h3 className="mb-3 text-sm font-semibold text-green-300">연결된 팀</h3>
            <div className="space-y-2 text-xs">
              {MOCK_TEAMS.slice(0, 3).map((team) => (
                <div key={team.id} className="log-row px-3 py-2">
                  <div className="font-medium text-gray-200">{team.name}</div>
                  <div className="mt-1 text-gray-500">{team.description.slice(0, 56)}...</div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel-shell p-4">
            <h3 className="mb-3 text-sm font-semibold text-indigo-300">시뮬레이터 로그</h3>
            <div className="space-y-2 text-xs">
              {runtimeEvents.map((log, idx) => (
                <div key={log} className="log-row flex items-start gap-2 px-2 py-1.5 text-gray-300">
                  <Activity className={`mt-0.5 h-3.5 w-3.5 ${idx % 2 === 0 ? "text-green-300" : "text-cyan-300"}`} />
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel-shell p-4">
            <h3 className="mb-3 text-sm font-semibold text-yellow-300">운영 상태</h3>
            <div className="space-y-2 text-xs text-gray-300">
              <div className="log-row flex items-center justify-between px-2 py-1.5">
                <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5 text-yellow-300" /> 평균 완료 시간</span>
                <span>14m 20s</span>
              </div>
              <div className="log-row flex items-center justify-between px-2 py-1.5">
                <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> 승인 성공률</span>
                <span>96.2%</span>
              </div>
              <div className="log-row flex items-center justify-between px-2 py-1.5">
                <span>활성 팀원</span>
                <span>{hiredAgents.length}명</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function MarketPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[40vh] max-w-[1500px] items-center justify-center px-6 text-gray-500">
          마켓 로딩 중…
        </div>
      }
    >
      <MarketPageInner />
    </Suspense>
  );
}
