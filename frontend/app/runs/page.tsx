"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Clock,
  Filter,
  PlayCircle,
  Search
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
import { RunsApprovalQueue } from "../../components/runs/RunsApprovalQueue";
import { runNextAction, STATE_LABEL, STATE_STYLE, type FilterKey, type RuntimeQueueSyncOptions } from "../../components/runs/runs-model";

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

      <RunsApprovalQueue
        isDemoMode={isDemoMode}
        runDataMode={runDataMode}
        pendingApprovals={pendingApprovals}
        approvalQueueSummary={approvalQueueSummary}
        lastSyncedAt={lastSyncedAt}
        approvalNotice={approvalNotice}
        approvalError={approvalError}
        approvingMissionId={approvingMissionId}
        retryingMissionId={retryingMissionId}
        onRefresh={() => setRefreshNonce((value) => value + 1)}
        onApprove={(approval) => void handleApprove(approval)}
        onRetryNotifications={(approval) => void handleRetryNotifications(approval)}
      />

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
