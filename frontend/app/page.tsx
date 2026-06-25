import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bot,
  Database,
  GitBranch,
  Layers,
  LineChart,
  Search,
  Sparkles,
  Workflow
} from "lucide-react";
import { ONTOLOGY_UNITS } from "../lib/ontology";

const STEPS = [
  { step: "1", title: "Unit 선택", desc: "Workflow, AgentProfile처럼 먼저 작업 단위를 정합니다.", icon: Database },
  { step: "2", title: "에이전트 구성", desc: "Unit의 책임·데이터 계약에 맞는 에이전트를 배치합니다.", icon: Bot },
  { step: "3", title: "워크플로우 설계", desc: "조건 분기·승인·반복을 카드형 실행 흐름으로 구성합니다.", icon: Layers },
  { step: "4", title: "런타임 실행", desc: "노드 상태, 승인 대기, 비용 힌트를 실행 기록으로 추적합니다.", icon: Activity },
  { step: "5", title: "관측 · 개선", desc: "아티팩트와 전이 로그를 보고 Unit과 조건을 다시 다듬습니다.", icon: LineChart }
];

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.12),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(168,85,247,0.08),transparent_50%)]" />

      <section className="relative mx-auto w-full max-w-5xl px-6 pb-8 pt-14 md:pb-16 md:pt-20">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-yellow-500/25 bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-200">
          <Sparkles className="h-3.5 w-3.5" />
          Unit 기반 작업 운영 콘솔
        </div>
        <h1 className="mb-6 text-4xl font-black leading-[1.08] tracking-tight md:text-6xl">
          작업을 Unit으로 나누고,
          <br />
          <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">
            실행은 워크플로우
          </span>
          로 관리합니다
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-gray-400 md:text-xl">
          Bremen은 먼저 <strong className="text-gray-200">Unit 데이터 모델</strong>을 세우고, 각 Unit을 맡을 에이전트와 승인 조건을
          붙여 <strong className="text-gray-200">실행 가능한 작업 DB</strong>를 만듭니다.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/market?tab=agents"
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500"
          >
            에이전트 마켓 열기
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/studio"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            스튜디오 시작
          </Link>
          <Link
            href="/runs"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-6 py-3.5 text-sm font-medium text-gray-400 transition hover:border-white/20 hover:text-gray-200"
          >
            실행 기록 보기
          </Link>
        </div>
      </section>

      <section className="relative border-y border-white/5 bg-black/20 py-14 md:py-20">
        <div className="mx-auto w-full max-w-5xl px-6">
          <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-black md:text-3xl">설계 → 실행 → 관측</h2>
              <p className="mt-2 max-w-xl text-sm text-gray-500">
                에이전트 목록이 아니라, Unit 선택부터 실행 기록과 비용 관리까지 이어지는 운영 플로우입니다.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Workflow className="h-4 w-4 text-cyan-400" />
              <span>워크플로우 구성</span>
              <GitBranch className="h-4 w-4 text-violet-400" />
              <span>조건 분기 · 승인</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            {STEPS.map(({ step, title, desc, icon: Icon }) => (
              <div
                key={step}
                className="group rounded-2xl border border-white/8 bg-[#0c0c0c] p-4 transition hover:border-blue-500/30 hover:bg-[#111]"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-blue-400 transition group-hover:bg-blue-500/15">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">단계 {step}</div>
                <h3 className="mb-2 text-sm font-bold text-white">{title}</h3>
                <p className="text-xs leading-relaxed text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative border-t border-white/5 bg-[#050505] py-14 md:py-20">
        <div className="mx-auto w-full max-w-5xl px-6">
          <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-400">
                <Database className="h-3.5 w-3.5" />
                Executable Unit DB
              </div>
              <h2 className="text-2xl font-black md:text-3xl">온톨로지 · 데이터 모델</h2>
              <p className="mt-2 max-w-xl text-sm text-gray-500">
                화면의 중심은 에이전트 목록이 아니라 <strong className="text-gray-400">Unit</strong>입니다. Unit의 책임과 데이터 계약을
                정한 뒤, 그 Unit을 맡을 에이전트를 구성합니다.
              </p>
            </div>
            <Link
              href="/studio?unit=workflow"
              className="inline-flex min-h-9 items-center text-sm text-cyan-400 hover:text-cyan-300"
            >
              Unit 자세히 보기 →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ONTOLOGY_UNITS.map((unit) => (
              <Link
                key={unit.id}
                href={`/studio?unit=${unit.id}`}
                className="group rounded-2xl border border-white/[0.08] bg-[#0c0c0c] p-4 transition hover:-translate-y-0.5 hover:border-cyan-500/30 hover:bg-[#101820]"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-mono text-sm font-bold text-cyan-200">{unit.name}</h3>
                  <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                    {unit.shortLabel}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-gray-500">{unit.description}</p>
                <p className="mt-3 rounded-xl border border-cyan-400/10 bg-cyan-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-cyan-50/75">
                  {unit.effectSummary}
                </p>
                <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/25 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">구성할 담당</div>
                  <div className={`mt-1 text-xs font-bold ${unit.accent}`}>{unit.memberRole}</div>
                  <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-gray-600">{unit.dataContract}</div>
                </div>
                <div className="mt-3 flex min-h-9 items-center text-[11px] font-semibold text-cyan-300 opacity-0 transition group-hover:opacity-100">
                  이 Unit에 대해 자세히 보기 →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-5xl px-6 py-14 md:py-20">
        <h2 className="mb-6 text-xl font-black md:text-2xl">운영 원칙</h2>
        <ul className="grid gap-3 text-sm text-gray-400 md:grid-cols-2">
          <li className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
            <span className="font-semibold text-rose-300">❌</span> 모델·챗봇 중심의 일회성 워크플로우 툴
            <br />
            <span className="font-semibold text-emerald-300">✓</span> 역할·책임·검토·데이터 흐름이 있는{" "}
            <strong className="text-gray-200">실행 워크플로우</strong>
          </li>
          <li className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
            Human 승인·조건 분기·아티팩트 스키마·비용 힌트를 같은 실행 흐름에서 다루며, 로그는 채팅이 아니라{" "}
            <strong className="text-gray-200">실행 관측 기록</strong>으로 남깁니다.
          </li>
        </ul>
        <div className="mt-10 text-center">
          <Link href="/guide" className="inline-flex min-h-9 items-center text-sm text-blue-400 hover:text-blue-300">
            사용 가이드로 계속 읽기 →
          </Link>
        </div>
      </section>
    </div>
  );
}
