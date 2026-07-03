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
  mergeApiChatRows,
  roomStatusFromMissionState,
  type ChatRow,
  type RoomStatus,
  type RuntimeDataMode
} from "./chat-runtime-model";
import { eventToChatRow } from "./chat-timeline-model";
import { fetchCurrentPendingApproval, fetchRuntimeSnapshot } from "./chat-runtime-api";
import {
  appendMockRunSnapshotRow,
  initializeDemoRuntime,
  runChatFallbackSimulation
} from "./chat-fallback-runtime";
import { appendRuntimeWebSocketOpenRow, applyRuntimeWebSocketMessage } from "./chat-runtime-websocket";
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
        appendMockRunSnapshotRow(setMessages, mockRunRecord, "mock-snapshot");
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

    const runFallbackSimulation = () =>
      runChatFallbackSimulation({
        runId,
        isDemoMission,
        mockRunRecord,
        nodes,
        delay,
        isCancelled: () => cancelled,
        setMessages,
        setRuntimeDataMode,
        setStatus,
        resetMissionRunState,
        setNodeExecutionState,
        transitionRuntimeState
      });

    if (isDemoMission) {
      initializeDemoRuntime({
        runId,
        mockRunRecord,
        setMessages,
        setRuntimeDataMode,
        setStatus,
        resetMissionRunState
      });
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
      applyRuntimeWebSocketMessage({
        runId,
        rawMessage: e.data,
        nodes,
        setNodeExecutionState,
        setMessages,
        setStatus,
        setRuntimeRefreshNonce,
        transitionRuntimeState
      });
    };
    ws.onopen = () => {
      if (cancelled) return;
      if (!["completed", "failed", "cancelled"].includes(missionStatusRef.current)) {
        transitionRuntimeState("running", "runtime.ws.open");
      }
      appendRuntimeWebSocketOpenRow(runId, setMessages);
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
  }, [
    isDemoMission,
    mockRunRecord,
    nodes,
    runId,
    resetMissionRunState,
    setNodeExecutionState,
    transitionRuntimeState
  ]);

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
