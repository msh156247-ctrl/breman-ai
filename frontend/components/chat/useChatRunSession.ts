import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  approveMissionGate,
  fetchMissionArtifacts,
  fetchMissionDetail,
  fetchMissionEvaluations,
  fetchMissionTimeline,
  fetchPendingApprovals,
  retryApprovalNotifications,
  type MissionArtifactsResponse,
  type MissionDetail,
  type MissionTimelineEvent,
  type PendingApproval
} from "../../lib/api";
import { wsAuthQuery } from "../../lib/auth";
import { MOCK_MISSION_RUNS } from "../../lib/mock-data";
import { wsUrl } from "../../lib/runtime-config";
import { useAppStore } from "../../stores/app.store";
import type { MissionRunState } from "../../types";
import {
  appendUniqueChatRows,
  eventChatType,
  eventDate,
  eventMessage,
  eventToChatRow,
  mergeApiChatRows,
  missionStateLabels,
  normalizeSideTab,
  roomStatusFromMissionState,
  type ChatRow,
  type RoomStatus,
  type RuntimeDataMode,
  type SideTab
} from "./chat-runtime-model";

export function useChatRunSession(runId: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDemoMission = runId.startsWith("demo-");
  const mockRunRecord = useMemo(() => MOCK_MISSION_RUNS.find((run) => run.id === runId) || null, [runId]);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [status, setStatus] = useState<RoomStatus>("running");
  const [runtimeDataMode, setRuntimeDataMode] = useState<RuntimeDataMode>(
    isDemoMission ? "demo" : "loading"
  );
  const [runtimeLoadError, setRuntimeLoadError] = useState<string | null>(null);
  const [missionDetail, setMissionDetail] = useState<MissionDetail | null>(null);
  const [missionTimelineEvents, setMissionTimelineEvents] = useState<MissionTimelineEvent[]>([]);
  const [missionArtifacts, setMissionArtifacts] = useState<MissionArtifactsResponse | null>(null);
  const [missionEvaluations, setMissionEvaluations] = useState<MissionTimelineEvent[]>([]);
  const [currentApproval, setCurrentApproval] = useState<PendingApproval | null>(null);
  const [approvalSyncError, setApprovalSyncError] = useState("");
  const [approvalLastSyncedAt, setApprovalLastSyncedAt] = useState<Date | null>(null);
  const [runtimeRefreshNonce, setRuntimeRefreshNonce] = useState(0);
  const [isApproving, setIsApproving] = useState(false);
  const [isRetryingApprovalNotifications, setIsRetryingApprovalNotifications] = useState(false);
  const [selectedMetricNode, setSelectedMetricNode] = useState<string | null>(searchParams.get("node"));
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(searchParams.get("artifact"));
  const [sideTab, setSideTab] = useState<SideTab>(() => normalizeSideTab(searchParams.get("tab")));
  const {
    missionRunState,
    clearMissionRunTransitionWarning,
    setMissionRunState,
    resetMissionRunState,
    artifactVersions,
    nodes,
    setNodeExecutionState
  } = useAppStore();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const liveRuntimeReadyRef = useRef(false);
  const missionStatusRef = useRef<MissionRunState>(mockRunRecord?.state || "queued");

  const transitionRuntimeState = (nextState: MissionRunState, source: string) => {
    const store = useAppStore.getState();
    let currentState = store.missionRunState;
    if (currentState === nextState) return;
    if (currentState === "queued" && nextState !== "planning" && nextState !== "cancelled") {
      store.setMissionRunState("planning", `${source}.planning`);
      currentState = "planning";
    }
    if (
      currentState === "planning" &&
      !["running", "failed", "cancelled", "escalated"].includes(nextState)
    ) {
      store.setMissionRunState("running", `${source}.running`);
    }
    store.setMissionRunState(nextState, source);
    missionStatusRef.current = useAppStore.getState().missionRunState;
  };

  useEffect(() => {
    clearMissionRunTransitionWarning();
  }, [clearMissionRunTransitionWarning]);

  const resolveNodeIdForEvent = (taskId?: string, roleText?: string, eventText?: string): string | null => {
    const normalizedTaskId = String(taskId || "").trim().toLowerCase();
    if (normalizedTaskId) {
      const exactTask = nodes.find((node) => {
        const data = node.data as Record<string, unknown>;
        return [node.id, data.task_id, data.runtime_task_id]
          .map((value) => String(value || "").trim().toLowerCase())
          .includes(normalizedTaskId);
      });
      if (exactTask) return exactTask.id;
    }

    const role = String(roleText || "").toLowerCase();
    const event = String(eventText || "").toLowerCase();
    const combined = `${role} ${event}`;
    if (!combined.trim()) return null;
    const matched = nodes.find((node) => {
      const label = String((node.data as any)?.label || "").toLowerCase();
      const agentId = String((node.data as any)?.agent_id || "").toLowerCase();
      const category = String((node.data as any)?.category || "").toLowerCase();
      return [label, agentId, category].some((token) => token && combined.includes(token));
    });
    return matched?.id || null;
  };

  useEffect(() => {
    let alive = true;

    if (isDemoMission) {
      liveRuntimeReadyRef.current = false;
      setRuntimeDataMode("demo");
      setRuntimeLoadError(null);
      setMissionDetail(null);
      setMissionTimelineEvents([]);
      setMissionArtifacts(null);
      setMissionEvaluations([]);
      setCurrentApproval(null);
      setApprovalSyncError("");
      setApprovalLastSyncedAt(null);
      return;
    }

    const loadRuntimeSnapshot = async () => {
      setRuntimeDataMode((prev) => (prev === "live" ? "live" : "loading"));
      setRuntimeLoadError(null);
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const [detail, timeline, artifacts, evaluations] = await Promise.all([
            fetchMissionDetail(runId),
            fetchMissionTimeline(runId),
            fetchMissionArtifacts(runId),
            fetchMissionEvaluations(runId)
          ]);
          if (!alive) return;
          liveRuntimeReadyRef.current = true;
          setMissionDetail(detail);
          setMissionTimelineEvents(timeline.events);
          setMissionArtifacts(artifacts);
          setMissionEvaluations(evaluations.evaluations);
          setStatus(roomStatusFromMissionState(detail.status));
          missionStatusRef.current = detail.status;
          resetMissionRunState(detail.status, "runtime.api.snapshot");
          setRuntimeDataMode("live");
          if (timeline.events.length > 0) {
            const apiRows = timeline.events.map(eventToChatRow);
            setMessages((prev) => mergeApiChatRows(prev, apiRows));
          }
          fetchPendingApprovals()
            .then((approvals) => {
              if (!alive) return;
              setCurrentApproval(approvals.approvals.find((approval) => approval.mission_id === runId) || null);
              setApprovalSyncError("");
              setApprovalLastSyncedAt(new Date());
            })
            .catch((approvalError) => {
              if (!alive) return;
              setCurrentApproval(null);
              setApprovalSyncError(
                approvalError instanceof Error ? approvalError.message : "failed_to_sync_pending_approval"
              );
            });
          return;
        } catch (error) {
          lastError = error;
          if (attempt === 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 450));
          }
        }
      }
      if (!alive) return;
      liveRuntimeReadyRef.current = false;
      setRuntimeDataMode("fallback");
      setRuntimeLoadError(lastError instanceof Error ? lastError.message : "failed_to_load_runtime_snapshot");
      if (mockRunRecord) {
        setStatus(roomStatusFromMissionState(mockRunRecord.state));
        resetMissionRunState(mockRunRecord.state, "runtime.mock.snapshot");
        setMessages((prev) =>
          appendUniqueChatRows(prev, [
            {
              id: `mock-snapshot-${mockRunRecord.id}`,
              type: mockRunRecord.state === "awaiting_approval" ? "human_gate" : "system",
              content: `${mockRunRecord.workflow_label}\n${missionStateLabels[mockRunRecord.state] || mockRunRecord.state} · ${mockRunRecord.goal}`,
              timestamp: eventDate(mockRunRecord.started_at),
              source: "simulation"
            }
          ])
        );
      }
    };

    void loadRuntimeSnapshot();
    return () => {
      alive = false;
    };
  }, [isDemoMission, mockRunRecord, runId, resetMissionRunState, runtimeRefreshNonce]);

  useEffect(() => {
    if (isDemoMission) return;
    const shouldPollApproval =
      Boolean(currentApproval) ||
      missionDetail?.status === "awaiting_approval" ||
      missionRunState === "awaiting_approval";
    if (!shouldPollApproval) return;
    let cancelled = false;
    const syncApproval = async () => {
      try {
        const approvals = await fetchPendingApprovals();
        if (cancelled) return;
        const nextApproval = approvals.approvals.find((approval) => approval.mission_id === runId) || null;
        setCurrentApproval(nextApproval);
        setApprovalSyncError("");
        setApprovalLastSyncedAt(new Date());
        if (!nextApproval && currentApproval) {
          setStatus("running");
          transitionRuntimeState("running", "runtime.approval.poll_resolved");
          setRuntimeRefreshNonce((prev) => prev + 1);
        }
      } catch (approvalError) {
        if (cancelled) return;
        setApprovalSyncError(approvalError instanceof Error ? approvalError.message : "failed_to_sync_pending_approval");
      }
    };
    void syncApproval();
    const timer = window.setInterval(() => {
      void syncApproval();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentApproval, isDemoMission, missionDetail?.status, missionRunState, runId, status]);

  useEffect(() => {
    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        timers.push(timer);
      });

    const runFallbackSimulation = async () => {
      if (cancelled) return;
      if (isDemoMission && mockRunRecord?.state === "awaiting_approval") {
        setRuntimeDataMode("demo");
        setStatus("blocked");
        resetMissionRunState("awaiting_approval", "runtime.demo.approval_snapshot");
        setMessages((prev) =>
          appendUniqueChatRows(prev, [
            {
              id: `mock-approval-${mockRunRecord.id}`,
              type: "human_gate",
              content: `${mockRunRecord.workflow_label}\n승인 대기 · ${mockRunRecord.goal}`,
              timestamp: eventDate(mockRunRecord.started_at),
              source: "simulation"
            }
          ])
        );
        return;
      }
      if (!isDemoMission && mockRunRecord) {
        setRuntimeDataMode("fallback");
        setStatus(roomStatusFromMissionState(mockRunRecord.state));
        resetMissionRunState(mockRunRecord.state, "runtime.mock.fallback");
        setMessages((prev) =>
          appendUniqueChatRows(prev, [
            {
              id: `mock-fallback-${mockRunRecord.id}`,
              type: mockRunRecord.state === "awaiting_approval" ? "human_gate" : "system",
              content: `${mockRunRecord.workflow_label}\n${missionStateLabels[mockRunRecord.state] || mockRunRecord.state} · ${mockRunRecord.goal}`,
              timestamp: eventDate(mockRunRecord.started_at),
              source: "simulation"
            }
          ])
        );
        return;
      }
      if (!isDemoMission) setRuntimeDataMode("fallback");
      transitionRuntimeState("running", "runtime.fallback.start");
      const events: Array<{ delay: number; row: ChatRow }> = [
        {
          delay: 800,
          row: {
            id: `sim-${runId}-1`,
            type: "agent",
            role: "developer",
            content: "풀스택 코드 작성봇이 작업을 시작합니다...",
            timestamp: new Date(),
            source: "simulation"
          }
        },
        {
          delay: 1200,
          row: {
            id: `sim-${runId}-2`,
            type: "agent",
            role: "developer",
            content: "FastAPI 백엔드 + Next.js 프론트엔드 초안 완성!",
            timestamp: new Date(),
            source: "simulation"
          }
        },
        {
          delay: 1200,
          row: {
            id: `sim-${runId}-3`,
            type: "human_gate",
            content: "코드 리뷰 단계 진행 전 최종 승인 필요",
            timestamp: new Date(),
            source: "simulation"
          }
        }
      ];
      for (const event of events) {
        await delay(event.delay);
        if (cancelled) return;
        setMessages((prev) => appendUniqueChatRows(prev, [event.row]));
        const mappedNodeId = resolveNodeIdForEvent(undefined, event.row.role, event.row.content);
        if (mappedNodeId && event.row.type === "agent") {
          setNodeExecutionState(mappedNodeId, "running");
        }
        if (event.row.type === "human_gate") {
          setStatus("blocked");
          transitionRuntimeState("awaiting_approval", "runtime.fallback.human_gate");
          nodes
            .filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "hitl")
            .forEach((n) => setNodeExecutionState(n.id, "waiting_input"));
        }
      }
    };

    if (isDemoMission) {
      const initialDemoState = mockRunRecord?.state || "planning";
      resetMissionRunState(initialDemoState, "runtime.demo.init");
      setStatus(roomStatusFromMissionState(initialDemoState));
      setMessages((prev) =>
        appendUniqueChatRows(prev, [
          {
            id: `sys-demo-${runId}`,
            type: "system",
            content: "DEMO 모드: 서버 연결 없이 로컬 예시 실행 로그를 보여줍니다.",
            timestamp: new Date(),
            source: "simulation"
          }
        ])
      );
      void runFallbackSimulation();
      return () => {
        cancelled = true;
        timers.forEach((timer) => clearTimeout(timer));
      };
    }

    let hasLiveEvent = false;
    let fallbackStarted = false;
    const startFallbackOnce = async () => {
      if (cancelled || fallbackStarted || hasLiveEvent || liveRuntimeReadyRef.current) return;
      fallbackStarted = true;
      transitionRuntimeState("escalated", "runtime.ws.disconnected");
      await runFallbackSimulation();
    };
    const ws = new WebSocket(wsUrl(`/ws/${runId}`, wsAuthQuery()));
    ws.onmessage = (e) => {
      if (cancelled) return;
      hasLiveEvent = true;
      setRuntimeDataMode("live");
      let data: any;
      try {
        data = JSON.parse(e.data || "{}");
      } catch {
        return;
      }
      const kind = String(data.type || "event");
      const message = String(data.message || JSON.stringify(data));
      const nextType = eventChatType(kind);
      if (kind === "human_gate_requested") {
        setStatus("blocked");
        transitionRuntimeState("awaiting_approval", "runtime.ws.human_gate_requested");
      } else if (kind === "human_gate_approved") {
        setStatus("running");
        transitionRuntimeState("running", "runtime.ws.human_gate_approved");
      } else if (kind === "mission_completed") {
        setStatus("completed");
        transitionRuntimeState("completed", "runtime.ws.mission_completed");
      } else if (kind === "mission_failed") {
        setStatus("blocked");
        transitionRuntimeState("failed", "runtime.ws.mission_failed");
      } else if (kind === "mission_cancelled") {
        setStatus("blocked");
        transitionRuntimeState("cancelled", "runtime.ws.mission_cancelled");
      }
      if (
        kind === "mission_snapshot" ||
        kind === "mission_completed" ||
        kind === "mission_failed" ||
        kind === "mission_cancelled" ||
        kind === "task_completed" ||
        kind === "task_failed" ||
        kind === "execution_result" ||
        kind === "evaluation_result"
      ) {
        setRuntimeRefreshNonce((prev) => prev + 1);
      }
      if (
        kind === "human_gate_requested" ||
        kind === "human_gate_approved" ||
        kind.startsWith("approval_notification")
      ) {
        setRuntimeRefreshNonce((prev) => prev + 1);
      }
      if (kind.includes("retry")) transitionRuntimeState("retrying", "runtime.ws.retry");
      const mappedNodeId = resolveNodeIdForEvent(
        data.task_id ? String(data.task_id) : undefined,
        data.role ? String(data.role) : undefined,
        message
      );
      if (mappedNodeId) {
        if (kind === "task_started") setNodeExecutionState(mappedNodeId, "running");
        if (kind === "task_completed") setNodeExecutionState(mappedNodeId, "completed");
        if (kind === "task_failed") setNodeExecutionState(mappedNodeId, "failed");
        if (kind.includes("stream")) setNodeExecutionState(mappedNodeId, "streaming");
      }
      if (kind === "human_gate_requested") {
        nodes
          .filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "hitl")
          .forEach((n) => setNodeExecutionState(n.id, "waiting_input"));
      } else if (kind === "human_gate_approved") {
        nodes
          .filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "hitl")
          .forEach((n) => setNodeExecutionState(n.id, "completed"));
      }
      const eventTarget = String(data.task_id || data.mission_id || runId);
      const eventStamp = String(data.timestamp || message);
      setMessages((prev) =>
        appendUniqueChatRows(prev, [
          {
            id: `event-${kind}-${eventTarget}-${eventStamp}`,
            type: nextType,
            content: message,
            role: data.role ? String(data.role) : undefined,
            timestamp: eventDate(data.timestamp),
            source: "stream"
          }
        ])
      );
    };
    ws.onopen = () => {
      if (cancelled) return;
      if (!["completed", "failed", "cancelled"].includes(missionStatusRef.current)) {
        transitionRuntimeState("running", "runtime.ws.open");
      }
      setMessages((prev) =>
        appendUniqueChatRows(prev, [
          {
            id: `sys-open-${runId}`,
            type: "system",
            content: "🚀 실행 워크플로우 런타임을 시작합니다!",
            timestamp: new Date(),
            source: "stream"
          }
        ])
      );
    };
    ws.onerror = async () => {
      // onclose에서 API snapshot 재시도 시간을 준 뒤 fallback 여부를 결정합니다.
    };
    ws.onclose = async (event) => {
      if (cancelled) return;
      if (event.code === 1008) {
        setRuntimeDataMode(mockRunRecord ? "fallback" : "error");
        setRuntimeLoadError(event.reason || "ws_access_denied");
        setStatus("blocked");
        transitionRuntimeState("escalated", "runtime.ws.policy_closed");
        return;
      }
      await delay(700);
      await startFallbackOnce();
    };
    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
      ws.close();
    };
  }, [isDemoMission, mockRunRecord, nodes, runId, resetMissionRunState, setMissionRunState, setNodeExecutionState]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const q = new URLSearchParams(searchParams.toString());
    if (selectedMetricNode) q.set("node", selectedMetricNode);
    else q.delete("node");
    if (selectedArtifact) q.set("artifact", selectedArtifact);
    else q.delete("artifact");
    if (sideTab) q.set("tab", sideTab);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }, [pathname, router, searchParams, selectedArtifact, selectedMetricNode, sideTab]);

  const handleApprove = async () => {
    setIsApproving(true);
    transitionRuntimeState("retrying", "runtime.human.approve");
    try {
      if (!isDemoMission) {
        await approveMissionGate(runId);
        setCurrentApproval(null);
        setApprovalLastSyncedAt(new Date());
        setMissionDetail((prev) => (prev ? { ...prev, status: "running" } : prev));
        setRuntimeRefreshNonce((prev) => prev + 1);
      }
      setMessages((prev) =>
        appendUniqueChatRows(prev, [
          {
            id: `approve-${runId}-${Date.now()}`,
            type: "system",
            content: "✅ 승인 완료. 다음 단계를 진행합니다.",
            timestamp: new Date(),
            source: "stream"
          }
        ])
      );
      setStatus("running");
      transitionRuntimeState("running", "runtime.human.resume");
      setRuntimeLoadError(null);
    } catch (error) {
      setRuntimeLoadError(error instanceof Error ? error.message : "failed_to_approve_mission");
      transitionRuntimeState("escalated", "runtime.human.approve_failed");
    } finally {
      setIsApproving(false);
    }
  };

  const handleRetryApprovalNotifications = async () => {
    if (isDemoMission || isRetryingApprovalNotifications) return;
    setIsRetryingApprovalNotifications(true);
    setApprovalSyncError("");
    try {
      const response = await retryApprovalNotifications(runId);
      const approvals = await fetchPendingApprovals();
      setCurrentApproval(approvals.approvals.find((approval) => approval.mission_id === runId) || null);
      setApprovalLastSyncedAt(new Date());
      setRuntimeRefreshNonce((prev) => prev + 1);
      setMessages((prev) =>
        appendUniqueChatRows(prev, [
          {
            id: `approval-retry-${runId}-${Date.now()}`,
            type: "system",
            content: `📨 승인 알림 ${response.retried_count}건 재전송을 시도했습니다.`,
            timestamp: new Date(),
            source: "stream"
          }
        ])
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed_to_retry_approval_notifications";
      setApprovalSyncError(
        message.includes("409")
          ? "재전송할 외부 승인 알림이 없습니다. 승인 큐를 다시 확인하세요."
          : message
      );
    } finally {
      setIsRetryingApprovalNotifications(false);
    }
  };


  return {
    isDemoMission,
    mockRunRecord,
    messages,
    status,
    runtimeDataMode,
    runtimeLoadError,
    missionDetail,
    missionTimelineEvents,
    missionArtifacts,
    missionEvaluations,
    currentApproval,
    approvalSyncError,
    approvalLastSyncedAt,
    isApproving,
    isRetryingApprovalNotifications,
    selectedMetricNode,
    setSelectedMetricNode,
    selectedArtifact,
    setSelectedArtifact,
    sideTab,
    setSideTab,
    missionRunState,
    artifactVersions,
    bottomRef,
    handleApprove,
    handleRetryApprovalNotifications
  };
}