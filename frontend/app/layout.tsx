import "./globals.css";
import { Suspense, type ReactNode } from "react";
import Navigation from "../components/shared/Navigation";
import AppShell from "../components/shared/AppShell";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Bremen - Workforce Runtime OS",
  description: "에이전트와 실행 그래프로 AI 작업 흐름을 설계하고 운영하세요"
};

function ShellFallback() {
  return (
    <div className="app-root-bg flex flex-1 min-h-0 items-center justify-center text-sm text-gray-500">
      로딩 중…
    </div>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body
        className={`${inter.className} app-root-bg flex min-h-screen flex-col text-white antialiased`}
      >
        <Navigation />
        <Suspense fallback={<ShellFallback />}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
