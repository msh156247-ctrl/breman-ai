import type { Dispatch, SetStateAction } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { SESSION_ROLES, type SessionIdentity, type SessionRole } from "../../lib/auth";
import type { AuthWhoami } from "../../lib/api";

export type MyPageSessionForm = {
  userId: string;
  role: SessionRole;
  ttlSeconds: string;
  adminToken: string;
};

type MyPageSessionPanelProps = {
  session: SessionIdentity;
  serverIdentity: AuthWhoami | null;
  sessionForm: MyPageSessionForm;
  setSessionForm: Dispatch<SetStateAction<MyPageSessionForm>>;
  sessionBusy: boolean;
  sessionNotice: string;
  sessionError: string;
  onIssueJwtSession: () => void;
  onSaveHeaderSession: () => void;
  onClearJwtSession: () => void;
};

export function MyPageSessionPanel({
  session,
  serverIdentity,
  sessionForm,
  setSessionForm,
  sessionBusy,
  sessionNotice,
  sessionError,
  onIssueJwtSession,
  onSaveHeaderSession,
  onClearJwtSession
}: MyPageSessionPanelProps) {
  const sessionSource = serverIdentity?.source || (session.jwt ? "jwt" : "header");
  const sessionExpiry = session.expiresAt ? new Date(session.expiresAt).toLocaleString("ko-KR") : "헤더 세션";

  return (
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
            onClick={onIssueJwtSession}
            disabled={sessionBusy}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ShieldCheck className="h-4 w-4" />
            {sessionBusy ? "발급 중" : "JWT 발급"}
          </button>
          <button
            type="button"
            onClick={onSaveHeaderSession}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5"
          >
            헤더 세션 저장
          </button>
          <button
            type="button"
            onClick={onClearJwtSession}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" />
            JWT 제거
          </button>
        </div>
      </div>
    </div>
  );
}
