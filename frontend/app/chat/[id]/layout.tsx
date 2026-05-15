import { Suspense, type ReactNode } from "react";

function Fallback() {
  return (
    <div className="flex min-h-[50vh] flex-1 items-center justify-center bg-[#0A0A0A] text-sm text-gray-500">
      옵스룸 로딩 중…
    </div>
  );
}

export default function ChatMissionLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Fallback />}>{children}</Suspense>;
}
