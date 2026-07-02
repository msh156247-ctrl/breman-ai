import { useMemo } from "react";
import type { MissionArtifactsResponse, MissionDetail, MissionTimelineEvent, PendingApproval } from "../../lib/api";
import type { ArtifactVersion, MissionRunRecord, MissionRunState } from "../../types";
import {
  approvalChannelLabel,
  eventDate,
  missionStateLabels,
  retryableApprovalNotifications,
  runtimeModeLabels,
  type ChatRow,
  type RoomStatus,
  type RuntimeDataMode,
  type SideTab,
  type TimelineRow
} from "./chat-runtime-model";
import {
  buildArtifactDiff,
  buildCostBreakdown,
  buildLiveArtifactTrace,
  buildNodeMetrics,
  buildSelectedArtifactHistory,
  countOperationEvents,
  fallbackArtifactTrace,
  filterTimelineBySelection,
  selectArtifactDetail,
  shouldShowSampleData,
  sortArtifactHistory
} from "./chat-derived-run-data";
import { dedupeTimelineRows, eventToTimelineRow } from "./chat-timeline-model";

type UseChatRunDerivedStateInput = {
  missionTimelineEvents: MissionTimelineEvent[];
  messages: ChatRow[];
  status: RoomStatus;
  missionDetail: MissionDetail | null;
  missionArtifacts: MissionArtifactsResponse | null;
  isDemoMission: boolean;
  mockRunRecord: MissionRunRecord | null;
  runtimeDataMode: RuntimeDataMode;
  selectedArtifact: string | null;
  artifactVersions: ArtifactVersion[];
  selectedMetricNode: string | null;
  currentApproval: PendingApproval | null;
  missionRunState: MissionRunState;
};

export function useChatRunDerivedState({
  missionTimelineEvents,
  messages,
  status,
  missionDetail,
  missionArtifacts,
  isDemoMission,
  mockRunRecord,
  runtimeDataMode,
  selectedArtifact,
  artifactVersions,
  selectedMetricNode,
  currentApproval,
  missionRunState
}: UseChatRunDerivedStateInput) {
  const apiTimelineRows = useMemo<TimelineRow[]>(
    () => missionTimelineEvents.map((event, index) => eventToTimelineRow(event, index, "api")),
    [missionTimelineEvents]
  );
  const streamTimelineRows = useMemo<TimelineRow[]>(
    () =>
      messages
        .filter((m) => m.source !== "api")
        .map((m, index) => ({
          id: `timeline-stream-${m.id}-${index}`,
          ts: m.timestamp.toLocaleTimeString(),
          event: m.type === "agent" ? `${m.role || "worker"} event` : m.content.split("\n")[0],
          detail: m.content.split("\n").slice(1).join("\n") || undefined,
          role: m.role,
          source: "stream" as const,
          kind: m.type === "human_gate" ? "approval" : m.type === "agent" ? "task" : "system",
          tone: m.type === "human_gate" ? "warning" : "default",
          taskId: undefined
        })),
    [messages]
  );
  const timeline = dedupeTimelineRows(apiTimelineRows.length > 0 ? [...apiTimelineRows, ...streamTimelineRows] : streamTimelineRows);

  const mockSnapshotState =
    !isDemoMission || mockRunRecord?.state === "awaiting_approval" ? mockRunRecord?.state || null : null;
  const showSampleData = shouldShowSampleData({ isDemoMission, runtimeDataMode, missionDetail, mockRunRecord });
  const liveArtifactTrace = useMemo(
    () => buildLiveArtifactTrace(missionArtifacts, missionDetail),
    [missionArtifacts, missionDetail]
  );
  const artifactTrace = liveArtifactTrace.length > 0 ? liveArtifactTrace : showSampleData ? fallbackArtifactTrace(status) : [];
  const selectedArtifactDetail = selectArtifactDetail(artifactTrace, selectedArtifact);
  const selectedArtifactHistory = useMemo(
    () => buildSelectedArtifactHistory(artifactVersions, selectedArtifactDetail),
    [artifactVersions, selectedArtifactDetail]
  );
  const sortedArtifactHistory = useMemo(
    () => sortArtifactHistory(selectedArtifactHistory),
    [selectedArtifactHistory]
  );
  const artifactDiff = useMemo(() => buildArtifactDiff(sortedArtifactHistory), [sortedArtifactHistory]);
  const { costBreakdown, totalCost } = buildCostBreakdown({ missionDetail, mockRunRecord, showSampleData });
  const nodeMetrics = buildNodeMetrics({ missionDetail, showSampleData });
  const filteredTimeline = filterTimelineBySelection({
    timeline,
    nodeMetrics,
    selectedMetricNode,
    selectedArtifact
  });
  const operationEventCounts = countOperationEvents(timeline);
  const approvalTimeline = timeline.filter((row) => row.kind === "approval");
  const approvalRetryableNotifications = retryableApprovalNotifications(currentApproval);

  const avgConfidence =
    nodeMetrics.length > 0
      ? nodeMetrics.reduce((acc, row) => acc + row.confidence, 0) / nodeMetrics.length
      : 0;
  const totalRetries = nodeMetrics.reduce((acc, row) => acc + row.retries, 0);
  const completedTasks = missionDetail?.tasks.filter((task) => task.status === "completed").length || 0;
  const mockSuccessRate =
    mockSnapshotState === "completed"
      ? 100
      : mockSnapshotState === "failed" || mockSnapshotState === "cancelled"
        ? 0
        : mockSnapshotState === "blocked" || mockSnapshotState === "awaiting_approval" || mockSnapshotState === "escalated"
          ? 50
          : null;
  const successRate = missionDetail?.tasks.length
    ? (completedTasks / missionDetail.tasks.length) * 100
    : mockSuccessRate !== null
      ? mockSuccessRate
    : nodeMetrics.length > 0
      ? Math.max(0, Math.min(100, ((nodeMetrics.length - totalRetries) / nodeMetrics.length) * 100))
      : 0;
  const startedAtMs = missionDetail ? Date.parse(missionDetail.created_at) : Number.NaN;
  const terminalEventMs = missionTimelineEvents.reduce((latest, event) => {
    if (!["mission_completed", "mission_failed", "mission_cancelled"].includes(event.type)) return latest;
    const timestamp = eventDate(event.timestamp).getTime();
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
  const finishedAtMs = missionDetail?.finished_at ? Date.parse(missionDetail.finished_at) : Number.NaN;
  const elapsedSec =
    missionDetail && Number.isFinite(startedAtMs)
      ? Math.max(
          1,
          Math.round(
            ((Number.isFinite(finishedAtMs) ? finishedAtMs : terminalEventMs || Date.now()) - startedAtMs) / 1000
          )
        )
      : mockRunRecord
        ? mockRunRecord.latency_sec
      : Math.max(1, messages.length * 12);
  const runtimeHealth: "attention" | "stable" | "running" =
    status === "blocked" ? "attention" : status === "completed" ? "stable" : "running";
  const displayMissionState = missionDetail?.status || mockSnapshotState || missionRunState;
  const displayOwner = missionDetail?.owner_id || "local-owner";
  const displayMissionStateLabel = missionStateLabels[displayMissionState] || displayMissionState;
  const displayRuntimeDataMode: RuntimeDataMode = missionDetail
    ? missionDetail.use_mock
      ? "demo"
      : "live"
    : isDemoMission
      ? "demo"
      : mockRunRecord
        ? "fallback"
        : runtimeDataMode;
  const displayRuntimeModeLabel = missionDetail
    ? missionDetail.use_mock
      ? "Mock 실행"
      : "Live 실행"
    : runtimeModeLabels[displayRuntimeDataMode];
  const runtimeHealthLabel =
    runtimeHealth === "attention" ? "확인 필요" : runtimeHealth === "stable" ? "안정" : "이벤트 수집 중";
  const localHumanGateOpen =
    !missionDetail && status === "blocked" && messages.some((message) => message.type === "human_gate");
  const approvalGateOpen =
    Boolean(currentApproval) || displayMissionState === "awaiting_approval" || localHumanGateOpen;
  const nextOperationLabel =
    approvalGateOpen
      ? "승인 또는 관리자 확인을 기다리는 중"
      : displayMissionState === "completed"
        ? "실행 결과 검토 가능"
        : ["blocked", "failed", "cancelled", "escalated"].includes(displayMissionState)
          ? "타임라인에서 중단 원인을 확인하세요"
        : displayRuntimeDataMode === "fallback"
          ? "라이브 기록 연결 전, 로컬 미리보기 표시"
          : displayRuntimeDataMode === "error"
            ? "인증 또는 접근 권한을 확인하세요"
          : "다음 실행 이벤트 수집 중";
  const approvalChannelSummary = currentApproval
    ? currentApproval.approval_channels.map(approvalChannelLabel).join(", ") || "관리자 대기열"
    : approvalTimeline.length > 0
      ? "타임라인 기록"
      : "없음";
  const approvalNextAction = currentApproval
    ? currentApproval.can_approve
      ? "승인 가능"
      : "재실행 확인"
    : approvalGateOpen
      ? "큐 동기화 중"
      : "대기 없음";
  const primaryRuntimeAction: {
    tab: SideTab;
    label: string;
    caption: string;
    className: string;
  } = approvalGateOpen
    ? {
        tab: "approvals",
        label: currentApproval?.can_approve ? "승인 처리" : "승인 상태 확인",
        caption: currentApproval
          ? `${approvalChannelSummary} · ${currentApproval.approval_target || "운영 관리자"}`
          : isDemoMission
            ? "데모 승인 대기 · 운영 관리자"
          : "승인 큐 동기화가 필요합니다.",
        className: "border-amber-300/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15"
      }
    : displayMissionState === "completed"
      ? {
          tab: "artifacts",
          label: "산출물 검토",
          caption: `${artifactTrace.length}개 산출물 · 비용 $${totalCost.toFixed(2)}`,
          className: "border-emerald-300/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
        }
      : ["blocked", "failed", "cancelled", "escalated"].includes(displayMissionState)
        ? {
            tab: "timeline",
            label: "원인 확인",
            caption: `${displayMissionStateLabel} · 타임라인과 지표를 확인합니다.`,
            className: "border-rose-300/25 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15"
          }
      : displayRuntimeDataMode === "fallback"
        ? {
            tab: "timeline",
            label: "미리보기 추적",
            caption: "라이브 기록 전 로컬 이벤트를 확인합니다.",
            className: "border-cyan-300/25 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/15"
          }
        : {
            tab: "timeline",
            label: "실행 추적",
            caption: `${runtimeHealthLabel} · ${messages.length}개 이벤트`,
            className: "border-blue-300/25 bg-blue-500/10 text-blue-100 hover:bg-blue-500/15"
          };
  const kpiByTab: Record<SideTab, Array<{ label: string; value: string }>> = {
    timeline: [
      { label: "시간", value: `${elapsedSec}s` },
      { label: "성공률", value: `${successRate.toFixed(0)}%` },
      { label: "비용", value: `$${totalCost.toFixed(2)}` },
      { label: "재시도", value: `${totalRetries}` }
    ],
    approvals: [
      { label: "대기", value: currentApproval ? "1건" : "0건" },
      { label: "채널", value: currentApproval ? `${currentApproval.approval_channels.length}` : "0" },
      { label: "알림", value: `${currentApproval?.notifications.length || approvalTimeline.length}` },
      { label: "재전송", value: approvalRetryableNotifications.length > 0 ? `${approvalRetryableNotifications.length}건` : approvalNextAction }
    ],
    artifacts: [
      { label: "시간", value: `${elapsedSec}s` },
      { label: "성공률", value: `${successRate.toFixed(0)}%` },
      { label: "비용", value: `$${totalCost.toFixed(2)}` },
      { label: "재시도", value: `${totalRetries}` }
    ],
    cost: [
      { label: "시간", value: `${elapsedSec}s` },
      { label: "성공률", value: `${successRate.toFixed(0)}%` },
      { label: "비용", value: `$${totalCost.toFixed(2)}` },
      { label: "재시도", value: `${totalRetries}` }
    ],
    metrics: [
      { label: "시간", value: `${elapsedSec}s` },
      { label: "성공률", value: `${successRate.toFixed(0)}%` },
      { label: "비용", value: `$${totalCost.toFixed(2)}` },
      { label: "재시도", value: `${totalRetries}` }
    ]
  };


  return {
    timeline,
    artifactTrace,
    selectedArtifactDetail,
    sortedArtifactHistory,
    artifactDiff,
    costBreakdown,
    totalCost,
    nodeMetrics,
    filteredTimeline,
    operationEventCounts,
    approvalTimeline,
    approvalRetryableNotifications,
    avgConfidence,
    totalRetries,
    elapsedSec,
    runtimeHealth,
    displayOwner,
    displayMissionStateLabel,
    displayRuntimeDataMode,
    displayRuntimeModeLabel,
    runtimeHealthLabel,
    approvalGateOpen,
    nextOperationLabel,
    approvalChannelSummary,
    approvalNextAction,
    primaryRuntimeAction,
    kpiByTab,
    successRate
  };
}
