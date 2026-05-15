"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "대시보드" },
  { href: "/market", label: "마켓" },
  { href: "/studio", label: "스튜디오" },
  { href: "/mypage", label: "마이페이지" }
];

export default function AppNav() {
  const pathname = usePathname();
  return (
    <div className="sticky top-0 z-40 border-b border-gray-800 bg-gray-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl gap-2 px-4 py-3">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                active ? "bg-blue-600 text-white" : "bg-gray-900 text-gray-300 hover:bg-gray-800"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
