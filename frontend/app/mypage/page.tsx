"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle, CreditCard, Key, LayoutDashboard, TrendingUp } from "lucide-react";
import { MOCK_KEY_STATUSES, MOCK_SETTLEMENTS } from "../../lib/mock-data";
import { buildAuthHeaders } from "../../lib/auth";
import { isDemoModeEnabled } from "../../lib/demo-mode";
import { useAppStore } from "../../stores/app.store";

type MyTab = "overview" | "keys" | "billing";

function MyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hiredAgents = useAppStore((s) => s.hiredAgents);
  const canvasNodes = useAppStore((s) => s.nodes);

  const [activeTab, setActiveTab] = useState<MyTab>("overview");
  const isDemoMode = isDemoModeEnabled();
  const [keys, setKeys] = useState(MOCK_KEY_STATUSES);
  const [settlements, setSettlements] = useState(MOCK_SETTLEMENTS);
  const [warn, setWarn] = useState("");

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "keys" || t === "billing" || t === "overview") {
      setActiveTab(t);
    } else {
      setActiveTab("overview");
    }
  }, [searchParams]);

  const goTab = (tab: MyTab) => {
    setActiveTab(tab);
    router.replace(`/mypage?tab=${tab}`, { scroll: false });
  };

  useEffect(() => {
    if (isDemoMode) return;
    const load = async () => {
      try {
        const [k, s] = await Promise.all([
          fetch("http://localhost:8000/api/keys/status", { headers: buildAuthHeaders() }),
          fetch("http://localhost:8000/api/ledger/settlements?cycle=weekly", { headers: buildAuthHeaders() })
        ]);
        if (k.ok) {
          const body = await k.json();
          setKeys(Array.isArray(body?.providers) ? body.providers : []);
        } else if (k.status === 403) {
          setWarn("키 관리 정보는 owner/admin 권한에서만 조회됩니다.");
        }
        if (s.ok) {
          const body = await s.json();
          setSettlements(Array.isArray(body?.settlements) ? body.settlements.slice(-8) : []);
        }
      } catch {
        setWarn("데이터 로딩 중 오류가 발생했습니다.");
      }
    };
    void load();
  }, [isDemoMode]);

  const total = useMemo(() => settlements.reduce((acc, row) => acc + Number(row.royalty_cost || 0), 0), [settlements]);
  const keyMap = new Map(keys.map((k) => [k.provider, k]));
  const openai = keyMap.get("openai");
  const anthropic = keyMap.get("anthropic");
  const usage = useMemo(() => settlements.reduce((acc, row) => acc + Number(row.entries || 0), 0), [settlements]);
  const connectedKeys = keys.filter((k) => k.registered).length;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-2 text-3xl font-black">내 공간</h1>
      <p className="mb-8 text-sm text-gray-500">개인 실행 환경 · BYOK · 크레딧/정산</p>
      {isDemoMode ? (
        <div className="mb-4 rounded border border-cyan-700/40 bg-cyan-900/20 p-3 text-sm text-cyan-200">
          현재 화면은 데모용 페이크 데이터로 표시되고 있습니다.
        </div>
      ) : null}
      {warn ? <div className="mb-4 rounded border border-yellow-700 bg-yellow-900/30 p-3 text-sm text-yellow-300">{warn}</div> : null}

      <div className="mb-8 flex flex-wrap gap-1 rounded-2xl bg-[#111111] p-1">
        <button
          type="button"
          onClick={() => goTab("overview")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold sm:px-5 ${
            activeTab === "overview" ? "bg-white/10 text-white" : "text-gray-500"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          개요
        </button>
        <button
          type="button"
          onClick={() => goTab("keys")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold sm:px-5 ${
            activeTab === "keys" ? "bg-white/10 text-white" : "text-gray-500"
          }`}
        >
          <Key className="h-4 w-4" />
          API 키 관리
        </button>
        <button
          type="button"
          onClick={() => goTab("billing")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold sm:px-5 ${
            activeTab === "billing" ? "bg-white/10 text-white" : "text-gray-500"
          }`}
        >
          <CreditCard className="h-4 w-4" />
          결제 · 크레딧
        </button>
      </div>

      {activeTab === "overview" ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-6">
            <h2 className="mb-3 font-bold text-white">조직 요약</h2>
            <p className="mb-4 text-sm text-gray-400">
              마켓에서 편입한 <strong className="text-gray-200">팀원</strong>과 스튜디오의{" "}
              <strong className="text-gray-200">실행 노드</strong>가 여기에 반영됩니다. 키가 연결된 provider만 실 런타임에서 안전하게
              사용됩니다.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-black/40 p-4">
                <div className="text-xs text-gray-500">편입 팀원</div>
                <div className="text-2xl font-black text-cyan-300">{hiredAgents.length}</div>
              </div>
              <div className="rounded-xl bg-black/40 p-4">
                <div className="text-xs text-gray-500">스튜디오 노드</div>
                <div className="text-2xl font-black text-violet-300">{canvasNodes.length}</div>
              </div>
              <div className="rounded-xl bg-black/40 p-4">
                <div className="text-xs text-gray-500">연결된 API 키</div>
                <div className="text-2xl font-black text-emerald-300">
                  {connectedKeys}/{keys.length}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/market?tab=agents" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500">
                팀원 마켓
              </Link>
              <Link href="/studio" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5">
                스튜디오
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "keys" ? (
        <div className="space-y-4">
          <div className="mb-6 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-5">
            <h3 className="mb-2 font-bold text-blue-400">BYOK (Bring Your Own Key)</h3>
            <p className="text-sm text-blue-200/70">
              브래맨은 사용자의 API 키를 안전하게 관리합니다. 키를 등록하면 해당 팀원/역할 유닛을 실행할 수 있습니다.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-[#111111] p-6">
            <div className="flex items-center space-x-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-green-500/30 bg-green-500/10">🟢</div>
              <div>
                <h3 className="flex items-center font-bold">
                  OpenAI
                  {openai?.registered ? (
                    <CheckCircle className="ml-2 h-4 w-4 text-green-400" />
                  ) : (
                    <AlertCircle className="ml-2 h-4 w-4 text-gray-500" />
                  )}
                </h3>
                <p className="text-xs text-gray-500">GPT-4o, DALL-E 모델 사용 가능</p>
              </div>
            </div>
            <div className={`text-sm font-mono ${openai?.registered ? "text-green-400" : "text-gray-400"}`}>
              {openai?.registered ? "연결됨" : "미연결"}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-[#111111] p-6">
            <div className="flex items-center space-x-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10">🟠</div>
              <div>
                <h3 className="flex items-center font-bold">
                  Anthropic
                  {anthropic?.registered ? (
                    <CheckCircle className="ml-2 h-4 w-4 text-green-400" />
                  ) : (
                    <AlertCircle className="ml-2 h-4 w-4 text-gray-500" />
                  )}
                </h3>
                <p className="text-xs text-gray-500">Claude 3.5 Sonnet 모델</p>
              </div>
            </div>
            {anthropic?.registered ? (
              <div className="text-sm font-mono text-green-400">연결됨</div>
            ) : (
              <button type="button" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500">
                연결하기
              </button>
            )}
          </div>

          <div className="rounded-2xl bg-[#111111] p-4 text-xs text-gray-500">
            등록된 키: {keys.map((k) => `${k.provider}(${k.registered ? "연결" : "미연결"})`).join(", ")}
          </div>
        </div>
      ) : null}

      {activeTab === "billing" ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-6">
            <h3 className="mb-2 flex items-center gap-2 font-bold text-yellow-200">
              <TrendingUp className="h-4 w-4" />
              크레딧 · 실행 비용 (데모)
            </h3>
            <p className="text-sm text-gray-400">
              플랫폼 크레딧 잔액, provider 과금, Team Link 로열티가 한 원장으로 수렴하는 방향입니다. 아래는 주간 정산 샘플입니다.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl bg-black/40 p-4">
                <div className="text-xs text-gray-500">잔여 크레딧 (샘플)</div>
                <div className="text-2xl font-black text-yellow-300">12,450</div>
              </div>
              <div className="rounded-xl bg-black/40 p-4">
                <div className="text-xs text-gray-500">이번 달 누적 로열티</div>
                <div className="text-2xl font-black text-green-400">${total.toFixed(2)}</div>
              </div>
              <div className="rounded-xl bg-black/40 p-4">
                <div className="text-xs text-gray-500">누적 실행 횟수 (샘플)</div>
                <div className="text-2xl font-black text-white">{usage.toLocaleString()}</div>
              </div>
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-white/10 py-3 text-sm font-bold text-white hover:bg-white/15 md:w-auto md:px-8"
            >
              크레딧 충전 (준비 중)
            </button>
          </div>

          <div className="rounded-2xl bg-[#111111] p-6">
            <h3 className="mb-4 font-bold">최근 로열티 내역</h3>
            <div className="space-y-3">
              {settlements.slice(0, 6).map((row, idx) => (
                <div
                  key={`${row.period}-${row.receiver_team_id}-${idx}`}
                  className="flex items-center justify-between rounded-xl bg-white/5 p-3"
                >
                  <div>
                    <div className="font-semibold">{row.receiver_team_id}</div>
                    <div className="text-xs text-gray-500">{row.period}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-400">${Number(row.royalty_cost || 0).toFixed(4)}</div>
                    <div className="text-xs text-gray-500">{row.entries}회</div>
                  </div>
                </div>
              ))}
              {settlements.length === 0 ? <div className="text-sm text-gray-500">정산 데이터가 없습니다.</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function MyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[30vh] items-center justify-center text-gray-500">내 공간 로딩 중…</div>
      }
    >
      <MyPageInner />
    </Suspense>
  );
}
