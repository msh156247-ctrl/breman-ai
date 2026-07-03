import type { RefObject } from "react";
import type { PendingApproval } from "../../lib/api";
import { ChatRunApprovalGateCard } from "./ChatRunApprovalGateCard";
import { ChatRunCurrentActionCard } from "./ChatRunCurrentActionCard";
import { ChatRunEventStream } from "./ChatRunEventStream";
import type { OperationEventCounts, PrimaryRuntimeAction } from "./chat-main-panel-model";
import type { ChatRow, RoomStatus, RuntimeDataMode, SideTab } from "./chat-runtime-model";

type ChatRunMainPanelProps = {
  runtimeLoadError: string | null;
  primaryRuntimeAction: PrimaryRuntimeAction;
  setSideTab: (tab: SideTab) => void;
  approvalGateOpen: boolean;
  status: RoomStatus;
  currentApproval: PendingApproval | null;
  isDemoMission: boolean;
  approvalLastSyncedAt: Date | null;
  approvalRetryableNotifications: PendingApproval["notifications"];
  isRetryingApprovalNotifications: boolean;
  handleRetryApprovalNotifications: () => void;
  handleApprove: () => void;
  isApproving: boolean;
  approvalSyncError: string;
  messages: ChatRow[];
  operationEventCounts: OperationEventCounts;
  runtimeHealthLabel: string;
  displayRuntimeModeLabel: string;
  displayRuntimeDataMode: RuntimeDataMode;
  bottomRef: RefObject<HTMLDivElement>;
};

export function ChatRunMainPanel({
  runtimeLoadError,
  primaryRuntimeAction,
  setSideTab,
  approvalGateOpen,
  status,
  currentApproval,
  isDemoMission,
  approvalLastSyncedAt,
  approvalRetryableNotifications,
  isRetryingApprovalNotifications,
  handleRetryApprovalNotifications,
  handleApprove,
  isApproving,
  approvalSyncError,
  messages,
  operationEventCounts,
  runtimeHealthLabel,
  displayRuntimeModeLabel,
  displayRuntimeDataMode,
  bottomRef
}: ChatRunMainPanelProps) {
  return (
    <div className="min-h-[360px] min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
      {runtimeLoadError && (
        <div className="rounded-lg border border-yellow-500/25 bg-yellow-500/[0.08] px-3 py-2 text-xs text-yellow-100">
          라이브 실행 기록이 아직 없어 로컬 미리보기 스트림을 표시합니다.
        </div>
      )}
      <ChatRunCurrentActionCard
        primaryRuntimeAction={primaryRuntimeAction}
        setSideTab={setSideTab}
        approvalGateOpen={approvalGateOpen}
        status={status}
      />
      {approvalGateOpen && (
        <ChatRunApprovalGateCard
          currentApproval={currentApproval}
          isDemoMission={isDemoMission}
          approvalLastSyncedAt={approvalLastSyncedAt}
          approvalRetryableNotifications={approvalRetryableNotifications}
          isRetryingApprovalNotifications={isRetryingApprovalNotifications}
          handleRetryApprovalNotifications={handleRetryApprovalNotifications}
          handleApprove={handleApprove}
          isApproving={isApproving}
          approvalSyncError={approvalSyncError}
          status={status}
          setSideTab={setSideTab}
        />
      )}
      <ChatRunEventStream
        messages={messages}
        status={status}
        isApproving={isApproving}
        handleApprove={handleApprove}
        operationEventCounts={operationEventCounts}
        runtimeHealthLabel={runtimeHealthLabel}
        displayRuntimeModeLabel={displayRuntimeModeLabel}
        displayRuntimeDataMode={displayRuntimeDataMode}
        bottomRef={bottomRef}
      />
    </div>
  );
}
