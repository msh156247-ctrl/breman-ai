import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Database,
  GitBranch,
  Layers,
  LineChart,
  Search,
  Sparkles,
  Users,
  Workflow
} from "lucide-react";

const ONTOLOGY = [
  {
    name: "Team",
    desc: "실행 조직 단위. 마켓 템플릿 fork 후 스튜디오에서 실행/조직 그래프로 구체화합니다."
  },
  {
    name: "MemberProfile",
    desc: "재사용 가능한 역할 자산. capability·비용·검증 메타가 붙는 팀원 카탈로그 엔티티입니다."
  },
  {
    name: "TeamMember",
    desc: "특정 팀에 배치된 실행 유닛. 스튜디오 노드와 1:1에 가깝게 매핑됩니다."
  },
  {
    name: "RoleBinding",
    desc: "권한·감독 범위. Supervisor vs Executor처럼 역할 책임의 경계를 정의합니다."
  },
  {
    name: "MissionRun",
    desc: "한 번의 미션 실행 인스턴스. 상태 머신·전이 로그·아티팩트 추적의 앵커입니다."
  },
  {
    name: "CostLedger",
    desc: "토큰·재시도·승인·휴먼 비용이 수렴하는 원장. Team Link 로열티와 연결됩니다."
  }
];

const STEPS = [
  { step: "1", title: "팀원 마켓 탐색", desc: "역할 실행 유닛·capability 기준으로 조직 인력 후보를 찾습니다.", icon: Search },
  { step: "2", title: "팀 가져오기 / 생성", desc: "완성된 조직 템플릿을 fork하거나 빈 조직부터 설계합니다.", icon: Users },
  { step: "3", title: "Studio 설계", desc: "Router·승인·팀 링크로 실행 그래프와 조직 그래프를 분리해 둡니다.", icon: Layers },
  { step: "4", title: "실행 · 시뮬레이션", desc: "런타임에서 미션 상태와 노드 상태를 추적하고 비용·지연을 예측합니다.", icon: Activity },
  { step: "5", title: "보고 · 비용 분석", desc: "아티팩트·전이 로그·원장으로 운영 KPI와 감사 가능성을 확보합니다.", icon: LineChart }
];

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.12),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(168,85,247,0.08),transparent_50%)]" />

      <section className="relative mx-auto max-w-5xl px-6 pb-8 pt-14 md:pb-16 md:pt-20">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-yellow-500/25 bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-200">
          <Sparkles className="h-3.5 w-3.5" />
          실행 조직을 위한 운영체제
        </div>
        <h1 className="mb-6 text-4xl font-black leading-[1.08] tracking-tight md:text-6xl">
          모델 스토어가 아니라,
          <br />
          <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">
            역할·계약·런타임
          </span>
          이 중심입니다
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-gray-400 md:text-xl">
          Bremen은 <strong className="text-gray-200">팀원</strong>과 <strong className="text-gray-200">팀</strong>을 조직
          자산처럼 관리하고, Team ↔ Team 연결과 Router 분기로{" "}
          <strong className="text-gray-200">실행 가능한 조직 레이어</strong>를 만듭니다.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/market?tab=agents"
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500"
          >
            팀원 마켓 열기
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/studio"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            스튜디오에서 설계
          </Link>
          <Link
            href="/runs"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-6 py-3.5 text-sm font-medium text-gray-400 transition hover:border-white/20 hover:text-gray-200"
          >
            실행 기록 · 런타임
          </Link>
        </div>
      </section>

      <section className="relative border-y border-white/5 bg-black/20 py-14 md:py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-black md:text-3xl">Marketplace → Runtime → Observability</h2>
              <p className="mt-2 max-w-xl text-sm text-gray-500">
                GPT 앱 나열이 아니라, 인력 탐색·조직 복제·실행·관측까지 한 갈래의 운영 플로우입니다.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Workflow className="h-4 w-4 text-cyan-400" />
              <span>조직 단위 orchestration</span>
              <GitBranch className="h-4 w-4 text-violet-400" />
              <span>Team Link 계약</span>
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
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">Step {step}</div>
                <h3 className="mb-2 text-sm font-bold text-white">{title}</h3>
                <p className="text-xs leading-relaxed text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative border-t border-white/5 bg-[#050505] py-14 md:py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-400">
                <Database className="h-3.5 w-3.5" />
                Executable Org DB
              </div>
              <h2 className="text-2xl font-black md:text-3xl">온톨로지 · 데이터 모델</h2>
              <p className="mt-2 max-w-xl text-sm text-gray-500">
                채팅 앱이 아니라 <strong className="text-gray-400">실행 가능한 조직 DB</strong>를 겨냥합니다. UI의 각 화면은 아래 엔티티와
                맞물립니다.
              </p>
            </div>
            <Link href="/runs" className="text-sm text-cyan-400 hover:text-cyan-300">
              MissionRun 목록 보기 →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ONTOLOGY.map((row) => (
              <div
                key={row.name}
                className="rounded-2xl border border-white/8 bg-[#0c0c0c] p-4 transition hover:border-cyan-500/25"
              >
                <h3 className="mb-2 font-mono text-sm font-bold text-cyan-200">{row.name}</h3>
                <p className="text-xs leading-relaxed text-gray-500">{row.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-5xl px-6 py-14 md:py-20">
        <h2 className="mb-6 text-xl font-black md:text-2xl">철학 한 줄 요약</h2>
        <ul className="grid gap-3 text-sm text-gray-400 md:grid-cols-2">
          <li className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
            <span className="font-semibold text-rose-300">❌</span> 모델·챗봇 중심의 일회성 워크플로우 툴
            <br />
            <span className="font-semibold text-emerald-300">✓</span> 역할·책임·계약·데이터 흐름이 있는{" "}
            <strong className="text-gray-200">실행 조직</strong>
          </li>
          <li className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
            Human 승인·Router·아티팩트 스키마·Team Link SLA를 같은 캔버스에서 다루며, 로그는 채팅이 아니라{" "}
            <strong className="text-gray-200">옵저버빌리티</strong>로 남깁니다.
          </li>
        </ul>
        <div className="mt-10 text-center">
          <Link href="/guide" className="text-sm text-blue-400 hover:text-blue-300">
            사용 가이드로 계속 읽기 →
          </Link>
        </div>
      </section>
    </div>
  );
}
