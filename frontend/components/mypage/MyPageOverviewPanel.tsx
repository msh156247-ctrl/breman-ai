import Link from "next/link";

type MyPageOverviewPanelProps = {
  hiredAgentCount: number;
  canvasNodeCount: number;
  connectedKeyCount: number;
  providerCount: number;
};

export function MyPageOverviewPanel({
  hiredAgentCount,
  canvasNodeCount,
  connectedKeyCount,
  providerCount
}: MyPageOverviewPanelProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-[#111111] p-6">
        <h2 className="mb-3 font-bold text-white">작업 요약</h2>
        <p className="mb-4 text-sm text-gray-400">
          외부에서 가져온 <strong className="text-gray-200">에이전트</strong>와 스튜디오의{" "}
          <strong className="text-gray-200">실행 노드</strong>가 여기에 반영됩니다. 키가 연결된 provider만 실
          런타임에서 안전하게 사용됩니다.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-black/40 p-4">
            <div className="text-xs text-gray-500">배치 에이전트</div>
            <div className="text-2xl font-black text-cyan-300">{hiredAgentCount}</div>
          </div>
          <div className="rounded-xl bg-black/40 p-4">
            <div className="text-xs text-gray-500">스튜디오 노드</div>
            <div className="text-2xl font-black text-violet-300">{canvasNodeCount}</div>
          </div>
          <div className="rounded-xl bg-black/40 p-4">
            <div className="text-xs text-gray-500">연결된 API 키</div>
            <div className="text-2xl font-black text-emerald-300">
              {connectedKeyCount}/{providerCount}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/market?tab=agents"
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
          >
            에이전트 마켓 열기
          </Link>
          <Link
            href="/studio"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5"
          >
            스튜디오
          </Link>
          <Link
            href="/studio?panel=agents"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5"
          >
            에이전트 설정
          </Link>
        </div>
      </div>
    </div>
  );
}
