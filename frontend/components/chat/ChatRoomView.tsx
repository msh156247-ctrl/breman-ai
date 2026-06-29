"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Coins,
  Loader2,
  ShieldCheck,
  Timer
} from "lucide-react";
import { ChatRunMainPanel } from "./ChatRunMainPanel";
import { ChatRunAside } from "./ChatRunAside";
import { useChatRunDerivedState } from "./useChatRunDerivedState";
import { useChatRunSession } from "./useChatRunSession";
import { sideTabLabels } from "./chat-runtime-model";

export default function ChatRoomView({ params }: { params: { id: string } }) {
  const {
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
  } = useChatRunSession(params.id);
  const {
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
  } = useChatRunDerivedState({
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
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0A0A0A]">
      <div className="flex min-h-16 flex-col gap-3 border-b border-white/5 px-4 py-3 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:px-6 lg:py-0">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/studio"
            aria-label="스튜디오로 돌아가기"
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="flex items-center font-bold">
              실행 상세
              {status === "running" && <Loader2 className="ml-2 h-4 w-4 animate-spin text-blue-400" />}
            </h1>
            <div className="break-words text-xs text-gray-500">
              Run {params.id} · {displayMissionStateLabel} · {displayRuntimeModeLabel}
            </div>
            {missionDetail?.goal && <div className="max-w-xl truncate text-xs text-gray-400">{missionDetail.goal}</div>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="stat-chip px-2 py-1 text-gray-300">
            <Timer className="mr-1 inline h-3.5 w-3.5 text-blue-300" />
            ETA <span className="font-semibold text-blue-200">{elapsedSec}s</span>
          </div>
          <div className="stat-chip px-2 py-1 text-gray-300">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-emerald-300" />
            Success <span className="font-semibold text-emerald-200">{successRate.toFixed(0)}%</span>
          </div>
          <div className="stat-chip px-2 py-1 text-gray-300">
            <Coins className="mr-1 inline h-3.5 w-3.5 text-yellow-300" />
            Cost <span className="font-semibold text-yellow-200">${totalCost.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <ChatRunMainPanel
          runtimeLoadError={runtimeLoadError}
          primaryRuntimeAction={primaryRuntimeAction}
          setSideTab={setSideTab}
          approvalGateOpen={approvalGateOpen}
          status={status}
          currentApproval={currentApproval}
          isDemoMission={isDemoMission}
          approvalLastSyncedAt={approvalLastSyncedAt}
          approvalRetryableNotifications={approvalRetryableNotifications}
          isRetryingApprovalNotifications={isRetryingApprovalNotifications}
          handleRetryApprovalNotifications={handleRetryApprovalNotifications}
          handleApprove={handleApprove}
          isApproving={isApproving}
          approvalSyncError={approvalSyncError}
          messages={messages}
          operationEventCounts={operationEventCounts}
          runtimeHealthLabel={runtimeHealthLabel}
          displayRuntimeModeLabel={displayRuntimeModeLabel}
          displayRuntimeDataMode={displayRuntimeDataMode}
          bottomRef={bottomRef}
        />

        <ChatRunAside
          sideTab={sideTab}
          setSideTab={setSideTab}
          kpiByTab={kpiByTab}
          runtimeHealth={runtimeHealth}
          runtimeHealthLabel={runtimeHealthLabel}
          displayMissionStateLabel={displayMissionStateLabel}
          displayRuntimeModeLabel={displayRuntimeModeLabel}
          displayOwner={displayOwner}
          totalCost={totalCost}
          nextOperationLabel={nextOperationLabel}
          currentApproval={currentApproval}
          selectedMetricNode={selectedMetricNode}
          setSelectedMetricNode={setSelectedMetricNode}
          selectedArtifact={selectedArtifact}
          setSelectedArtifact={setSelectedArtifact}
          operationEventCounts={operationEventCounts}
          filteredTimeline={filteredTimeline}
          approvalNextAction={approvalNextAction}
          approvalGateOpen={approvalGateOpen}
          isDemoMission={isDemoMission}
          isApproving={isApproving}
          handleApprove={handleApprove}
          approvalRetryableNotifications={approvalRetryableNotifications}
          handleRetryApprovalNotifications={handleRetryApprovalNotifications}
          isRetryingApprovalNotifications={isRetryingApprovalNotifications}
          approvalChannelSummary={approvalChannelSummary}
          approvalTimeline={approvalTimeline}
          artifactTrace={artifactTrace}
          missionEvaluations={missionEvaluations}
          selectedArtifactDetail={selectedArtifactDetail}
          sortedArtifactHistory={sortedArtifactHistory}
          artifactDiff={artifactDiff}
          costBreakdown={costBreakdown}
          nodeMetrics={nodeMetrics}
          avgConfidence={avgConfidence}
        />
      </div>

      <div className="border-t border-white/5 px-6 py-3 text-xs text-gray-600">
        현재 {sideTabLabels[sideTab]} 보기 · 이벤트 {messages.length}건 · {displayRuntimeModeLabel}
      </div>
    </div>
  );
}
