"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import { MOCK_AGENTS, MOCK_TEAMS } from "../../../../lib/mock-data";

const TeamWorkflowPreview = dynamic(() => import("../../../../components/market/TeamWorkflowPreview"), {
  ssr: false,
  loading: () => <div className="flex h-72 items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-sm text-gray-500">그래프 로딩…</div>
});

export default function TeamDetailPage() {
  const params = useParams<{ id: string }>();
  const team = useMemo(() => MOCK_TEAMS.find((x) => x.id === params.id), [params.id]);

  if (!team) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10 text-gray-300">
        팀을 찾을 수 없습니다. <Link href="/market" className="text-blue-300">마켓으로 이동</Link>
      </div>
    );
  }

  const teamMembers = MOCK_AGENTS.filter((a) => team.agent_ids.includes(a.id));

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 text-white">
      <Link href="/market" className="text-sm text-gray-400 hover:text-gray-200">← 마켓으로</Link>
      <div className="mt-3 rounded-2xl border border-white/10 bg-[#111111] p-6">
        <h1 className="text-2xl font-black">{team.name}</h1>
        <p className="mt-2 text-sm text-gray-300">{team.description}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="평균 완료 시간" value={team.estimated_time} />
          <Metric label="예상 비용" value={`$${team.estimated_cost}`} />
          <Metric label="사용량" value={team.usage_count.toLocaleString()} />
          <Metric label="평점" value={String(team.rating)} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-[#111111] p-5">
          <h2 className="mb-3 font-bold">조직 구조</h2>
          <div className="space-y-2">
            <Row role="Supervisor" name="Security Supervisor" />
            <Row role="Executor" name="Backend Executor" />
            <Row role="Reviewer" name="QA Reviewer" />
            <Row role="Approver" name="HITL Approver" />
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111111] p-5">
          <h2 className="mb-3 font-bold">실행 흐름 · 조직도 (미리보기)</h2>
          <p className="mb-4 text-xs text-gray-500">
            좌우 DAG는 템플릿 단계이며, 「구성 · 역할」 탭에서 팀 허브와 편입된 팀원 노드를 확인할 수 있습니다.
          </p>
          <TeamWorkflowPreview workflow={team.workflow} teamName={team.name} members={teamMembers} />
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111111] p-5">
          <h2 className="mb-3 font-bold">비용 흐름</h2>
          <div className="space-y-1 text-sm">
            <div>Claude Opus: 62%</div>
            <div>GPT-4o: 21%</div>
            <div>Human Approval: 8%</div>
            <div>기타: 9%</div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111111] p-5">
          <h2 className="mb-3 font-bold">팀 구성원</h2>
          <div className="space-y-2">
            {teamMembers.map((m) => (
              <Link key={m.id} href={`/market/member/${m.id}`} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
                <span>{m.name}</span>
                <span className="text-xs text-gray-400">{m.model_name}</span>
              </Link>
            ))}
          </div>
        </section>
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

function Row({ role, name }: { role: string; name: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-sm">
      <span className="text-gray-400">{role}</span>
      <span className="font-medium">{name}</span>
    </div>
  );
}
