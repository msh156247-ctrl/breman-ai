import "./globals.css";
import { Suspense, type ReactNode } from "react";
import Navigation from "../components/shared/Navigation";
import AppShell from "../components/shared/AppShell";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Bremen - Workforce Runtime OS",
  description: "팀원/팀 자산을 조합해 실행 조직을 설계하고 운영하세요"
};

function ShellFallback() {
  return (
    <div className="flex flex-1 min-h-0 items-center justify-center bg-[#0A0A0A] text-sm text-gray-500">
      로딩 중…
    </div>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body
        className={`${inter.className} flex min-h-screen flex-col bg-[#0A0A0A] text-white antialiased`}
      >
        <Navigation />
        <Suspense fallback={<ShellFallback />}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
