import Link from "next/link";
import { ArrowLeft, BookOpen, Key, Layers, Link2, Users } from "lucide-react";

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 text-white">
      <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        홈으로
      </Link>

      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/20 text-blue-300">
          <BookOpen className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-black">사용 가이드</h1>
          <p className="text-sm text-gray-500">Bremen을 조직 운영 콘솔로 쓰는 빠른 온보딩</p>
        </div>
      </div>

      <div className="space-y-8 text-sm leading-relaxed text-gray-300">
        <section className="rounded-2xl border border-white/10 bg-[#111] p-6">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-white">
            <Users className="h-4 w-4 text-cyan-400" />
            1. 팀원과 팀
          </h2>
          <p className="text-gray-400">
            &quot;AI 팀원&quot;이 아니라 <strong className="text-gray-200">팀원</strong>—역할 실행 유닛입니다. 마켓에서 capability·비용·검증
            메타데이터를 보고 조직에 편입하세요. 팀은 연결된 역할들의{" "}
            <strong className="text-gray-200">조직 템플릿</strong>이며, 가져오기(fork) 후 스튜디오에서 수정할 수 있습니다.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111] p-6">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-white">
            <Layers className="h-4 w-4 text-violet-400" />
            2. 실행 그래프와 조직 그래프
          </h2>
          <p className="text-gray-400">
            스튜디오에서 <strong className="text-gray-200">Execution</strong>은 실제 런타임 흐름(DAG Router 포함),{" "}
            <strong className="text-gray-200">Organization</strong>은 팀 간 협업·계약을 봅니다. 둘을 분리해 두는 것이 운영
            OS의 핵심입니다.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111] p-6">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-white">
            <Link2 className="h-4 w-4 text-amber-400" />
            3. Team Link
          </h2>
          <p className="text-gray-400">
            팀과 팀은 artifact·schema·SLA·승인 정책으로 연결됩니다. 단일 워크플로우가 끝나는 도구가 아니라,{" "}
            <strong className="text-gray-200">조직 간 핸드오프</strong>를 제품 안에 둡니다.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111] p-6">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-white">
            <Key className="h-4 w-4 text-green-400" />
            4. BYOK · 비용
          </h2>
          <p className="text-gray-400">
            내 공간에서 API 키를 등록합니다. 등록되지 않은 provider는 해당 팀원 실행에 제한될 수 있습니다. 크레딧·정산은
            운영자가 한 화면에서 추적할 수 있도록 확장됩니다.
          </p>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/market?tab=agents"
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
        >
          마켓으로
        </Link>
        <Link href="/studio" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/5">
          스튜디오
        </Link>
      </div>
    </div>
  );
}
