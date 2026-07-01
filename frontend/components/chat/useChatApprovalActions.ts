import { useState, type Dispatch, type SetStateAction } from "react";
import {
  approveMissionGate,
  fetchPendingApprovals,
  retryApprovalNotifications,
  type MissionDetail,
  type PendingApproval
} from "../../lib/api";
import type { MissionRunState } from "../../types";
import {
  appendUniqueChatRows,
  type ChatRow,
  type RoomStatus
} from "./chat-runtime-model";

type UseChatApprovalActionsParams = {
  runId: string;
  isDemoMission: boolean;
  setMessages: Dispatch<SetStateAction<ChatRow[]>>;
  setStatus: Dispatch<SetStateAction<RoomStatus>>;
  setRuntimeLoadError: Dispatch<SetStateAction<string | null>>;
  setMissionDetail: Dispatch<SetStateAction<MissionDetail | null>>;
  setCurrentApproval: Dispatch<SetStateAction<PendingApproval | null>>;
  setApprovalSyncError: Dispatch<SetStateAction<string>>;
  setApprovalLastSyncedAt: Dispatch<SetStateAction<Date | null>>;
  setRuntimeRefreshNonce: Dispatch<SetStateAction<number>>;
  transitionRuntimeState: (nextState: MissionRunState, source: string) => void;
};

export function useChatApprovalActions({
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
}: UseChatApprovalActionsParams) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRetryingApprovalNotifications, setIsRetryingApprovalNotifications] = useState(false);

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
    isApproving,
    isRetryingApprovalNotifications,
    handleApprove,
    handleRetryApprovalNotifications
  };
}
