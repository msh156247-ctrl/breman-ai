"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  BellRing,
  CheckCircle,
  CreditCard,
  Key,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  TrendingUp
} from "lucide-react";
import { MOCK_KEY_STATUSES, MOCK_SETTLEMENTS } from "../../lib/mock-data";
import {
  clearSessionToken,
  readSessionIdentity,
  saveSessionIdentity,
  SESSION_ROLES
} from "../../lib/auth";
import type { SessionIdentity, SessionRole } from "../../lib/auth";
import {
  deleteProviderKey,
  fetchApprovalChannelSettings,
  fetchKeyStatuses,
  fetchSettlements,
  fetchWhoami,
  issueSessionToken,
  registerProviderKey,
  saveApprovalChannelSettings,
  type ApprovalChannelId,
  type ApprovalChannelSettings,
  type AuthWhoami,
  type ProviderKeyStatus,
  type SettlementRecord
} from "../../lib/api";
import { API_PROVIDER_CONFIG } from "../../lib/constants";
import { isDemoModeEnabled } from "../../lib/demo-mode";
import { useAppStore } from "../../stores/app.store";
import type { APIProvider } from "../../types";

type MyTab = "overview" | "session" | "keys" | "approval" | "billing";
const KEY_PROVIDERS = ["openai", "anthropic", "gemini", "stability", "google"] as const;
type KeyProvider = (typeof KEY_PROVIDERS)[number];
const APPROVAL_CHANNELS = ["admin_queue", "email", "sms", "kakao"] as const;

function normalizeTabParam(value: string | null): MyTab {
  return value === "keys" ||
    value === "approval" ||
    value === "billing" ||
    value === "overview" ||
    value === "session"
    ? value
    : "overview";
}

const KEY_PROVIDER_COPY: Record<KeyProvider, { description: string; placeholder: string }> = {
  openai: { description: "GPT-4o, GPT-4o-mini 실행", placeholder: "sk-..." },
  anthropic: { description: "Claude 3.5 Sonnet, Claude Haiku 실행", placeholder: "sk-ant-..." },
  gemini: { description: "Gemini Pro/Flash 실행", placeholder: "AIza..." },
  stability: { description: "Stable Diffusion 이미지 생성", placeholder: "sk-..." },
  google: { description: "Google AI Studio 호환 키", placeholder: "AIza..." }
};

const APPROVAL_CHANNEL_COPY: Record<ApprovalChannelId, { label: string; description: string }> = {
  admin_queue: { label: "관리자 대기", description: "실행 기록의 승인 대기 큐에서 직접 처리합니다." },
  email: { label: "이메일", description: "메일 발송 서비스나 자동화 webhook으로 승인 요청을 보냅니다." },
  sms: { label: "문자", description: "긴급 승인용 SMS webhook으로 승인 요청을 보냅니다." },
  kakao: { label: "카톡", description: "카카오 알림톡/채널 webhook으로 승인 요청을 보냅니다." }
};

const DEFAULT_APPROVAL_SETTINGS: ApprovalChannelSettings = {
  schema_version: 1,
  public_base_url: "",
  webhook_token_registered: false,
  webhook_token_masked: null,
  channels: {
    admin_queue: { enabled: true, delivery_mode: "internal_queue", target: "운영 관리자", webhook_url: "" },
    email: { enabled: false, delivery_mode: "webhook", target: "", webhook_url: "" },
    sms: { enabled: false, delivery_mode: "webhook", target: "", webhook_url: "" },
    kakao: { enabled: false, delivery_mode: "webhook", target: "", webhook_url: "" }
  }
};

function MyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const memberParam = searchParams.get("agent") || searchParams.get("member");
  const hiredAgents = useAppStore((s) => s.hiredAgents);
  const canvasNodes = useAppStore((s) => s.nodes);

  const [activeTab, setActiveTab] = useState<MyTab>(() => normalizeTabParam(tabParam));
  const isDemoMode = isDemoModeEnabled();
  const [keys, setKeys] = useState<ProviderKeyStatus[]>(() => (isDemoMode ? MOCK_KEY_STATUSES : []));
  const [settlements, setSettlements] = useState<SettlementRecord[]>(() =>
    isDemoMode ? MOCK_SETTLEMENTS : []
  );
  const [keyDataMode, setKeyDataMode] = useState<"demo" | "loading" | "live" | "restricted" | "error">(
    isDemoMode ? "demo" : "loading"
  );
  const [billingDataMode, setBillingDataMode] = useState<"demo" | "loading" | "live" | "error">(
    isDemoMode ? "demo" : "loading"
  );
  const [warn, setWarn] = useState("");
  const [session, setSession] = useState<SessionIdentity>(() => readSessionIdentity());
  const [serverIdentity, setServerIdentity] = useState<AuthWhoami | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionNotice, setSessionNotice] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [sessionForm, setSessionForm] = useState(() => {
    const identity = readSessionIdentity();
    return {
      userId: identity.userId,
      role: identity.role,
      ttlSeconds: "3600",
      adminToken: process.env.NEXT_PUBLIC_BREMEN_ADMIN_TOKEN || ""
    };
  });
  const [keyForm, setKeyForm] = useState<{ provider: KeyProvider; apiKey: string; adminToken: string }>(() => ({
    provider: "openai",
    apiKey: "",
    adminToken: process.env.NEXT_PUBLIC_BREMEN_ADMIN_TOKEN || ""
  }));
  const [keyBusy, setKeyBusy] = useState("");
  const [keyNotice, setKeyNotice] = useState("");
  const [keyError, setKeyError] = useState("");
  const [approvalSettings, setApprovalSettings] = useState<ApprovalChannelSettings>(DEFAULT_APPROVAL_SETTINGS);
  const [approvalEnvOverrides, setApprovalEnvOverrides] = useState<Record<string, boolean>>({});
  const [approvalBusy, setApprovalBusy] = useState("");
  const [approvalNotice, setApprovalNotice] = useState("");
  const [approvalError, setApprovalError] = useState("");

  useEffect(() => {
    setActiveTab(normalizeTabParam(tabParam));
  }, [tabParam]);

  useEffect(() => {
    if (tabParam !== "agents" && tabParam !== "members") return;
    const q = new URLSearchParams({ panel: "agents" });
    if (memberParam) q.set("agent", memberParam);
    router.replace(`/studio?${q.toString()}`, { scroll: false });
  }, [memberParam, router, tabParam]);

  const goTab = (tab: MyTab) => {
    setActiveTab(tab);
    const q = new URLSearchParams({ tab });
    router.replace(`/mypage?${q.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (isDemoMode) {
      setKeys(MOCK_KEY_STATUSES);
      setSettlements(MOCK_SETTLEMENTS);
      setKeyDataMode("demo");
      setBillingDataMode("demo");
      setWarn("");
      return;
    }
    let cancelled = false;
    const load = async () => {
      setKeyDataMode("loading");
      setBillingDataMode("loading");
      setWarn("");
      const [keyResult, settlementResult] = await Promise.allSettled([
        fetchKeyStatuses(),
        fetchSettlements("weekly")
      ]);
      if (cancelled) return;
      const warnings: string[] = [];
      if (keyResult.status === "fulfilled") {
        setKeys(keyResult.value);
        setKeyDataMode("live");
      } else {
        setKeys([]);
        const message = keyResult.reason instanceof Error ? keyResult.reason.message : "";
        const restricted = message.includes(":403");
        setKeyDataMode(restricted ? "restricted" : "error");
        warnings.push(
          restricted ? "키 관리 정보는 owner/admin 권한에서만 조회됩니다." : "API 키 상태를 불러오지 못했습니다."
        );
      }
      if (settlementResult.status === "fulfilled") {
        setSettlements(settlementResult.value.slice(-8));
        setBillingDataMode("live");
      } else {
        setSettlements([]);
        setBillingDataMode("error");
        warnings.push("실행 비용 내역을 불러오지 못했습니다.");
      }
      setWarn(warnings.join(" "));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isDemoMode, session.jwt, session.role, session.userId]);

  useEffect(() => {
    if (isDemoMode) return;
    const loadIdentity = async () => {
      try {
        setServerIdentity(await fetchWhoami());
      } catch {
        setServerIdentity(null);
      }
    };
    void loadIdentity();
  }, [isDemoMode, session.jwt, session.role, session.userId]);

  useEffect(() => {
    if (isDemoMode || activeTab !== "approval") return;
    let cancelled = false;
    setApprovalBusy("load");
    setApprovalError("");
    fetchApprovalChannelSettings()
      .then((response) => {
        if (cancelled) return;
        setApprovalSettings(response.settings);
        setApprovalEnvOverrides(response.env_overrides || {});
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "";
        setApprovalError(message.includes(":403") ? "승인 채널 설정은 member 이상 권한에서 조회할 수 있습니다." : "승인 채널 설정을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setApprovalBusy("");
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, isDemoMode, session.jwt, session.role, session.userId]);

  const total = useMemo(() => settlements.reduce((acc, row) => acc + Number(row.royalty_cost || 0), 0), [settlements]);
  const keyMap = new Map(keys.map((k) => [k.provider, k]));
  const keyCards = KEY_PROVIDERS.map((provider) => ({
    provider,
    config: API_PROVIDER_CONFIG[provider as APIProvider],
    copy: KEY_PROVIDER_COPY[provider],
    status: keyMap.get(provider)
  }));
  const usage = useMemo(() => settlements.reduce((acc, row) => acc + Number(row.entries || 0), 0), [settlements]);
  const connectedKeys = keys.filter((k) => k.registered).length;
  const sessionSource = serverIdentity?.source || (session.jwt ? "jwt" : "header");
  const sessionExpiry = session.expiresAt ? new Date(session.expiresAt).toLocaleString("ko-KR") : "헤더 세션";

  const describeKeyError = (message: string) => {
    if (message.includes(":403")) return "관리자 토큰 또는 owner/admin 권한이 필요합니다.";
    if (message.includes(":400")) return "provider 또는 API 키 형식을 확인하세요. 키는 최소 10자 이상이어야 합니다.";
    return "API 키 작업에 실패했습니다.";
  };

  const refreshKeys = async () => {
    if (isDemoMode) {
      setKeys(MOCK_KEY_STATUSES);
      setKeyDataMode("demo");
      setKeyError("");
      setKeyNotice("데모 키 상태를 초기화했습니다.");
      return;
    }
    setKeyBusy("refresh");
    setKeyError("");
    try {
      setKeys(await fetchKeyStatuses());
      setKeyDataMode("live");
      setKeyNotice("API 키 상태를 새로고침했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setKeyDataMode(message.includes(":403") ? "restricted" : "error");
      setKeyError(describeKeyError(message));
    } finally {
      setKeyBusy("");
    }
  };

  const registerKey = async () => {
    if (isDemoMode) {
      setKeyError("데모 모드에서는 실제 API 키를 등록하지 않습니다. Live 모드에서 진행하세요.");
      return;
    }
    if (!keyForm.apiKey.trim()) {
      setKeyError("등록할 API 키를 입력하세요.");
      return;
    }
    setKeyBusy("register");
    setKeyError("");
    setKeyNotice("");
    try {
      await registerProviderKey({
        provider: keyForm.provider,
        apiKey: keyForm.apiKey.trim(),
        adminToken: keyForm.adminToken
      });
      setKeys(await fetchKeyStatuses());
      setKeyDataMode("live");
      setKeyForm((prev) => ({ ...prev, apiKey: "" }));
      setKeyNotice(`${API_PROVIDER_CONFIG[keyForm.provider].label} 키가 등록되었습니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setKeyDataMode(message.includes(":403") ? "restricted" : "error");
      setKeyError(describeKeyError(message));
    } finally {
      setKeyBusy("");
    }
  };

  const removeKey = async (provider: KeyProvider) => {
    if (isDemoMode) {
      setKeyError("데모 모드에서는 실제 API 키 연결을 해제하지 않습니다.");
      return;
    }
    setKeyBusy(provider);
    setKeyError("");
    setKeyNotice("");
    try {
      await deleteProviderKey({ provider, adminToken: keyForm.adminToken });
      setKeys(await fetchKeyStatuses());
      setKeyDataMode("live");
      setKeyNotice(`${API_PROVIDER_CONFIG[provider].label} 키 연결을 해제했습니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setKeyDataMode(message.includes(":403") ? "restricted" : "error");
      setKeyError(describeKeyError(message));
    } finally {
      setKeyBusy("");
    }
  };

  const updateApprovalSettings = (patch: Partial<ApprovalChannelSettings>) => {
    setApprovalSettings((prev) => ({ ...prev, ...patch }));
  };

  const updateApprovalChannel = (channelId: ApprovalChannelId, patch: Partial<ApprovalChannelSettings["channels"][ApprovalChannelId]>) => {
    setApprovalSettings((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channelId]: {
          ...prev.channels[channelId],
          ...patch,
          enabled: channelId === "admin_queue" ? true : patch.enabled ?? prev.channels[channelId].enabled
        }
      }
    }));
  };

  const saveApprovalSettings = async () => {
    setApprovalBusy("save");
    setApprovalError("");
    setApprovalNotice("");
    try {
      const response = await saveApprovalChannelSettings(approvalSettings);
      setApprovalSettings(response.settings);
      setApprovalEnvOverrides(response.env_overrides || {});
      setApprovalNotice("승인 채널 설정을 저장했습니다. 다음 Human Gate 알림부터 적용됩니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setApprovalError(message.includes(":403") ? "승인 채널 저장은 owner/admin/supervisor 권한이 필요합니다." : "승인 채널 설정 저장에 실패했습니다.");
    } finally {
      setApprovalBusy("");
    }
  };

  const saveHeaderSession = () => {
    try {
      const next = saveSessionIdentity({ userId: sessionForm.userId, role: sessionForm.role as SessionRole });
      setSession(next);
      setSessionNotice("헤더 기반 로컬 세션이 저장되었습니다.");
      setSessionError("");
    } catch {
      setSessionNotice("");
      setSessionError("브라우저 저장소를 사용할 수 없어 세션을 저장하지 못했습니다.");
    }
  };

  const issueJwtSession = async () => {
    const ttlSeconds = Number(sessionForm.ttlSeconds);
    if (!sessionForm.userId.trim()) {
      setSessionError("사용자 ID를 입력하세요.");
      return;
    }
    if (!Number.isFinite(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 86400) {
      setSessionError("만료 시간은 60초부터 86400초 사이여야 합니다.");
      return;
    }

    setSessionBusy(true);
    setSessionError("");
    setSessionNotice("");
    try {
      const issued = await issueSessionToken({
        userId: sessionForm.userId.trim(),
        role: sessionForm.role as SessionRole,
        ttlSeconds,
        adminToken: sessionForm.adminToken
      });
      const next = saveSessionIdentity({
        userId: issued.user_id,
        role: issued.role,
        jwt: issued.access_token,
        expiresAt: issued.expires_at
      });
      setSession(next);
      setSessionForm((prev) => ({ ...prev, userId: issued.user_id, role: issued.role }));
      setSessionNotice("JWT 세션이 발급되어 이 브라우저에 저장되었습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setSessionError(message.includes(":403") ? "관리자 토큰이 필요하거나 일치하지 않습니다." : "JWT 세션 발급에 실패했습니다.");
    } finally {
      setSessionBusy(false);
    }
  };

  const clearJwtSession = () => {
    try {
      const next = clearSessionToken();
      setSession(next);
      setSessionNotice("JWT 토큰을 제거했습니다. 로컬 헤더 세션으로 계속 동작합니다.");
      setSessionError("");
    } catch {
      setSessionNotice("");
      setSessionError("브라우저 저장소를 사용할 수 없어 JWT 토큰을 제거하지 못했습니다.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="mb-2 text-3xl font-black">내 공간</h1>
      <p className="mb-8 text-sm text-gray-500">개인 실행 환경 · BYOK · 크레딧/정산</p>
      {isDemoMode ? (
        <div className="mb-4 rounded border border-cyan-700/40 bg-cyan-900/20 p-3 text-sm text-cyan-200">
          현재 화면은 데모용 페이크 데이터로 표시되고 있습니다.
        </div>
      ) : null}
      {warn ? <div className="mb-4 rounded border border-yellow-700 bg-yellow-900/30 p-3 text-sm text-yellow-300">{warn}</div> : null}

      <div className="mb-8 grid grid-cols-2 gap-1 rounded-2xl bg-[#111111] p-1 sm:flex sm:flex-wrap">
        <button
          type="button"
          onClick={() => goTab("overview")}
          className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold sm:justify-start sm:px-5 ${
            activeTab === "overview" ? "bg-white/10 text-white" : "text-gray-500"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          개요
        </button>
        <button
          type="button"
          onClick={() => goTab("session")}
          className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold sm:justify-start sm:px-5 ${
            activeTab === "session" ? "bg-white/10 text-white" : "text-gray-500"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          세션
        </button>
        <button
          type="button"
          onClick={() => goTab("keys")}
          className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold sm:justify-start sm:px-5 ${
            activeTab === "keys" ? "bg-white/10 text-white" : "text-gray-500"
          }`}
        >
          <Key className="h-4 w-4" />
          API 키 관리
        </button>
        <button
          type="button"
          onClick={() => goTab("approval")}
          className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold sm:justify-start sm:px-5 ${
            activeTab === "approval" ? "bg-white/10 text-white" : "text-gray-500"
          }`}
        >
          <BellRing className="h-4 w-4" />
          승인 채널
        </button>
        <button
          type="button"
          onClick={() => goTab("billing")}
          className={`col-span-2 flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold sm:col-span-1 sm:justify-start sm:px-5 ${
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
            <h2 className="mb-3 font-bold text-white">작업 요약</h2>
            <p className="mb-4 text-sm text-gray-400">
              외부에서 가져온 <strong className="text-gray-200">에이전트</strong>와 스튜디오의{" "}
              <strong className="text-gray-200">실행 노드</strong>가 여기에 반영됩니다. 키가 연결된 provider만 실 런타임에서 안전하게
              사용됩니다.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-black/40 p-4">
                <div className="text-xs text-gray-500">배치 에이전트</div>
                <div className="text-2xl font-black text-cyan-300">{hiredAgents.length}</div>
              </div>
              <div className="rounded-xl bg-black/40 p-4">
                <div className="text-xs text-gray-500">스튜디오 노드</div>
                <div className="text-2xl font-black text-violet-300">{canvasNodes.length}</div>
              </div>
              <div className="rounded-xl bg-black/40 p-4">
                <div className="text-xs text-gray-500">연결된 API 키</div>
                <div className="text-2xl font-black text-emerald-300">
                  {connectedKeys}/{KEY_PROVIDERS.length}
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
      ) : null}

      {activeTab === "session" ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-bold text-white">현재 세션</h2>
                <p className="mt-1 text-sm text-gray-400">API와 WebSocket 요청에 쓰이는 브라우저 로컬 세션입니다.</p>
              </div>
              <div className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold uppercase text-cyan-200">
                {sessionSource}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-black/40 p-4">
                <div className="text-xs text-gray-500">사용자</div>
                <div className="mt-1 break-all text-sm font-bold text-white">{serverIdentity?.user_id || session.userId}</div>
              </div>
              <div className="rounded-xl bg-black/40 p-4">
                <div className="text-xs text-gray-500">권한</div>
                <div className="mt-1 text-sm font-bold text-emerald-300">{serverIdentity?.role || session.role}</div>
              </div>
              <div className="rounded-xl bg-black/40 p-4">
                <div className="text-xs text-gray-500">만료</div>
                <div className="mt-1 text-sm font-bold text-gray-100">{sessionExpiry}</div>
              </div>
            </div>
            {sessionNotice ? (
              <div className="mt-4 rounded border border-emerald-700/60 bg-emerald-900/20 p-3 text-sm text-emerald-200">
                {sessionNotice}
              </div>
            ) : null}
            {sessionError ? (
              <div className="mt-4 rounded border border-red-700/60 bg-red-900/20 p-3 text-sm text-red-200">{sessionError}</div>
            ) : null}
          </div>

          <div className="rounded-2xl bg-[#111111] p-6">
            <h3 className="mb-4 font-bold text-white">세션 발급</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-gray-300">
                사용자 ID
                <input
                  value={sessionForm.userId}
                  onChange={(event) => setSessionForm((prev) => ({ ...prev, userId: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                  placeholder="local-owner"
                />
              </label>
              <label className="text-sm font-semibold text-gray-300">
                권한
                <select
                  value={sessionForm.role}
                  onChange={(event) => setSessionForm((prev) => ({ ...prev, role: event.target.value as SessionRole }))}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                >
                  {SESSION_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-gray-300">
                만료 초
                <input
                  value={sessionForm.ttlSeconds}
                  onChange={(event) => setSessionForm((prev) => ({ ...prev, ttlSeconds: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                  inputMode="numeric"
                />
              </label>
              <label className="text-sm font-semibold text-gray-300">
                관리자 토큰
                <input
                  value={sessionForm.adminToken}
                  onChange={(event) => setSessionForm((prev) => ({ ...prev, adminToken: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                  type="password"
                  placeholder="BREMEN_ADMIN_TOKEN"
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={issueJwtSession}
                disabled={sessionBusy}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" />
                {sessionBusy ? "발급 중" : "JWT 발급"}
              </button>
              <button
                type="button"
                onClick={saveHeaderSession}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5"
              >
                헤더 세션 저장
              </button>
              <button
                type="button"
                onClick={clearJwtSession}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5"
              >
                <LogOut className="h-4 w-4" />
                JWT 제거
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "keys" ? (
        <div className="space-y-4">
          <div className="mb-6 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-blue-400">BYOK (Bring Your Own Key)</h3>
              <span className="rounded border border-blue-300/20 bg-black/20 px-2 py-1 text-[10px] font-semibold text-blue-100">
                {keyDataMode === "demo"
                  ? "DEMO"
                  : keyDataMode === "loading"
                    ? "SYNCING"
                    : keyDataMode === "live"
                      ? "LIVE"
                      : keyDataMode === "restricted"
                        ? "RESTRICTED"
                        : "UNAVAILABLE"}
              </span>
            </div>
            <p className="text-sm text-blue-200/70">
              브래맨은 사용자의 API 키를 암호화해 관리합니다. 현재 live worker는 OpenAI provider에 연결되어 있고,
              다른 provider 키는 향후 runtime adapter 연결 상태를 함께 확인해야 합니다.
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void registerKey();
            }}
            className="rounded-2xl border border-white/10 bg-[#111111] p-5"
          >
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold text-white">키 등록</h3>
                <p className="mt-1 text-xs text-gray-500">등록된 키는 서버 DB에 암호화되어 저장되고, 응답에는 원문이 표시되지 않습니다.</p>
              </div>
              <button
                type="button"
                onClick={() => void refreshKeys()}
                disabled={keyBusy === "refresh"}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${keyBusy === "refresh" ? "animate-spin" : ""}`} />
                새로고침
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[160px_1fr]">
              <label className="text-sm font-semibold text-gray-300">
                Provider
                <select
                  value={keyForm.provider}
                  onChange={(event) => setKeyForm((prev) => ({ ...prev, provider: event.target.value as KeyProvider }))}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                >
                  {KEY_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {API_PROVIDER_CONFIG[provider].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-gray-300">
                API 키
                <input
                  value={keyForm.apiKey}
                  onChange={(event) => setKeyForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                  type="password"
                  placeholder={KEY_PROVIDER_COPY[keyForm.provider].placeholder}
                />
              </label>
              <label className="text-sm font-semibold text-gray-300 md:col-span-2">
                관리자 토큰
                <input
                  value={keyForm.adminToken}
                  onChange={(event) => setKeyForm((prev) => ({ ...prev, adminToken: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                  type="password"
                  placeholder="BREMEN_ADMIN_TOKEN"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={isDemoMode || keyBusy === "register"}
              className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              <Save className="h-4 w-4" />
              {keyBusy === "register" ? "등록 중" : "키 등록"}
            </button>
            {keyNotice ? (
              <div className="mt-4 rounded border border-emerald-700/60 bg-emerald-900/20 p-3 text-sm text-emerald-200">
                {keyNotice}
              </div>
            ) : null}
            {keyError ? (
              <div className="mt-4 rounded border border-red-700/60 bg-red-900/20 p-3 text-sm text-red-200">{keyError}</div>
            ) : null}
          </form>

          <div className="grid grid-cols-1 gap-4">
            {keyCards.map(({ provider, config, copy, status }) => {
              const registered = Boolean(status?.registered);
              const updatedAt =
                typeof status?.updated_at === "number" ? new Date(status.updated_at * 1000).toLocaleString("ko-KR") : "";
              return (
                <div key={provider} className="flex flex-col gap-4 rounded-2xl bg-[#111111] p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center space-x-4">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl border text-sm font-black"
                      style={{ borderColor: `${config.color}55`, background: config.bg, color: config.color }}
                    >
                      {config.label.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="flex items-center font-bold">
                        {config.label}
                        {registered ? (
                          <CheckCircle className="ml-2 h-4 w-4 text-green-400" />
                        ) : (
                          <AlertCircle className="ml-2 h-4 w-4 text-gray-500" />
                        )}
                      </h3>
                      <p className="text-xs text-gray-500">{copy.description}</p>
                      {registered ? (
                        <p className="mt-1 text-xs font-mono text-gray-400">
                          {status?.masked || "등록됨"} {updatedAt ? `· ${updatedAt}` : ""}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-mono ${registered ? "text-green-400" : "text-gray-400"}`}>
                      {registered ? "연결됨" : "미연결"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeKey(provider)}
                      disabled={isDemoMode || !registered || keyBusy === provider}
                      className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl bg-[#111111] p-4 text-xs text-gray-500">
            등록된 키: {keys.map((k) => `${k.provider}(${k.registered ? "연결" : "미연결"})`).join(", ") || "없음"}
          </div>
        </div>
      ) : null}

      {activeTab === "approval" ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="mb-2 flex items-center gap-2 font-bold text-amber-100">
                  <BellRing className="h-4 w-4" />
                  Human Gate 승인 채널
                </h3>
                <p className="max-w-2xl text-sm leading-relaxed text-amber-50/65">
                  승인 후 실행 노드가 멈췄을 때 관리자 대기 큐, 이메일, 문자, 카톡 webhook으로 알림을 보냅니다.
                  실제 승인은 실행 기록의 승인 대기 큐 또는 옵스룸에서 처리됩니다.
                </p>
              </div>
              <span className="rounded-full border border-amber-400/25 bg-black/25 px-3 py-1 text-xs font-semibold text-amber-100">
                {approvalBusy === "load" ? "동기화 중" : "Runtime linked"}
              </span>
            </div>
          </div>

          {isDemoMode ? (
            <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
              데모 모드에서는 저장하지 않습니다. Live 모드에서 webhook URL과 토큰을 저장하면 다음 승인 요청부터 적용됩니다.
            </div>
          ) : null}
          {approvalNotice ? (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {approvalNotice}
            </div>
          ) : null}
          {approvalError ? (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {approvalError}
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-bold text-white">공통 전송 설정</h3>
                <p className="mt-1 text-xs text-gray-500">승인 링크 생성과 외부 webhook 인증에 사용됩니다.</p>
              </div>
              <button
                type="button"
                onClick={() => void saveApprovalSettings()}
                disabled={isDemoMode || approvalBusy === "save"}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {approvalBusy === "save" ? "저장 중" : "설정 저장"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-gray-300">
                공개 URL
                <input
                  value={approvalSettings.public_base_url}
                  onChange={(event) => updateApprovalSettings({ public_base_url: event.target.value })}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  placeholder="https://bremen.example.com"
                />
                <span className="mt-1 block text-[11px] font-normal text-gray-600">
                  승인/옵스룸 링크의 기준 주소입니다.
                </span>
              </label>
              <label className="text-sm font-semibold text-gray-300">
                공통 Webhook Token
                <input
                  value={approvalSettings.webhook_token || ""}
                  onChange={(event) =>
                    updateApprovalSettings({
                      webhook_token: event.target.value,
                      clear_webhook_token: false
                    })
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  type="password"
                  placeholder={
                    approvalSettings.webhook_token_registered
                      ? `등록됨 · ${approvalSettings.webhook_token_masked || "masked"}`
                      : "Bearer token"
                  }
                />
                <span className="mt-1 block text-[11px] font-normal text-gray-600">
                  저장 후 원문은 다시 표시되지 않습니다.
                </span>
              </label>
            </div>

            <label className="mt-4 inline-flex min-h-9 cursor-pointer items-center gap-2 text-xs font-semibold text-gray-400">
              <input
                type="checkbox"
                checked={Boolean(approvalSettings.clear_webhook_token)}
                onChange={(event) =>
                  updateApprovalSettings({
                    clear_webhook_token: event.target.checked,
                    webhook_token: event.target.checked ? "" : approvalSettings.webhook_token
                  })
                }
              />
              저장 시 기존 webhook token 제거
            </label>

            <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
              {Object.entries(approvalEnvOverrides).map(([key, enabled]) => (
                <span
                  key={key}
                  className={`rounded-lg border px-2 py-1 ${
                    enabled
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
                      : "border-white/10 bg-white/5 text-gray-500"
                  }`}
                >
                  env {key}: {enabled ? "on" : "off"}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {APPROVAL_CHANNELS.map((channelId) => {
              const copy = APPROVAL_CHANNEL_COPY[channelId];
              const channel = approvalSettings.channels[channelId];
              const external = channelId !== "admin_queue";
              return (
                <div key={channelId} className="rounded-2xl border border-white/10 bg-[#111111] p-5">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white">{copy.label}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            channel.enabled
                              ? "bg-emerald-500/15 text-emerald-200"
                              : "bg-white/5 text-gray-500"
                          }`}
                        >
                          {channel.enabled ? "enabled" : "off"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{copy.description}</p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-300">
                      <input
                        type="checkbox"
                        checked={channel.enabled}
                        disabled={!external}
                        onChange={(event) => updateApprovalChannel(channelId, { enabled: event.target.checked })}
                      />
                      사용
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-sm font-semibold text-gray-300">
                      기본 대상
                      <input
                        value={channel.target}
                        onChange={(event) => updateApprovalChannel(channelId, { target: event.target.value })}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                        placeholder={channelId === "email" ? "ops@example.com" : channelId === "admin_queue" ? "운영 관리자" : "승인 담당 채널"}
                      />
                    </label>
                    <label className="text-sm font-semibold text-gray-300">
                      Webhook URL
                      <input
                        value={channel.webhook_url}
                        onChange={(event) => updateApprovalChannel(channelId, { webhook_url: event.target.value })}
                        disabled={!external}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder={external ? "https://hooks.example.com/approval" : "내부 큐"}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeTab === "billing" ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-6">
            <h3 className="mb-2 flex items-center gap-2 font-bold text-yellow-200">
              <TrendingUp className="h-4 w-4" />
              크레딧 · 실행 비용
              <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                {billingDataMode === "demo"
                  ? "DEMO"
                  : billingDataMode === "loading"
                    ? "SYNCING"
                    : billingDataMode === "live"
                      ? "LIVE"
                      : "UNAVAILABLE"}
              </span>
            </h3>
            <p className="text-sm text-gray-400">
              {isDemoMode
                ? "플랫폼 크레딧과 실행 비용이 한 원장으로 수렴하는 예시입니다."
                : "실제 provider 비용과 로열티 원장의 주간 집계입니다. 크레딧 충전 기능은 아직 연결되지 않았습니다."}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl bg-black/40 p-4">
                <div className="text-xs text-gray-500">잔여 크레딧{isDemoMode ? " (샘플)" : ""}</div>
                <div className="text-2xl font-black text-yellow-300">{isDemoMode ? "12,450" : "미연동"}</div>
              </div>
              <div className="rounded-xl bg-black/40 p-4">
                <div className="text-xs text-gray-500">이번 달 누적 로열티</div>
                <div className="text-2xl font-black text-green-400">${total.toFixed(2)}</div>
              </div>
              <div className="rounded-xl bg-black/40 p-4">
                <div className="text-xs text-gray-500">
                  누적 실행 횟수{isDemoMode ? " (샘플)" : ""}
                </div>
                <div className="text-2xl font-black text-white">{usage.toLocaleString()}</div>
              </div>
            </div>
            <button
              type="button"
              disabled
              className="mt-4 w-full cursor-not-allowed rounded-xl bg-white/5 py-3 text-sm font-bold text-gray-500 md:w-auto md:px-8"
            >
              크레딧 충전 (준비 중)
            </button>
          </div>

          <div className="rounded-2xl bg-[#111111] p-6">
            <h3 className="mb-4 font-bold">최근 실행 비용 내역</h3>
            <div className="space-y-3">
              {settlements.slice(0, 6).map((row, idx) => (
                <div
                  key={`${row.period}-${row.receiver_team_id || row.receiver_workflow_id || "unassigned"}-${idx}`}
                  className="flex items-center justify-between rounded-xl bg-white/5 p-3"
                >
                  <div>
                    <div className="font-semibold">
                      실행 그룹 {row.receiver_team_id || row.receiver_workflow_id || idx + 1}
                    </div>
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
