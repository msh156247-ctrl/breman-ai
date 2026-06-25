"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { useAppStoreHydrated } from "../../../../hooks/useAppStoreHydrated";
import { fetchMarketAgent } from "../../../../lib/api";
import { isDemoModeEnabled } from "../../../../lib/demo-mode";
import { MOCK_AGENTS } from "../../../../lib/mock-data";
import { useAppStore } from "../../../../stores/app.store";
import type { Agent } from "../../../../types";

type TabKey = "overview" | "guide" | "performance" | "history" | "reviews" | "connections";

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabKey>("overview");
  const isDemoMode = isDemoModeEnabled();
  const fallbackAgent = useMemo(() => MOCK_AGENTS.find((x) => x.id === params.id), [params.id]);
  const [agent, setAgent] = useState<Agent | undefined>(fallbackAgent);
  const [dataMode, setDataMode] = useState<"demo" | "loading" | "live" | "fallback" | "missing">(
    isDemoMode ? "demo" : fallbackAgent ? "fallback" : "loading"
  );
  const { hireAgent, fireAgent, isHired } = useAppStore();
  const workspaceHydrated = useAppStoreHydrated();

  useEffect(() => {
    if (isDemoMode) {
      setAgent(fallbackAgent);
      setDataMode("demo");
      return;
    }

    let cancelled = false;
    setDataMode("loading");
    fetchMarketAgent(params.id)
      .then((nextAgent) => {
        if (cancelled) return;
        setAgent(nextAgent);
        setDataMode("live");
      })
      .catch(() => {
        if (cancelled) return;
        setAgent(fallbackAgent);
        setDataMode(fallbackAgent ? "fallback" : "missing");
      });
    return () => {
      cancelled = true;
    };
  }, [fallbackAgent, isDemoMode, params.id]);

  if (!agent) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-10 text-gray-300">
        {dataMode === "loading" ? "에이전트 정보를 불러오는 중입니다." : "에이전트를 찾을 수 없습니다."}{" "}
        <Link href="/market" className="inline-flex min-h-9 items-center text-blue-300">마켓으로 이동</Link>
      </div>
    );
  }
  const hired = workspaceHydrated && isHired(agent.id);
  const isRuntimeSupported = agent.runtime_supported !== false;
  const isAvailable = isRuntimeSupported && (agent.available ?? agent.required_api === "mock");
  const studioHref = `/studio?unit=${agent.ontology_unit ?? "agent_profile"}`;

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "개요" },
    { key: "guide", label: "사용법" },
    { key: "performance", label: "성능" },
    { key: "history", label: "히스토리" },
    { key: "reviews", label: "평가" },
    { key: "connections", label: "연결 추천" }
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 text-white">
      <Link href="/market" className="inline-flex min-h-9 items-center text-sm text-gray-400 hover:text-gray-200">← 마켓으로</Link>
      <div className="mt-3 rounded-2xl border border-white/10 bg-[#111111] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-3">
            <div className="text-3xl">{agent.creator_avatar}</div>
            <div>
              <h1 className="text-2xl font-black">{agent.name}</h1>
              <p className="text-sm text-gray-400">@{agent.creator} · {agent.model_name} {agent.model_version}</p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-400">
              {dataMode === "live" ? "LIVE DATA" : dataMode === "loading" ? "SYNCING" : dataMode === "fallback" ? "LOCAL FALLBACK" : "DEMO DATA"}
            </span>
            <div className="text-sm text-gray-400 md:text-right">
              <div>최근 업데이트</div>
              <div className="font-semibold text-gray-200">{agent.updated_at || "-"}</div>
            </div>
            {!workspaceHydrated ? (
              <button
                type="button"
                disabled
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-gray-500"
              >
                스튜디오 상태 확인 중
              </button>
            ) : hired ? (
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <Link
                  href={studioHref}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500"
                >
                  <ArrowRight className="h-4 w-4" />
                  스튜디오에서 열기
                </Link>
                <button
                  type="button"
                  onClick={() => fireAgent(agent.id)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-4 text-sm font-semibold text-red-200 hover:bg-red-500/15"
                >
                  <Trash2 className="h-4 w-4" />
                  배치 해제
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (isAvailable) hireAgent(agent);
                }}
                disabled={!isAvailable}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-gray-500"
              >
                <Plus className="h-4 w-4" />
                {isAvailable
                  ? "스튜디오에 배치하기"
                  : isRuntimeSupported
                    ? `${agent.required_api} API 키 필요`
                    : `${agent.required_api} 실행 엔진 준비 중`}
              </button>
            )}
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-300">{agent.description}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`min-h-9 rounded-xl px-3 py-2 text-sm ${tab === t.key ? "bg-blue-600" : "bg-[#111111] text-gray-400 hover:text-gray-200"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-[#111111] p-5 text-sm text-gray-300">
        {tab === "overview" && (
          <div className="space-y-2">
            <div>역할: {agent.category}</div>
            <div>강점: {(agent.capabilities?.length ? agent.capabilities : agent.tags).join(", ")}</div>
            <div>
              운영 확인: {agent.required_api} 연결, 실행당 ${agent.royalty_per_use}, 결과 검토 기준을 워크플로우에 함께 설정하세요.
            </div>
          </div>
        )}
        {tab === "guide" && (
          <div className="space-y-2">
            <div>입력에는 목표, 필요한 산출물 형식, 완료 기준을 함께 적는 것이 좋습니다.</div>
            <div>앞 단계에는 요구사항을 정리하는 역할을, 뒤 단계에는 검토 또는 승인 역할을 연결하세요.</div>
            <div>지원 capability: {(agent.capabilities?.length ? agent.capabilities : agent.tags).join(", ") || "등록 정보 없음"}</div>
          </div>
        )}
        {tab === "performance" && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="평균 지연" value={`${agent.avg_latency_ms ?? 0}ms`} />
            <Metric label="성공률" value={`${agent.success_rate ?? 0}%`} />
            <Metric label="실패율" value={`${agent.fail_rate ?? 0}%`} />
            <Metric label="평균 비용" value={`$${agent.avg_cost ?? 0}`} />
          </div>
        )}
        {tab === "history" && (
          <div>
            {dataMode === "demo"
              ? "데모 실행 예시는 실행 기록에서 확인할 수 있습니다."
              : "이 에이전트의 실제 실행 이력은 워크플로우에 배치한 뒤 실행 기록에서 확인됩니다."}
          </div>
        )}
        {tab === "reviews" && (
          <div>
            평점 {agent.rating} · 누적 사용 {agent.usage_count.toLocaleString()}회
            {dataMode === "live" ? " · 서버에 등록된 공개 지표" : " · 예시 지표"}
          </div>
        )}
        {tab === "connections" && (
          <div>
            추천 연결 기준: 입력을 준비하는 역할 → {agent.name} → 결과를 검토하거나 승인하는 역할
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/30 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-semibold text-white">{value}</div>
    </div>
  );
}
