"use client";

import Link from "next/link";
import { ListVideo, PlayCircle } from "lucide-react";
import { isDemoModeEnabled } from "../../lib/demo-mode";

export default function ChatIndexPage() {
  const isDemoMode = isDemoModeEnabled();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 text-white">
      <h1 className="mb-3 text-3xl font-black">Runtime Ops Room</h1>
      <p className="mb-6 text-gray-400">미션 ID로 옵스룸에 들어가거나, 실행 기록 목록에서 선택하세요.</p>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/runs"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold hover:bg-white/10"
        >
          <ListVideo className="h-4 w-4" />
          실행 기록 (/runs)
        </Link>
        <Link
          href={isDemoMode ? "/chat/demo-mission" : "/studio"}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold hover:bg-blue-500"
        >
          <PlayCircle className="h-4 w-4" />
          {isDemoMode ? "데모 옵스룸 열기" : "스튜디오에서 실행"}
        </Link>
      </div>
      <p className="text-xs text-gray-600">
        URL 직접 입력: <code className="rounded bg-black/50 px-1 text-gray-400">/chat/{"{mission_id}"}</code>
        {isDemoMode ? (
          <>
            {" "}— 데모 ID는 <code className="text-gray-500">demo-</code> 접두사일 때 로컬 시뮬레이션됩니다.
          </>
        ) : null}
      </p>
    </div>
  );
}
