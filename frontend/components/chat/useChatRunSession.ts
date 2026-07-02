import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
  eventDate,
  mergeApiChatRows,
  missionStateLabels,
  roomStatusFromMissionState,
  type ChatRow,
  type RoomStatus,
  type RuntimeDataMode
} from "./chat-runtime-model";
import { eventToChatRow } from "./chat-timeline-model";
import {
  applyRuntimeNodeState,
  resolveNodeIdForRuntimeEvent,
  runtimeEventChatRow,
  setHumanApprovalNodeState
} from "./chat-runtime-events";
import { fetchCurrentPendingApproval, fetchRuntimeSnapshot } from "./chat-runtime-api";
import { useChatApprovalActions } from "./useChatApprovalActions";
import { useChatApprovalPolling } from "./useChatApprovalPolling";
import { useChatUrlSelectionState } from "./useChatUrlSelectionState";

export function useChatRunSession(runId: string) {
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
  const {
    selectedMetricNode,
    setSelectedMetricNode,
    selectedArtifact,
    setSelectedArtifact,
    sideTab,
    setSideTab
  } = useChatUrlSelectionState();
  const {
    missionRunState,
    clearMissionRunTransitionWarning,
    resetMissionRunState,
    artifactVersions,
    nodes,
    setNodeExecutionState
  } = useAppStore();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const liveRuntimeReadyRef = useRef(false);
  const missionStatusRef = useRef<MissionRunState>(mockRunRecord?.state || "queued");

  const transitionRuntimeState = useCallback((nextState: MissionRunState, source: string) => {
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
  }, []);

  const {
    isApproving,
    isRetryingApprovalNotifications,
    handleApprove,
    handleRetryApprovalNotifications
  } = useChatApprovalActions({
    runId,
    isDemoMission,
    setMessages,
    setStatus,
    setRuntimeLoadError,
    setMissionDetail,
    setCurrentApproval,
    setApprovalSyncError,
    setApprovalLastSyncedAt,
    setRuntimeRefreshNonce,
    transitionRuntimeState
  });

  useEffect(() => {
    clearMissionRunTransitionWarning();
  }, [clearMissionRunTransitionWarning]);

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
      try {
        const snapshot = await fetchRuntimeSnapshot(runId);
        if (!alive) return;
        liveRuntimeReadyRef.current = true;
        setMissionDetail(snapshot.detail);
        setMissionTimelineEvents(snapshot.timelineEvents);
        setMissionArtifacts(snapshot.artifacts);
        setMissionEvaluations(snapshot.evaluations);
        setStatus(roomStatusFromMissionState(snapshot.detail.status));
        missionStatusRef.current = snapshot.detail.status;
        resetMissionRunState(snapshot.detail.status, "runtime.api.snapshot");
        setRuntimeDataMode("live");
        if (snapshot.timelineEvents.length > 0) {
          const apiRows = snapshot.timelineEvents.map(eventToChatRow);
          setMessages((prev) => mergeApiChatRows(prev, apiRows));
        }
        fetchCurrentPendingApproval(runId)
          .then((approval) => {
            if (!alive) return;
            setCurrentApproval(approval);
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

  useChatApprovalPolling({
    runId,
    isDemoMission,
    currentApproval,
    missionDetail,
    missionRunState,
    setCurrentApproval,
    setApprovalSyncError,
    setApprovalLastSyncedAt,
    setStatus,
    setRuntimeRefreshNonce,
    transitionRuntimeState
  });

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
        const mappedNodeId = resolveNodeIdForRuntimeEvent(nodes, undefined, event.row.role, event.row.content);
        if (mappedNodeId && event.row.type === "agent") {
          setNodeExecutionState(mappedNodeId, "running");
        }
        if (event.row.type === "human_gate") {
          setStatus("blocked");
          transitionRuntimeState("awaiting_approval", "runtime.fallback.human_gate");
          setHumanApprovalNodeState(nodes, setNodeExecutionState, "waiting_input");
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
      applyRuntimeNodeState(nodes, setNodeExecutionState, kind, data, message);
      setMessages((prev) =>
        appendUniqueChatRows(prev, [runtimeEventChatRow(runId, kind, data, message)])
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
  }, [isDemoMission, mockRunRecord, nodes, runId, resetMissionRunState, setNodeExecutionState]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

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
