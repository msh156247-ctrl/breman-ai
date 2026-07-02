import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { MissionDetail, PendingApproval } from "../../lib/api";
import type { MissionRunState } from "../../types";
import type { RoomStatus } from "./chat-runtime-model";
import { fetchCurrentPendingApproval } from "./chat-runtime-api";

type UseChatApprovalPollingParams = {
  runId: string;
  isDemoMission: boolean;
  currentApproval: PendingApproval | null;
  missionDetail: MissionDetail | null;
  missionRunState: MissionRunState;
  setCurrentApproval: Dispatch<SetStateAction<PendingApproval | null>>;
  setApprovalSyncError: Dispatch<SetStateAction<string>>;
  setApprovalLastSyncedAt: Dispatch<SetStateAction<Date | null>>;
  setStatus: Dispatch<SetStateAction<RoomStatus>>;
  setRuntimeRefreshNonce: Dispatch<SetStateAction<number>>;
  transitionRuntimeState: (nextState: MissionRunState, source: string) => void;
};

export function useChatApprovalPolling({
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
}: UseChatApprovalPollingParams) {
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
        const nextApproval = await fetchCurrentPendingApproval(runId);
        if (cancelled) return;
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
  }, [
    currentApproval,
    isDemoMission,
    missionDetail?.status,
    missionRunState,
    runId,
    setApprovalLastSyncedAt,
    setApprovalSyncError,
    setCurrentApproval,
    setRuntimeRefreshNonce,
    setStatus,
    transitionRuntimeState
  ]);
}
