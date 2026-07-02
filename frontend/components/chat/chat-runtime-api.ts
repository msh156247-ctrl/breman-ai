import {
  fetchMissionArtifacts,
  fetchMissionDetail,
  fetchMissionEvaluations,
  fetchMissionTimeline,
  fetchPendingApprovals,
  type MissionArtifactsResponse,
  type MissionDetail,
  type MissionTimelineEvent,
  type PendingApproval
} from "../../lib/api";

export type RuntimeSnapshot = {
  detail: MissionDetail;
  timelineEvents: MissionTimelineEvent[];
  artifacts: MissionArtifactsResponse;
  evaluations: MissionTimelineEvent[];
};

type RuntimeSnapshotOptions = {
  attempts?: number;
  retryDelayMs?: number;
};

export async function fetchRuntimeSnapshot(
  runId: string,
  { attempts = 2, retryDelayMs = 450 }: RuntimeSnapshotOptions = {}
): Promise<RuntimeSnapshot> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const [detail, timeline, artifacts, evaluations] = await Promise.all([
        fetchMissionDetail(runId),
        fetchMissionTimeline(runId),
        fetchMissionArtifacts(runId),
        fetchMissionEvaluations(runId)
      ]);
      return {
        detail,
        timelineEvents: timeline.events,
        artifacts,
        evaluations: evaluations.evaluations
      };
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("failed_to_load_runtime_snapshot");
}

export async function fetchCurrentPendingApproval(runId: string): Promise<PendingApproval | null> {
  const approvals = await fetchPendingApprovals();
  return approvals.approvals.find((approval) => approval.mission_id === runId) || null;
}
