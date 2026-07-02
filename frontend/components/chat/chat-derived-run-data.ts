import type { MissionArtifactsResponse, MissionDetail } from "../../lib/api";
import type { ArtifactVersion, MissionRunRecord } from "../../types";
import {
  summarizeArtifactValue,
  type ArtifactTraceRow,
  type CostRow,
  type NodeMetricRow,
  type RoomStatus,
  type RuntimeDataMode,
  type TimelineRow
} from "./chat-runtime-model";

export type ArtifactDiff = {
  from: string;
  to: string;
  added: string[];
  removed: string[];
};

export function fallbackArtifactTrace(status: RoomStatus): ArtifactTraceRow[] {
  return [
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
}

export function shouldShowSampleData({
  isDemoMission,
  runtimeDataMode,
  missionDetail,
  mockRunRecord
}: {
  isDemoMission: boolean;
  runtimeDataMode: RuntimeDataMode;
  missionDetail: MissionDetail | null;
  mockRunRecord: MissionRunRecord | null;
}): boolean {
  return (
    isDemoMission ||
    runtimeDataMode === "demo" ||
    (!missionDetail && runtimeDataMode === "fallback" && Boolean(mockRunRecord))
  );
}

export function buildLiveArtifactTrace(
  missionArtifacts: MissionArtifactsResponse | null,
  missionDetail: MissionDetail | null
): ArtifactTraceRow[] {
  if (!missionArtifacts) return [];
  const taskById = new Map((missionDetail?.tasks || []).map((task) => [task.id, task]));
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
}

export function selectArtifactDetail(
  artifactTrace: ArtifactTraceRow[],
  selectedArtifact: string | null
): ArtifactTraceRow {
  return (
    artifactTrace.find((artifact) => artifact.artifact === selectedArtifact) ||
    artifactTrace[0] || {
      artifact: "아직 생성된 산출물 없음",
      from: "runtime",
      to: "workspace",
      status: "pending",
      version: "-",
      owner: "runtime",
      changes: ["라이브 실행이 산출물을 만들면 이곳에 버전 이력이 표시됩니다."]
    }
  );
}

export function buildSelectedArtifactHistory(
  artifactVersions: ArtifactVersion[],
  selectedArtifactDetail: ArtifactTraceRow
): ArtifactVersion[] {
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
}

export function sortArtifactHistory(history: ArtifactVersion[]): ArtifactVersion[] {
  const parseVersion = (value: string) => Number(String(value).replace(/[^0-9]/g, "")) || 0;
  return [...history].sort((a, b) => parseVersion(a.version) - parseVersion(b.version));
}

export function buildArtifactDiff(sortedArtifactHistory: ArtifactVersion[]): ArtifactDiff {
  const latest = sortedArtifactHistory[sortedArtifactHistory.length - 1];
  const prev = sortedArtifactHistory[sortedArtifactHistory.length - 2];
  if (!latest || !prev) {
    return { from: prev?.version || "-", to: latest?.version || "-", added: [], removed: [] };
  }
  const tokenize = (summary: string) =>
    summary
      .split(/,|및|\/|->|→/g)
      .map((token) => token.trim())
      .filter(Boolean);
  const prevTokens = tokenize(prev.summary);
  const latestTokens = tokenize(latest.summary);
  return {
    from: prev.version,
    to: latest.version,
    added: latestTokens.filter((token) => !prevTokens.includes(token)),
    removed: prevTokens.filter((token) => !latestTokens.includes(token))
  };
}

export const fallbackCostBreakdown: CostRow[] = [
  { provider: "Claude Opus", share: 62, cost: 18.42 },
  { provider: "GPT-4o", share: 21, cost: 6.23 },
  { provider: "Human Approval", share: 8, cost: 2.38 },
  { provider: "Others", share: 9, cost: 2.67 }
];

export const fallbackNodeMetrics: NodeMetricRow[] = [
  { node: "Planner", cost: 0.0184, confidence: 0.92, retries: 0, state: "completed" },
  { node: "Backend Executor", cost: 0.0642, confidence: 0.88, retries: 1, state: "running" },
  { node: "QA Reviewer", cost: 0.0311, confidence: 0.91, retries: 0, state: "pending" },
  { node: "HITL Approver", cost: 0, confidence: 1, retries: 0, state: "waiting_input" }
];

export function liveCostTotal(missionDetail: MissionDetail | null): number {
  return missionDetail
    ? Math.max(missionDetail.total_cost, missionDetail.tasks.reduce((acc, task) => acc + task.cost, 0))
    : 0;
}

export function buildCostBreakdown({
  missionDetail,
  mockRunRecord,
  showSampleData
}: {
  missionDetail: MissionDetail | null;
  mockRunRecord: MissionRunRecord | null;
  showSampleData: boolean;
}): { costBreakdown: CostRow[]; totalCost: number } {
  const total = liveCostTotal(missionDetail);
  const liveCostBreakdown: CostRow[] = missionDetail
    ? missionDetail.tasks
        .filter((task) => task.cost > 0)
        .map((task) => ({
          provider: task.role,
          share: total > 0 ? (task.cost / total) * 100 : 0,
          cost: task.cost
        }))
    : [];
  const mockCostBreakdown: CostRow[] = mockRunRecord
    ? [{ provider: "Mock run estimate", share: 100, cost: mockRunRecord.est_cost_usd }]
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
    ? total
    : mockRunRecord
      ? mockRunRecord.est_cost_usd
      : showSampleData
        ? fallbackCostBreakdown.reduce((acc, row) => acc + row.cost, 0)
        : 0;
  return { costBreakdown, totalCost };
}

export function buildNodeMetrics({
  missionDetail,
  showSampleData
}: {
  missionDetail: MissionDetail | null;
  showSampleData: boolean;
}): NodeMetricRow[] {
  return missionDetail?.tasks.length
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
}

export function filterTimelineBySelection({
  timeline,
  nodeMetrics,
  selectedMetricNode,
  selectedArtifact
}: {
  timeline: TimelineRow[];
  nodeMetrics: NodeMetricRow[];
  selectedMetricNode: string | null;
  selectedArtifact: string | null;
}): TimelineRow[] {
  const nodeRoleHints = nodeMetrics.reduce<Record<string, string[]>>((acc, metric) => {
    acc[metric.node] = metric.node
      .toLowerCase()
      .split(/[^a-z0-9_]+/g)
      .filter(Boolean);
    return acc;
  }, {});
  return timeline.filter((row) => {
    const nodeOk =
      !selectedMetricNode ||
      !nodeRoleHints[selectedMetricNode] ||
      nodeRoleHints[selectedMetricNode].some((hint) =>
        `${row.event} ${row.detail || ""} ${row.role || ""} ${row.taskId || ""}`.toLowerCase().includes(hint.toLowerCase())
      );
    const artifactOk =
      !selectedArtifact ||
      `${row.event} ${row.detail || ""}`.toLowerCase().includes(selectedArtifact.toLowerCase().split(".")[0]);
    return nodeOk && artifactOk;
  });
}

export function countOperationEvents(timeline: TimelineRow[]) {
  return timeline.reduce(
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
}
