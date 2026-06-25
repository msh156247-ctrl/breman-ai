"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Filter,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck
} from "lucide-react";
import {
  approveMissionGate,
  fetchMissionRuns,
  fetchPendingApprovals,
  retryApprovalNotifications,
  type PendingApproval
} from "../../lib/api";
import { isDemoModeEnabled } from "../../lib/demo-mode";
import { MOCK_MISSION_RUNS } from "../../lib/mock-data";
import type { MissionRunRecord, MissionRunState } from "../../types";

const STATE_STYLE: Record<MissionRunState, string> = {
  queued: "border-slate-500/40 bg-slate-900/40 text-slate-200",
  planning: "border-cyan-500/40 bg-cyan-900/30 text-cyan-200",
  running: "border-blue-500/40 bg-blue-900/30 text-blue-200",
  retrying: "border-orange-500/40 bg-orange-900/25 text-orange-200",
  escalated: "border-fuchsia-500/40 bg-fuchsia-900/25 text-fuchsia-200",
  completed: "border-emerald-500/40 bg-emerald-900/25 text-emerald-200",
  failed: "border-rose-500/40 bg-rose-900/25 text-rose-200",
  awaiting_approval: "border-amber-500/40 bg-amber-900/25 text-amber-200",
  blocked: "border-violet-500/40 bg-violet-900/25 text-violet-200",
  cancelled: "border-gray-500/40 bg-gray-900/25 text-gray-300"
};

const STATE_LABEL: Record<MissionRunState, string> = {
  queued: "대기",
  planning: "계획 중",
  running: "실행 중",
  retrying: "재시도",
  escalated: "에스컬레이션",
  completed: "완료",
  failed: "실패",
  awaiting_approval: "승인 대기",
  blocked: "차단",
  cancelled: "취소"
};

type FilterKey = "all" | MissionRunState;
type RuntimeQueueSyncOptions = {
  clearOnError?: boolean;
  silent?: boolean;
};

function formatApprovalTime(value: number | string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 1_000_000_000_000 ? value : value * 1000).toLocaleString();
  }
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : "-";
}

function approvalChannelLabel(channel: string): string {
  const labels: Record<string, string> = {
    admin_queue: "관리자 대기열",
    email: "이메일",
    sms: "문자",
    kakao: "카톡"
  };
  return labels[channel] || channel;
}

function approvalDeliveryLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "대기",
    pending: "전송 준비",
    sent: "전송됨",
    failed: "전송 실패",
    outbox_pending: "외부 전송 대기"
  };
  return labels[status] || status || "대기";
}

function approvalNotificationTone(status: string): string {
  if (status === "failed") return "border-rose-500/30 bg-rose-500/10 text-rose-100";
  if (status === "sent") return "border-cyan-500/25 bg-cyan-500/10 text-cyan-100";
  if (status === "outbox_pending") return "border-violet-500/25 bg-violet-500/10 text-violet-100";
  return "border-amber-500/25 bg-amber-500/10 text-amber-100";
}

function retryableApprovalNotifications(approval: PendingApproval) {
  return approval.notifications.filter(
    (notification) =>
      notification.channel !== "admin_queue" &&
      notification.status !== "approved" &&
      ["failed", "outbox_pending", "pending"].includes(notification.delivery_status)
  );
}

function approvalPriority(approval: PendingApproval): {
  label: string;
  className: string;
  nextAction: string;
} {
  const hasDeliveryFailure = approval.notifications.some((notification) => notification.delivery_status === "failed");
  if (!approval.runtime_active) {
    return {
      label: "재실행 확인",
      className: "border-violet-400/30 bg-violet-500/10 text-violet-100",
      nextAction: "옵스룸에서 런타임 상태 확인"
    };
  }
  if (hasDeliveryFailure) {
    return {
      label: "채널 오류",
      className: "border-rose-400/30 bg-rose-500/10 text-rose-100",
      nextAction: "전송 실패 채널 확인"
    };
  }
  if (approval.can_approve) {
    return {
      label: "승인 가능",
      className: "border-amber-400/30 bg-amber-500/10 text-amber-100",
      nextAction: "승인 처리"
    };
  }
  return {
    label: "확인 필요",
    className: "border-slate-400/30 bg-slate-500/10 text-slate-100",
    nextAction: "큐 동기화"
  };
}

function runNextAction(row: MissionRunRecord): {
  href: string;
  label: string;
  caption: string;
  className: string;
} {
  const base = `/chat/${row.id}`;
  if (row.state === "awaiting_approval") {
    return {
      href: `${base}?tab=approvals`,
      label: "승인 처리",
      caption: "Human Gate 확인",
      className: "border-amber-300/30 bg-amber-500/10 text-amber-100"
    };
  }
  if (row.state === "completed") {
    return {
      href: `${base}?tab=artifacts`,
      label: "산출물 보기",
      caption: "결과 검토",
      className: "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
    };
  }
  if (row.state === "failed" || row.state === "blocked" || row.state === "cancelled") {
    return {
      href: `${base}?tab=timeline`,
      label: "원인 확인",
      caption: "타임라인 추적",
      className: "border-rose-300/25 bg-rose-500/10 text-rose-100"
    };
  }
  if (row.state === "retrying") {
    return {
      href: `${base}?tab=timeline`,
      label: "재시도 추적",
      caption: "이벤트 확인",
      className: "border-orange-300/25 bg-orange-500/10 text-orange-100"
    };
  }
  if (row.state === "queued" || row.state === "planning") {
    return {
      href: `${base}?tab=timeline`,
      label: "준비 상태 보기",
      caption: "실행 전 단계",
      className: "border-cyan-300/25 bg-cyan-500/10 text-cyan-100"
    };
  }
  return {
    href: `${base}?tab=timeline`,
    label: "실행 추적",
    caption: "실시간 이벤트",
    className: "border-blue-300/25 bg-blue-500/10 text-blue-100"
  };
}

export default function RunsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const isDemoMode = isDemoModeEnabled();
  const [liveRuns, setLiveRuns] = useState<MissionRunRecord[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [runDataMode, setRunDataMode] = useState<"demo" | "loading" | "live" | "fallback">("demo");
  const [approvalError, setApprovalError] = useState("");
  const [approvalNotice, setApprovalNotice] = useState("");
  const [approvingMissionId, setApprovingMissionId] = useState("");
  const [retryingMissionId, setRetryingMissionId] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const syncRequestIdRef = useRef(0);

  const syncRuntimeQueue = useCallback(async (options: RuntimeQueueSyncOptions = {}) => {
    const requestId = syncRequestIdRef.current + 1;
    syncRequestIdRef.current = requestId;
    if (isDemoMode) {
      setRunDataMode("demo");
      setPendingApprovals([]);
      setLastSyncedAt(null);
      setApprovalError("");
      return true;
    }
    setRunDataMode((prev) => (options.silent && prev === "live" ? "live" : "loading"));
    try {
      const [runs, approvals] = await Promise.all([fetchMissionRuns(), fetchPendingApprovals()]);
      if (syncRequestIdRef.current !== requestId) return false;
      setLiveRuns(runs);
      setPendingApprovals(approvals.approvals);
      setApprovalError("");
      setRunDataMode("live");
      setLastSyncedAt(new Date());
      return true;
    } catch (error) {
      if (syncRequestIdRef.current !== requestId) return false;
      if (options.clearOnError !== false) {
        setPendingApprovals([]);
      }
      setApprovalError(error instanceof Error ? error.message : "failed_to_sync_runtime_queue");
      setRunDataMode("fallback");
      return false;
    }
  }, [isDemoMode]);

  useEffect(() => {
    void syncRuntimeQueue({ clearOnError: true });
  }, [isDemoMode, refreshNonce, syncRuntimeQueue]);

  useEffect(() => {
    if (isDemoMode) return;
    const timer = window.setInterval(() => {
      void syncRuntimeQueue({ clearOnError: false, silent: true });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [isDemoMode, syncRuntimeQueue]);

  const handleApprove = async (approval: PendingApproval) => {
    if (approvingMissionId) return;
    setApprovingMissionId(approval.mission_id);
    setApprovalError("");
    setApprovalNotice("");
    try {
      await approveMissionGate(approval.mission_id);
      setPendingApprovals((prev) => prev.filter((item) => item.mission_id !== approval.mission_id));
      setApprovalNotice(`${approval.mission_id} 승인 처리 완료. 런타임 상태를 다시 동기화합니다.`);
      setRefreshNonce((value) => value + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed_to_approve_mission";
      setApprovalError(
        message.includes("no_pending_human_gate") || message.includes(":409")
          ? "이미 처리되었거나 현재 대기 중인 Human Gate가 없습니다. 큐를 다시 동기화합니다."
          : message
      );
      setRefreshNonce((value) => value + 1);
    } finally {
      setApprovingMissionId("");
    }
  };

  const handleRetryNotifications = async (approval: PendingApproval) => {
    if (retryingMissionId) return;
    setRetryingMissionId(approval.mission_id);
    setApprovalError("");
    setApprovalNotice("");
    try {
      const response = await retryApprovalNotifications(approval.mission_id);
      setApprovalNotice(`${approval.mission_id} 승인 알림 ${response.retried_count}건 재전송을 시도했습니다.`);
      setRefreshNonce((value) => value + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed_to_retry_approval_notifications";
      setApprovalError(
        message.includes("no_retryable_approval_notifications") || message.includes(":409")
          ? "재전송할 외부 승인 알림이 없습니다. 큐를 다시 동기화합니다."
          : message
      );
      setRefreshNonce((value) => value + 1);
    } finally {
      setRetryingMissionId("");
    }
  };

  const rows = useMemo(() => {
    const source = isDemoMode ? MOCK_MISSION_RUNS : liveRuns;
    let r = [...source];
    if (filter !== "all") r = r.filter((row) => row.state === filter);
    if (q.trim()) {
      const n = q.trim().toLowerCase();
      r = r.filter(
        (row) =>
          row.goal.toLowerCase().includes(n) ||
          row.workflow_label.toLowerCase().includes(n) ||
          row.id.toLowerCase().includes(n)
      );
    }
    return r.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
  }, [filter, isDemoMode, liveRuns, q]);
  const approvalQueueSummary = useMemo(
    () => ({
      active: pendingApprovals.filter((approval) => approval.runtime_active).length,
      recovered: pendingApprovals.filter((approval) => !approval.runtime_active).length,
      failedDeliveries: pendingApprovals.reduce(
        (count, approval) =>
          count + approval.notifications.filter((notification) => notification.delivery_status === "failed").length,
        0
      ),
      externalChannels: pendingApprovals.reduce(
        (count, approval) => count + approval.approval_channels.filter((channel) => channel !== "admin_queue").length,
        0
      )
    }),
    [pendingApprovals]
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 text-white">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <Link href="/studio" className="inline-flex min-h-9 items-center hover:text-gray-300">
          홈
        </Link>
        <span>/</span>
        <span className="text-gray-400">실행 기록</span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h1 className="text-3xl font-black">실행 기록</h1>
        <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
          {runDataMode === "live"
            ? "LIVE DATA"
            : runDataMode === "loading"
              ? "SYNCING"
              : runDataMode === "fallback"
                ? "LOCAL FALLBACK"
                : "DEMO DATA"}
        </span>
      </div>
      <p className="mb-8 text-sm text-gray-400">
        MissionRun 단위로 실행 관측 기록에 진입합니다. 데모 모드에서는 서버 연결 없이 로컬 예시 실행을 보여줍니다.
      </p>

      <div className="mb-8 rounded-2xl border border-amber-500/20 bg-amber-500/[0.045] p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-lg font-black text-white">
                <ShieldCheck className="h-5 w-5 text-amber-200" />
                승인 대기 큐
              </div>
              <div className="mt-1 text-xs text-amber-100/60">
                Human Gate가 열린 MissionRun을 여기서 확인하고 승인합니다.
              </div>
            </div>
            <span className="rounded border border-amber-400/30 bg-black/25 px-2 py-1 text-xs font-semibold text-amber-100">
              {isDemoMode ? "DEMO 안내" : runDataMode === "loading" ? "동기화 중" : `${pendingApprovals.length}건 대기`}
            </span>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-amber-100/65">
            <span>
              {lastSyncedAt ? `마지막 동기화 ${lastSyncedAt.toLocaleTimeString()}` : "승인 큐 동기화 대기"}
            </span>
            <button
              type="button"
              onClick={() => setRefreshNonce((value) => value + 1)}
              disabled={runDataMode === "loading"}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-semibold text-gray-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${runDataMode === "loading" ? "animate-spin" : ""}`} />
              새로고침
            </button>
          </div>
          {!isDemoMode && pendingApprovals.length > 0 ? (
            <div className="mb-3 grid gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.07] px-3 py-2 text-emerald-100">
                <div className="text-[10px] uppercase text-emerald-100/55">Active</div>
                <div className="mt-1 text-base font-black">{approvalQueueSummary.active}</div>
              </div>
              <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.07] px-3 py-2 text-violet-100">
                <div className="text-[10px] uppercase text-violet-100/55">Recovered</div>
                <div className="mt-1 text-base font-black">{approvalQueueSummary.recovered}</div>
              </div>
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/[0.07] px-3 py-2 text-rose-100">
                <div className="text-[10px] uppercase text-rose-100/55">Channel errors</div>
                <div className="mt-1 text-base font-black">{approvalQueueSummary.failedDeliveries}</div>
              </div>
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.07] px-3 py-2 text-cyan-100">
                <div className="text-[10px] uppercase text-cyan-100/55">External</div>
                <div className="mt-1 text-base font-black">{approvalQueueSummary.externalChannels}</div>
              </div>
            </div>
          ) : null}
          {isDemoMode ? (
            <div className="mb-3 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
              Live 모드에서는 Human Gate가 열린 MissionRun이 이 큐에 표시되고, 여기서 관리자 승인 처리를 할 수 있습니다.
            </div>
          ) : null}
          {approvalNotice ? (
            <div className="mb-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              {approvalNotice}
            </div>
          ) : null}
          {approvalError ? (
            <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-900/20 px-3 py-2 text-xs text-rose-100">
              승인 큐 동기화/처리에 실패했습니다. {approvalError}
            </div>
          ) : null}
          {pendingApprovals.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {pendingApprovals.map((approval) => {
                const priority = approvalPriority(approval);
                const failedNotifications = approval.notifications.filter((notification) => notification.delivery_status === "failed");
                const retryableNotifications = retryableApprovalNotifications(approval);
                return (
                <div
                  key={`${approval.mission_id}-${approval.task_id}`}
                  className="rounded-xl border border-amber-400/20 bg-black/25 p-3"
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-cyan-200">
                        {approval.mission_id}
                      </code>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                          approval.runtime_active
                            ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                            : "border-violet-400/30 bg-violet-500/10 text-violet-100"
                        }`}
                      >
                        {approval.runtime_active ? "active" : "기록 복원"}
                      </span>
                      <span className="rounded border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100">
                        {approval.gate_stage}
                      </span>
                      <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-300">
                        {approval.role || "worker"}
                      </span>
                    </div>
                    <span className={`rounded border px-2 py-1 text-[10px] font-black ${priority.className}`}>
                      {priority.label}
                    </span>
                  </div>
                  <div className="line-clamp-2 text-sm font-semibold text-gray-100">{approval.mission_goal}</div>
                  <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] text-gray-300">
                    다음 행동: <span className="font-semibold text-gray-100">{priority.nextAction}</span>
                  </div>
                  <div className="mt-2 space-y-1 text-[11px] text-gray-500">
                    <div>task: {approval.task_id || "-"}</div>
                    <div>
                      channels:{" "}
                      {approval.approval_channels.map(approvalChannelLabel).join(", ") || approvalChannelLabel("admin_queue")}
                    </div>
                    <div>target: {approval.approval_target || "운영 관리자"}</div>
                    <div>requested: {formatApprovalTime(approval.requested_at)}</div>
                  </div>
                  {approval.notifications.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {approval.notifications.map((notification) => (
                        <span
                          key={notification.id || `${approval.mission_id}-${notification.channel}`}
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                            notification.status === "approved"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                              : approvalNotificationTone(notification.delivery_status)
                          }`}
                          title={notification.delivery_error || notification.delivery_transport}
                        >
                          {approvalChannelLabel(notification.channel)} · {notification.status} ·{" "}
                          {approvalDeliveryLabel(notification.delivery_status)}
                        </span>
                      ))}
                    </div>
                  )}
                  {failedNotifications.length > 0 && (
                    <div className="mt-3 flex gap-2 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[11px] leading-5 text-rose-100/85">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {failedNotifications.map((notification) => approvalChannelLabel(notification.channel)).join(", ")} 전송 실패.
                        채널 설정 또는 외부 webhook을 확인하세요.
                      </span>
                    </div>
                  )}
                  {retryableNotifications.length > 0 && failedNotifications.length === 0 && (
                    <div className="mt-3 flex gap-2 rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-[11px] leading-5 text-violet-100/85">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {retryableNotifications.map((notification) => approvalChannelLabel(notification.channel)).join(", ")} 알림이
                        외부 outbox에 대기 중입니다.
                      </span>
                    </div>
                  )}
                  {!approval.runtime_active && (
                    <div className="mt-3 flex gap-2 rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-[11px] leading-5 text-violet-100/80">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-200" />
                      <span>
                        기록상 승인 대기였지만 현재 대기 런타임이 살아있지 않습니다. 옵스룸에서 상태를 확인한 뒤 재실행하세요.
                      </span>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleApprove(approval)}
                      disabled={approvingMissionId === approval.mission_id || !approval.can_approve}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {!approval.can_approve
                        ? "재실행 필요"
                      : approvingMissionId === approval.mission_id
                          ? "승인 중"
                          : "승인 처리"}
                    </button>
                    {retryableNotifications.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => void handleRetryNotifications(approval)}
                        disabled={retryingMissionId === approval.mission_id}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-violet-300/20 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${retryingMissionId === approval.mission_id ? "animate-spin" : ""}`} />
                        {retryingMissionId === approval.mission_id ? "재전송 중" : "알림 재전송"}
                      </button>
                    ) : null}
                    <Link
                      href={`/chat/${approval.mission_id}?tab=timeline`}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
                    >
                      옵스룸 열기 <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-amber-400/20 px-3 py-5 text-center text-sm text-amber-100/50">
              {runDataMode === "loading" ? "승인 대기 큐를 불러오는 중입니다." : "현재 승인 대기 중인 실행이 없습니다."}
            </div>
          )}
        </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="목표, 상태, 미션 ID 검색…"
            className="w-full rounded-xl border border-white/10 bg-[#111] py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-gray-600 focus:border-blue-500/40"
          />
        </div>
        <button
          type="button"
          onClick={() => router.push(isDemoMode ? `/chat/demo-${Date.now()}` : "/studio")}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold hover:bg-blue-500 sm:shrink-0"
        >
          <PlayCircle className="h-4 w-4" />
          {isDemoMode ? "새 데모 미션" : "스튜디오에서 실행"}
        </button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="flex min-h-9 items-center gap-1 text-xs text-gray-500">
          <Filter className="h-3.5 w-3.5" />
          상태
        </span>
        {(
          [
            "all",
            "planning",
            "running",
            "retrying",
            "awaiting_approval",
            "blocked",
            "escalated",
            "completed",
            "failed",
            "cancelled",
            "queued"
          ] as const
        ).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`min-h-9 rounded-xl px-3 py-2 text-[11px] font-semibold ${
              filter === key ? "bg-white/15 text-white" : "bg-black/40 text-gray-500 hover:text-gray-300"
            }`}
          >
            {key === "all" ? "전체" : STATE_LABEL[key]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const nextAction = runNextAction(row);
          return (
            <Link
              key={row.id}
              href={nextAction.href}
              className="block rounded-2xl border border-white/8 bg-[#111] p-4 transition hover:border-blue-500/35 hover:bg-[#141414]"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <code className="rounded bg-black/50 px-1.5 py-0.5 text-[11px] text-cyan-300">{row.id}</code>
                    {row.demo ? (
                      <span className="rounded border border-cyan-500/30 bg-cyan-900/20 px-1.5 py-0.5 text-[10px] text-cyan-200">
                        DEMO
                      </span>
                    ) : null}
                    <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${STATE_STYLE[row.state]}`}>
                      {STATE_LABEL[row.state]}
                    </span>
                    <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${nextAction.className}`}>
                      {nextAction.caption}
                    </span>
                  </div>
                  <div className="font-medium text-gray-100">{row.goal}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>state: {row.state}</span>
                    <span>·</span>
                    <span>{row.workflow_label}</span>
                    <span>·</span>
                    <span>~${row.est_cost_usd.toFixed(3)}</span>
                    <span>·</span>
                    <span>{row.latency_sec}s</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-row flex-wrap items-center justify-between gap-2 text-xs text-gray-400 sm:flex-col sm:items-end">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {row.started_at.replace("T", " ").slice(0, 16)}
                  </div>
                  <span className={`inline-flex min-h-9 items-center gap-1 rounded-xl border px-3 py-2 font-black ${nextAction.className}`}>
                    {nextAction.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          <Activity className="mx-auto mb-3 h-10 w-10 opacity-40" />
          조건에 맞는 실행이 없습니다.
        </div>
      ) : null}

      <p className="mt-8 text-center text-xs text-gray-600">
        데모 모드가 꺼지면 현재 백엔드의 접근 가능한 MissionRun 목록을 표시합니다.
      </p>
    </div>
  );
}
