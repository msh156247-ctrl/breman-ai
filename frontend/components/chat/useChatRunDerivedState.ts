import { useMemo } from "react";
import type { MissionArtifactsResponse, MissionDetail, MissionTimelineEvent, PendingApproval } from "../../lib/api";
import type { ArtifactVersion, MissionRunRecord, MissionRunState } from "../../types";
import {
  approvalChannelLabel,
  eventDate,
  missionStateLabels,
  retryableApprovalNotifications,
  runtimeModeLabels,
  summarizeArtifactValue,
  type ArtifactTraceRow,
  type ChatRow,
  type CostRow,
  type NodeMetricRow,
  type RoomStatus,
  type RuntimeDataMode,
  type SideTab,
  type TimelineRow
} from "./chat-runtime-model";
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

  const fallbackArtifactTrace: ArtifactTraceRow[] = [
    {
      artifact: "requirements.md",
      from: "planner",
      to: "backend_executor",
      status: "generated",
      version: "v3",
      owner: "planner",
      changes: ["scope refined", "acceptance criteria updated"]
    },
    {
      artifact: "api_spec.json",
      from: "backend_executor",
      to: "qa_reviewer",
      status: "reviewing",
      version: "v5",
      owner: "backend_executor",
      changes: ["new auth endpoint", "rate-limit schema added"]
    },
    {
      artifact: "build_report.txt",
      from: "qa_reviewer",
      to: "deploy_review",
      status: status === "blocked" ? "blocked" : "ready",
      version: "v2",
      owner: "qa_reviewer",
      changes: ["2 flaky tests isolated", "coverage +3.2%"]
    }
  ];
  const taskById = useMemo(
    () => new Map((missionDetail?.tasks || []).map((task) => [task.id, task])),
    [missionDetail]
  );
  const liveArtifactTrace = useMemo<ArtifactTraceRow[]>(() => {
    if (!missionArtifacts) return [];
    return Object.entries(missionArtifacts.artifacts).flatMap(([taskId, outputs]) => {
      const task = taskById.get(taskId);
      return Object.entries(outputs).map(([artifact, value]) => ({
        artifact,
        from: task?.dependencies.length ? task.dependencies.join(", ") : "mission",
        to: task?.role || taskId,
        status: task?.status || "completed",
        version: `v${Math.max(1, (task?.retry_count || 0) + 1)}`,
        owner: task?.role || taskId,
        changes: summarizeArtifactValue(value),
        taskId
      }));
    });
  }, [missionArtifacts, taskById]);
  const mockSnapshotState =
    !isDemoMission || mockRunRecord?.state === "awaiting_approval" ? mockRunRecord?.state || null : null;
  const showSampleData =
    isDemoMission ||
    runtimeDataMode === "demo" ||
    (!missionDetail && runtimeDataMode === "fallback" && Boolean(mockRunRecord));
  const artifactTrace = liveArtifactTrace.length > 0 ? liveArtifactTrace : showSampleData ? fallbackArtifactTrace : [];
  const selectedArtifactDetail =
    artifactTrace.find((a) => a.artifact === selectedArtifact) ||
    artifactTrace[0] || {
      artifact: "아직 생성된 산출물 없음",
      from: "runtime",
      to: "workspace",
      status: "pending",
      version: "-",
      owner: "runtime",
      changes: ["라이브 실행이 산출물을 만들면 이곳에 버전 이력이 표시됩니다."]
    };
  const selectedArtifactHistory = useMemo(() => {
    const stored = artifactVersions.filter((row) => row.artifact_id === selectedArtifactDetail.artifact);
    if (stored.length > 0 || !selectedArtifactDetail.taskId) return stored;
    return [
      {
        artifact_id: selectedArtifactDetail.artifact,
        version: selectedArtifactDetail.version,
        changed_by: selectedArtifactDetail.owner,
        summary: selectedArtifactDetail.changes.join(", "),
        timestamp: selectedArtifactDetail.status
      }
    ];
  }, [artifactVersions, selectedArtifactDetail]);
  const sortedArtifactHistory = useMemo(() => {
    const parseVersion = (v: string) => Number(String(v).replace(/[^0-9]/g, "")) || 0;
    return [...selectedArtifactHistory].sort((a, b) => parseVersion(a.version) - parseVersion(b.version));
  }, [selectedArtifactHistory]);
  const artifactDiff = useMemo(() => {
    const latest = sortedArtifactHistory[sortedArtifactHistory.length - 1];
    const prev = sortedArtifactHistory[sortedArtifactHistory.length - 2];
    if (!latest || !prev) return { from: prev?.version || "-", to: latest?.version || "-", added: [] as string[], removed: [] as string[] };
    const tokenize = (summary: string) =>
      summary
        .split(/,|및|\/|->|→/g)
        .map((t) => t.trim())
        .filter(Boolean);
    const prevTokens = tokenize(prev.summary);
    const latestTokens = tokenize(latest.summary);
    return {
      from: prev.version,
      to: latest.version,
      added: latestTokens.filter((token) => !prevTokens.includes(token)),
      removed: prevTokens.filter((token) => !latestTokens.includes(token))
    };
  }, [sortedArtifactHistory]);

  const fallbackCostBreakdown: CostRow[] = [
    { provider: "Claude Opus", share: 62, cost: 18.42 },
    { provider: "GPT-4o", share: 21, cost: 6.23 },
    { provider: "Human Approval", share: 8, cost: 2.38 },
    { provider: "Others", share: 9, cost: 2.67 }
  ];
  const mockCostBreakdown: CostRow[] = mockRunRecord
    ? [{ provider: "Mock run estimate", share: 100, cost: mockRunRecord.est_cost_usd }]
    : [];
  const liveCostTotal = missionDetail
    ? Math.max(missionDetail.total_cost, missionDetail.tasks.reduce((acc, task) => acc + task.cost, 0))
    : 0;
  const liveCostBreakdown: CostRow[] = missionDetail
    ? missionDetail.tasks
        .filter((task) => task.cost > 0)
        .map((task) => ({
          provider: task.role,
          share: liveCostTotal > 0 ? (task.cost / liveCostTotal) * 100 : 0,
          cost: task.cost
        }))
    : [];
  const costBreakdown =
    liveCostBreakdown.length > 0
      ? liveCostBreakdown
      : missionDetail
        ? [{ provider: "No spend yet", share: 100, cost: 0 }]
        : mockCostBreakdown.length > 0
          ? mockCostBreakdown
        : showSampleData
          ? fallbackCostBreakdown
          : [{ provider: "아직 집계된 비용 없음", share: 100, cost: 0 }];
  const totalCost = missionDetail
    ? liveCostTotal
    : mockRunRecord
      ? mockRunRecord.est_cost_usd
    : showSampleData
      ? fallbackCostBreakdown.reduce((acc, row) => acc + row.cost, 0)
      : 0;
  const fallbackNodeMetrics: NodeMetricRow[] = [
    { node: "Planner", cost: 0.0184, confidence: 0.92, retries: 0, state: "completed" },
    { node: "Backend Executor", cost: 0.0642, confidence: 0.88, retries: 1, state: "running" },
    { node: "QA Reviewer", cost: 0.0311, confidence: 0.91, retries: 0, state: "pending" },
    { node: "HITL Approver", cost: 0, confidence: 1, retries: 0, state: "waiting_input" }
  ];
  const nodeMetrics: NodeMetricRow[] = missionDetail?.tasks.length
    ? missionDetail.tasks.map((task) => ({
        node: `${task.role} · ${task.id}`,
        cost: task.cost,
        confidence: task.confidence,
        retries: task.retry_count,
        state: task.status
      }))
    : showSampleData
      ? fallbackNodeMetrics
      : [];
  const nodeRoleHints = nodeMetrics.reduce<Record<string, string[]>>((acc, metric) => {
    acc[metric.node] = metric.node
      .toLowerCase()
      .split(/[^a-z0-9_]+/g)
      .filter(Boolean);
    return acc;
  }, {});
  const filteredTimeline =
    timeline.filter((t) => {
      const nodeOk =
        !selectedMetricNode ||
        !nodeRoleHints[selectedMetricNode] ||
        nodeRoleHints[selectedMetricNode].some((hint) =>
          `${t.event} ${t.detail || ""} ${t.role || ""} ${t.taskId || ""}`.toLowerCase().includes(hint.toLowerCase())
        );
      const artifactOk =
        !selectedArtifact ||
        `${t.event} ${t.detail || ""}`.toLowerCase().includes(selectedArtifact.toLowerCase().split(".")[0]);
      return nodeOk && artifactOk;
    });
  const operationEventCounts = timeline.reduce(
    (acc, row) => {
      if (row.kind === "route") acc.routes += 1;
      if (row.kind === "loop") acc.loops += 1;
      if (row.kind === "approval") acc.approvals += 1;
      if (row.kind === "condition") acc.conditions += 1;
      if (row.tone === "danger") acc.risks += 1;
      return acc;
    },
    { routes: 0, loops: 0, approvals: 0, conditions: 0, risks: 0 }
  );
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
