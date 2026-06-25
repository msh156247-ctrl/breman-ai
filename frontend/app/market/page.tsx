"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Sparkles,
  TrendingUp,
  ChevronDown,
  GitBranch,
  Layers,
  PackagePlus
} from "lucide-react";
import AgentCard from "../../components/market/AgentCard";
import { MOCK_AGENTS } from "../../lib/mock-data";
import { CATEGORY_CONFIG } from "../../lib/constants";
import { fetchKeyStatuses, fetchMarketAgents } from "../../lib/api";
import { readSessionIdentity } from "../../lib/auth";
import { isDemoModeEnabled } from "../../lib/demo-mode";
import { getOntologyUnit } from "../../lib/ontology";
import { useAppStore } from "../../stores/app.store";
import type { Agent, AgentCategory, ProjectUnit, SortOption } from "../../types";

function uniqueProviders(providers: string[]): string[] {
  return Array.from(new Set(providers.filter(Boolean)));
}

function providersFromAgentAvailability(agents: Agent[]): string[] {
  return uniqueProviders([
    "mock",
    ...agents.filter((agent) => agent.available ?? (agent.required_api === "mock")).map((agent) => agent.required_api)
  ]);
}

function marketHref(search: string): string {
  const query = new URLSearchParams({ tab: "agents" });
  const trimmed = search.trim();
  if (trimmed) query.set("search", trimmed);
  return `/market?${query.toString()}`;
}

const OPERATION_TIPS = [
  {
    title: "코스트 관리",
    body: "초안·분류·요약은 저비용 모델이나 mock으로 먼저 돌리고, 최종 산출물 단계에만 고성능 모델을 배치하세요."
  },
  {
    title: "품질 관리",
    body: "작성 노드 뒤에는 검토 노드를 붙이고, 위험도가 높은 작업은 Human Approval로 멈춰서 승인 후 진행하세요."
  },
  {
    title: "재시도 절약",
    body: "Router 조건을 좁게 잡으면 불필요한 재시도와 토큰 낭비가 줄어듭니다. 실패 로그를 보고 조건을 주기적으로 조정하세요."
  }
];

function MarketPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParam = searchParams.get("search") ?? searchParams.get("q") ?? "";
  const {
    category,
    setCategory,
    search,
    setSearch,
    sort,
    setSort,
    availableOnly,
    setAvailableOnly,
    nodes,
    hiredAgents,
    projectUnits,
    hireAgent,
    createAgentFromUnit
  } = useAppStore();
  const isDemoMode = isDemoModeEnabled();
  const [liveAgents, setLiveAgents] = useState<Agent[]>([]);
  const [marketDataMode, setMarketDataMode] = useState<"demo" | "loading" | "live" | "fallback">("demo");
  const [connectedApis, setConnectedApis] = useState<string[]>(() =>
    uniqueProviders(MOCK_AGENTS.map((agent) => agent.required_api))
  );
  const [keyStatusMode, setKeyStatusMode] = useState<"demo" | "registered" | "restricted" | "fallback">("demo");

  useEffect(() => {
    if (isDemoMode) {
      setMarketDataMode("demo");
      setKeyStatusMode("demo");
      setConnectedApis(uniqueProviders(MOCK_AGENTS.map((agent) => agent.required_api)));
      return;
    }
    let cancelled = false;
    setMarketDataMode("loading");
    fetchMarketAgents({})
      .then((agents) => {
        if (cancelled) return;
        setLiveAgents(agents);
        setMarketDataMode("live");
        const fallbackApis = providersFromAgentAvailability(agents);
        setConnectedApis(fallbackApis);
        const role = readSessionIdentity().role;
        if (!["owner", "admin"].includes(role)) {
          setKeyStatusMode("restricted");
          return;
        }
        fetchKeyStatuses()
          .then((statuses) => {
            if (cancelled) return;
            const registeredApis = statuses.filter((row) => row.registered).map((row) => row.provider);
            const connected = uniqueProviders(["mock", ...registeredApis]);
            setConnectedApis(connected);
            setLiveAgents((current) =>
              current.map((agent) => ({
                ...agent,
                available: agent.runtime_supported !== false && connected.includes(agent.required_api)
              }))
            );
            setKeyStatusMode("registered");
          })
          .catch((error) => {
            if (cancelled) return;
            setConnectedApis(fallbackApis);
            setKeyStatusMode(String(error).includes(":403") ? "restricted" : "fallback");
          });
      })
      .catch(() => {
        if (cancelled) return;
        setMarketDataMode("fallback");
        setKeyStatusMode("fallback");
        setConnectedApis(providersFromAgentAvailability(MOCK_AGENTS));
      });
    return () => {
      cancelled = true;
    };
  }, [isDemoMode]);

  const agentSource = marketDataMode === "live" ? liveAgents : MOCK_AGENTS;
  const publishedProjectUnits = useMemo(
    () => projectUnits.filter((unit) => unit.published),
    [projectUnits]
  );

  useEffect(() => {
    setSearch(searchParam);
  }, [searchParam, setSearch]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    router.replace(marketHref(value), { scroll: false });
  };

  const addProjectUnitToStudio = (unit: ProjectUnit) => {
    const agentId = createAgentFromUnit(unit.id);
    if (!agentId) return;
    router.push(`/studio?panel=agents&agent=${encodeURIComponent(agentId)}&unit=${unit.base_unit_id}`);
  };

  const filteredAgents = useMemo(() => {
    let r = [...agentSource];
    if (category !== "전체") r = r.filter((a) => a.category === category);
    if (search) {
      const query = search.trim().toLocaleLowerCase();
      r = r.filter(
        (a) =>
          a.name.toLocaleLowerCase().includes(query) ||
          a.description.toLocaleLowerCase().includes(query) ||
          a.tags.some((tag) => tag.toLocaleLowerCase().includes(query))
      );
    }
    if (availableOnly) r = r.filter((a) => a.available ?? connectedApis.includes(a.required_api));

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
  }, [agentSource, availableOnly, category, connectedApis, search, sort]);

  const categories = Object.entries(CATEGORY_CONFIG) as [AgentCategory, { emoji: string; color: string }][];
  const spotlightAgent = filteredAgents[0] || agentSource[0] || MOCK_AGENTS[0];
  const spotlightHired = hiredAgents.some((agent) => agent.id === spotlightAgent.id);
  const spotlightAvailable =
    spotlightAgent.runtime_supported !== false &&
    (spotlightAgent.available ?? connectedApis.includes(spotlightAgent.required_api));
  const featuredAgents = agentSource.filter((agent) => agent.is_featured);

  const placeSpotlightAgent = () => {
    if (!spotlightAvailable && !spotlightHired) return;
    if (!spotlightHired) hireAgent(spotlightAgent);
    router.push(
      `/studio?panel=agents&agent=${encodeURIComponent(spotlightAgent.id)}&unit=${spotlightAgent.ontology_unit ?? "agent_profile"}`
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
        <div className="mb-4 flex items-center space-x-2">
          <Sparkles className="h-4 w-4 text-yellow-400" />
          <span className="text-sm font-semibold uppercase tracking-wide text-yellow-400">Agent Marketplace</span>
          <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
            {marketDataMode === "live"
              ? "LIVE DATA"
              : marketDataMode === "loading"
                ? "SYNCING"
                : marketDataMode === "fallback"
                  ? "LOCAL FALLBACK"
                  : "DEMO DATA"}
          </span>
          {marketDataMode === "live" ? (
            <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
              {keyStatusMode === "registered"
                ? "KEY STATUS"
                : keyStatusMode === "restricted"
                  ? "SERVER AVAILABLE"
                  : "KEY FALLBACK"}
            </span>
          ) : null}
        </div>
        <h1 className="mb-4 text-5xl font-black leading-tight tracking-tight">
          Unit에 맞는 에이전트를 고르고
          <br />
          <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">실행 역할</span>
          을 구성하세요
        </h1>
        <p className="max-w-2xl text-xl leading-relaxed text-gray-500">
          필요한 역할 에이전트를 가져와 Unit 책임, 비용, 승인 조건에 맞게 스튜디오 워크플로우에 배치하세요.
        </p>
      </motion.div>

      <div className="relative mb-8">
        <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-600" />
        <input
          type="text"
          placeholder="에이전트를 검색하세요... (예: 코드 리뷰, 보안 검토, 배포)"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full rounded-2xl border border-white/8 bg-[#111111] py-4 pl-14 pr-6 text-[15px] outline-none transition-colors placeholder:text-gray-700 focus:border-blue-500/50"
        />
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex w-fit items-center gap-2 rounded-2xl border border-white/5 bg-[#111111] px-4 py-2.5">
              <Sparkles className="h-4 w-4 text-blue-300" />
              <span className="text-sm font-semibold text-white">에이전트 마켓</span>
              <span className="text-xs text-gray-500">{filteredAgents.length}개</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={availableOnly}
                  aria-label="내 API로 실행 가능한 에이전트만 보기"
                  onClick={() => setAvailableOnly(!availableOnly)}
                  className={`relative min-h-9 w-12 rounded-full border transition-all ${
                    availableOnly ? "border-blue-400/30 bg-blue-600" : "border-white/10 bg-gray-800"
                  }`}
                >
                  <div
                    className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform ${
                      availableOnly ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="select-none text-sm text-gray-400">내 API만 보기</span>
              </div>

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

          <div className="mb-10 flex flex-wrap gap-2 pb-2">
            {categories.map(([label, { emoji, color }]) => (
              <button
                key={label}
                onClick={() => setCategory(label)}
                className={`min-h-10 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
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

          <section className="mb-10 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.045] p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-300">
                  <Layers className="h-4 w-4" />
                  Project Unit Market
                </div>
                <h2 className="mt-1 text-lg font-bold text-white">내가 게시한 Unit으로 에이전트 구성</h2>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  Studio에서 설계하고 버전을 저장한 Unit만 여기에 나타납니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/studio?panel=agents")}
                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/10"
              >
                Unit 만들기
              </button>
            </div>

            {publishedProjectUnits.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-gray-500">
                아직 프로젝트 마켓에 게시된 Unit이 없습니다. Studio의 Unit Builder에서 먼저 게시하세요.
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
                {publishedProjectUnits.map((unit) => {
                  const baseUnit = getOntologyUnit(unit.base_unit_id);
                  return (
                    <article key={unit.id} className="rounded-xl border border-white/10 bg-black/25 p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-white">{unit.name}</div>
                          <div className="mt-1 truncate text-xs text-gray-500">
                            {baseUnit.name} · {unit.member_role}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-lg border border-purple-400/20 bg-purple-500/10 px-2 py-1 text-[11px] font-semibold text-purple-200">
                          {unit.version}
                        </span>
                      </div>
                      <p className="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-gray-400">{unit.responsibility}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {unit.capabilities.slice(0, 3).map((capability) => (
                          <span key={capability} className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-gray-400">
                            {capability}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                          <GitBranch className="h-3.5 w-3.5 text-purple-300" />
                          {unit.versions.length} versions
                        </div>
                        <button
                          type="button"
                          onClick={() => addProjectUnitToStudio(unit)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-blue-500"
                        >
                          <PackagePlus className="h-3.5 w-3.5" />
                          가져오기
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <AnimatePresence mode="wait">
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
                    <h2 className="font-bold text-orange-400">인기 에이전트</h2>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
                    {(featuredAgents.length > 0 ? featuredAgents : agentSource.slice(0, 4)).map((agent) => (
                      <AgentCard key={agent.id} agent={agent} connectedApis={connectedApis} />
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
                        : "전체 에이전트"}
                  </h2>
                  <span className="text-sm text-gray-600">{filteredAgents.length}개</span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
                  {filteredAgents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} connectedApis={connectedApis} />
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
          </AnimatePresence>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="panel-shell p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-cyan-300">운영 조언</h3>
                <span className="text-xs text-gray-500">cost · quality</span>
              </div>
              <div className="space-y-2 text-xs">
                {OPERATION_TIPS.map((tip) => (
                  <div key={tip.title} className="log-row px-3 py-2 text-gray-300">
                    <div className="font-semibold text-gray-100">{tip.title}</div>
                    <div className="mt-1 leading-relaxed text-gray-500">{tip.body}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-shell p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-purple-300">스튜디오 구성 요약</h3>
                <span className="text-xs text-gray-500">nodes {nodes.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {nodes.slice(0, 6).map((node) => (
                  <div key={node.id} className="stat-chip bg-black/30 px-2.5 py-2 text-gray-300">
                    <div className="truncate font-medium text-gray-100">{String((node.data as { label?: string })?.label || node.id)}</div>
                    <div className="mt-1 text-gray-500">실행: {String((node.data as { execution_mode?: string })?.execution_mode || "auto")}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <aside className="min-w-0 space-y-4">
          <div className="panel-shell p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-white">추천 에이전트</div>
              <button
                type="button"
                onClick={placeSpotlightAgent}
                disabled={!spotlightAvailable && !spotlightHired}
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-gray-600"
              >
                {spotlightHired
                  ? "스튜디오에서 열기"
                  : spotlightAvailable
                    ? "스튜디오에 배치"
                    : spotlightAgent.runtime_supported === false
                      ? "실행 엔진 준비 중"
                      : "API 키 필요"}
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
            <h3 className="mb-3 text-sm font-semibold text-green-300">도입 전 체크</h3>
            <div className="space-y-2 text-xs">
              <div className="log-row px-3 py-2">
                <div className="font-medium text-gray-200">API 키 확인</div>
                <div className="mt-1 leading-relaxed text-gray-500">
                  live 모드에서는 등록된 provider만 바로 실행 가능하게 표시됩니다.
                </div>
              </div>
              <div className="log-row px-3 py-2">
                <div className="font-medium text-gray-200">Unit 책임 확인</div>
                <div className="mt-1 leading-relaxed text-gray-500">
                  가져오기 전에 이 에이전트가 맡을 Unit과 산출물 계약을 먼저 정하세요.
                </div>
              </div>
            </div>
          </div>

          <div className="panel-shell p-4">
            <h3 className="mb-3 text-sm font-semibold text-yellow-300">현재 구성</h3>
            <div className="space-y-2 text-xs text-gray-300">
              <div className="log-row flex items-center justify-between px-2 py-1.5">
                <span>스튜디오 에이전트</span>
                <span>{hiredAgents.length}개</span>
              </div>
              <div className="log-row flex items-center justify-between px-2 py-1.5">
                <span>실행 단계</span>
                <span>{nodes.length}개</span>
              </div>
              <div className="log-row px-2 py-1.5 leading-relaxed text-gray-500">
                실제 완료 시간과 승인율은 실행 기록에서 누적된 뒤 표시됩니다.
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
