"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { MOCK_AGENTS } from "../../../../lib/mock-data";

type TabKey = "overview" | "guide" | "performance" | "history" | "reviews" | "connections";

export default function MemberDetailPage() {
  const params = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabKey>("overview");
  const agent = useMemo(() => MOCK_AGENTS.find((x) => x.id === params.id), [params.id]);

  if (!agent) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10 text-gray-300">
        팀원을 찾을 수 없습니다. <Link href="/market" className="text-blue-300">마켓으로 이동</Link>
      </div>
    );
  }

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "개요" },
    { key: "guide", label: "사용법" },
    { key: "performance", label: "성능" },
    { key: "history", label: "히스토리" },
    { key: "reviews", label: "평가" },
    { key: "connections", label: "연결 추천" }
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 text-white">
      <Link href="/market" className="text-sm text-gray-400 hover:text-gray-200">← 마켓으로</Link>
      <div className="mt-3 rounded-2xl border border-white/10 bg-[#111111] p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="text-3xl">{agent.creator_avatar}</div>
            <div>
              <h1 className="text-2xl font-black">{agent.name}</h1>
              <p className="text-sm text-gray-400">@{agent.creator} · {agent.model_name} {agent.model_version}</p>
            </div>
          </div>
          <div className="text-right text-sm text-gray-400">
            <div>최근 업데이트</div>
            <div className="font-semibold text-gray-200">{agent.updated_at || "-"}</div>
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-300">{agent.description}</p>
      </div>

      <div className="mt-4 flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-3 py-2 text-sm ${tab === t.key ? "bg-blue-600" : "bg-[#111111] text-gray-400 hover:text-gray-200"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-[#111111] p-5 text-sm text-gray-300">
        {tab === "overview" && (
          <div className="space-y-2">
            <div>역할: {agent.category}</div>
            <div>강점: {(agent.capabilities || []).join(", ")}</div>
            <div>약점: 장문 맥락 유지가 필요한 고난도 도메인</div>
          </div>
        )}
        {tab === "guide" && (
          <div className="space-y-2">
            <div>좋은 입력 예: "FastAPI 인증 모듈을 RBAC 기반으로 리팩터링"</div>
            <div>권장 업스트림: Domain Analyst, Planner</div>
            <div>권장 다운스트림: QA Reviewer, Security Supervisor</div>
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
        {tab === "history" && <div>최근 실행: SaaS MVP 팀, 보험 문서 분석팀, 데이터 파이프라인팀</div>}
        {tab === "reviews" && <div>리드 피드백: "리뷰 단계에서 강하며, 재시도 비용이 낮음"</div>}
        {tab === "connections" && <div>함께 추천: Backend Executor → QA Reviewer → HITL Approver</div>}
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
