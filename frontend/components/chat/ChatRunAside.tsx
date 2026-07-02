import type { MissionTimelineEvent, PendingApproval } from "../../lib/api";
import type { ArtifactVersion } from "../../types";
import {
  type ArtifactTraceRow,
  type CostRow,
  type NodeMetricRow,
  type SideTab,
  type TimelineRow
} from "./chat-runtime-model";
import { ChatRunAsideApprovalsPanel } from "./ChatRunAsideApprovalsPanel";
import { ChatRunAsideStatusCard } from "./ChatRunAsideStatusCard";
import { ChatRunAsideTabs } from "./ChatRunAsideTabs";
import { ChatRunAsideTimelinePanel } from "./ChatRunAsideTimelinePanel";
import {
  ChatRunArtifactsPanel,
  ChatRunCostPanel,
  ChatRunMetricsPanel,
  type ArtifactDiff
} from "./ChatRunDataPanels";

type OperationEventCounts = {
  routes: number;
  loops: number;
  approvals: number;
  conditions: number;
  risks: number;
};

type ChatRunAsideProps = {
  sideTab: SideTab;
  setSideTab: (tab: SideTab) => void;
  kpiByTab: Record<SideTab, Array<{ label: string; value: string }>>;
  runtimeHealth: "attention" | "stable" | "running";
  runtimeHealthLabel: string;
  displayMissionStateLabel: string;
  displayRuntimeModeLabel: string;
  displayOwner: string;
  totalCost: number;
  nextOperationLabel: string;
  currentApproval: PendingApproval | null;
  selectedMetricNode: string | null;
  setSelectedMetricNode: (node: string | null | ((prev: string | null) => string | null)) => void;
  selectedArtifact: string | null;
  setSelectedArtifact: (artifact: string | null) => void;
  operationEventCounts: OperationEventCounts;
  filteredTimeline: TimelineRow[];
  approvalNextAction: string;
  approvalGateOpen: boolean;
  isDemoMission: boolean;
  isApproving: boolean;
  handleApprove: () => void;
  approvalRetryableNotifications: PendingApproval["notifications"];
  handleRetryApprovalNotifications: () => void;
  isRetryingApprovalNotifications: boolean;
  approvalChannelSummary: string;
  approvalTimeline: TimelineRow[];
  artifactTrace: ArtifactTraceRow[];
  missionEvaluations: MissionTimelineEvent[];
  selectedArtifactDetail: ArtifactTraceRow;
  sortedArtifactHistory: ArtifactVersion[];
  artifactDiff: ArtifactDiff;
  costBreakdown: CostRow[];
  nodeMetrics: NodeMetricRow[];
  avgConfidence: number;
};

export function ChatRunAside({
  sideTab,
  setSideTab,
  kpiByTab,
  runtimeHealth,
  runtimeHealthLabel,
  displayMissionStateLabel,
  displayRuntimeModeLabel,
  displayOwner,
  totalCost,
  nextOperationLabel,
  currentApproval,
  selectedMetricNode,
  setSelectedMetricNode,
  selectedArtifact,
  setSelectedArtifact,
  operationEventCounts,
  filteredTimeline,
  approvalNextAction,
  approvalGateOpen,
  isDemoMission,
  isApproving,
  handleApprove,
  approvalRetryableNotifications,
  handleRetryApprovalNotifications,
  isRetryingApprovalNotifications,
  approvalChannelSummary,
  approvalTimeline,
  artifactTrace,
  missionEvaluations,
  selectedArtifactDetail,
  sortedArtifactHistory,
  artifactDiff,
  costBreakdown,
  nodeMetrics,
  avgConfidence
}: ChatRunAsideProps) {
  return (
    <aside className="w-full shrink-0 border-t border-white/10 bg-[#0d1117] p-4 lg:w-[360px] lg:border-l lg:border-t-0">
      <ChatRunAsideStatusCard
        runtimeHealth={runtimeHealth}
        runtimeHealthLabel={runtimeHealthLabel}
        displayMissionStateLabel={displayMissionStateLabel}
        displayRuntimeModeLabel={displayRuntimeModeLabel}
        displayOwner={displayOwner}
        totalCost={totalCost}
        nextOperationLabel={nextOperationLabel}
        currentApproval={currentApproval}
      />

      <ChatRunAsideTabs sideTab={sideTab} setSideTab={setSideTab} kpiByTab={kpiByTab} />

      {sideTab === "timeline" && (
        <ChatRunAsideTimelinePanel
          selectedMetricNode={selectedMetricNode}
          setSelectedMetricNode={setSelectedMetricNode}
          selectedArtifact={selectedArtifact}
          setSelectedArtifact={setSelectedArtifact}
          operationEventCounts={operationEventCounts}
          filteredTimeline={filteredTimeline}
        />
      )}

      {sideTab === "approvals" && (
        <ChatRunAsideApprovalsPanel
          approvalNextAction={approvalNextAction}
          approvalGateOpen={approvalGateOpen}
          currentApproval={currentApproval}
          isDemoMission={isDemoMission}
          isApproving={isApproving}
          handleApprove={handleApprove}
          approvalRetryableNotifications={approvalRetryableNotifications}
          handleRetryApprovalNotifications={handleRetryApprovalNotifications}
          isRetryingApprovalNotifications={isRetryingApprovalNotifications}
          approvalChannelSummary={approvalChannelSummary}
          approvalTimeline={approvalTimeline}
        />
      )}

      {sideTab === "artifacts" && (
        <ChatRunArtifactsPanel
          selectedArtifact={selectedArtifact}
          setSelectedArtifact={setSelectedArtifact}
          artifactTrace={artifactTrace}
          missionEvaluations={missionEvaluations}
          selectedArtifactDetail={selectedArtifactDetail}
          sortedArtifactHistory={sortedArtifactHistory}
          artifactDiff={artifactDiff}
        />
      )}

      {sideTab === "cost" && <ChatRunCostPanel costBreakdown={costBreakdown} totalCost={totalCost} />}

      {sideTab === "metrics" && (
        <ChatRunMetricsPanel
          nodeMetrics={nodeMetrics}
          selectedMetricNode={selectedMetricNode}
          setSelectedMetricNode={setSelectedMetricNode}
          avgConfidence={avgConfidence}
        />
      )}
    </aside>
  );
}
