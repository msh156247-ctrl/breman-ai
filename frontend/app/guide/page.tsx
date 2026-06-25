import Link from "next/link";
import { ArrowLeft, Bot, BookOpen, Key, Layers, Lightbulb } from "lucide-react";

export default function GuidePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 text-white">
      <Link href="/studio" className="mb-6 inline-flex min-h-9 items-center gap-1 rounded-xl px-2 text-sm text-gray-400 hover:bg-white/5 hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        홈으로
      </Link>

      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/20 text-blue-300">
          <BookOpen className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-black">사용 가이드</h1>
          <p className="text-sm text-gray-500">Bremen을 AI 작업 운영 콘솔로 쓰는 빠른 온보딩</p>
        </div>
      </div>

      <div className="space-y-8 text-sm leading-relaxed text-gray-300">
        <section className="rounded-2xl border border-white/10 bg-[#111] p-6">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-white">
            <Bot className="h-4 w-4 text-cyan-400" />
            1. 에이전트
          </h2>
          <p className="text-gray-400">
            에이전트는 Unit 책임을 실행하는 역할 자산입니다. 에이전트 마켓에서 capability·비용·검증 메타데이터를 보고 필요한
            작업 흐름에 배치하세요. 각 에이전트는 스튜디오에서 이름, 모델, 비용, 지시사항을 조정할 수 있습니다.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111] p-6">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-white">
            <Layers className="h-4 w-4 text-violet-400" />
            2. 실행 그래프
          </h2>
          <p className="text-gray-400">
            스튜디오의 워크플로우 편집기에서 실행 단계를 추가하고 순서, 조건 분기, 반복 영역, Human Approval을
            카드 단위로 설정합니다. 자세히 설정 화면에서 단계 간 연결과 승인 지점을 검토한 뒤 런타임을 실행하세요.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111] p-6">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-white">
            <Lightbulb className="h-4 w-4 text-amber-400" />
            3. 운영 조언
          </h2>
          <p className="text-gray-400">
            비용이 걱정되는 단계는 저가 모델이나 mock으로 먼저 검증하고, 품질이 중요한 단계 뒤에는 검토 노드를 붙이세요.
            위험도가 높은 산출물은 Human Approval로 멈춰 승인 후 진행하는 편이 안전합니다.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111] p-6">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-white">
            <Key className="h-4 w-4 text-green-400" />
            4. BYOK · 비용
          </h2>
          <p className="text-gray-400">
            API 키 관리에서 provider 키를 등록합니다. 등록되지 않은 provider는 해당 에이전트 실행에 제한될 수 있습니다. 크레딧·정산은
            운영자가 한 화면에서 추적할 수 있도록 확장됩니다.
          </p>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/market?tab=agents"
          className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
        >
          에이전트 마켓 열기
        </Link>
        <Link
          href="/studio"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/5"
        >
          스튜디오
        </Link>
      </div>
    </div>
  );
}
