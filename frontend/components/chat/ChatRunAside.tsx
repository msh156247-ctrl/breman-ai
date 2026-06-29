import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import type { MissionTimelineEvent, PendingApproval } from "../../lib/api";
import type { ArtifactVersion } from "../../types";
import {
  approvalChannelLabel,
  approvalDeliveryLabel,
  approvalDeliveryToneClass,
  eventMessage,
  formatApprovalTime,
  sideTabLabels,
  timelineIcon,
  timelineKindLabel,
  timelineToneClass,
  type ArtifactTraceRow,
  type CostRow,
  type NodeMetricRow,
  type SideTab,
  type TimelineRow
} from "./chat-runtime-model";

type OperationEventCounts = {
  routes: number;
  loops: number;
  approvals: number;
  conditions: number;
  risks: number;
};

type ArtifactDiff = {
  from: string;
  to: string;
  added: string[];
  removed: string[];
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
  <div className="panel-shell mb-3 bg-black/30 px-3 py-2 text-xs text-gray-300">
    <div className="mb-1 flex items-center justify-between">
      <span className="flex items-center gap-1 text-cyan-300">
        <Activity className="h-3.5 w-3.5" />
        운영 상태
      </span>
      <span className={runtimeHealth === "attention" ? "text-yellow-300" : "text-emerald-300"}>{runtimeHealthLabel}</span>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2">
        <div className="text-[10px] text-gray-500">실행 상태</div>
        <div className="mt-1 font-semibold text-gray-100">{displayMissionStateLabel}</div>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2">
        <div className="text-[10px] text-gray-500">데이터 출처</div>
        <div className="mt-1 font-semibold text-gray-100">{displayRuntimeModeLabel}</div>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2">
        <div className="text-[10px] text-gray-500">소유자</div>
        <div className="mt-1 truncate font-semibold text-gray-100">{displayOwner || "unknown"}</div>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2">
        <div className="text-[10px] text-gray-500">비용</div>
        <div className="mt-1 font-semibold text-gray-100">${totalCost.toFixed(2)}</div>
      </div>
    </div>
    <div className="mt-3 rounded-lg border border-cyan-500/15 bg-cyan-500/[0.06] px-2 py-2 text-[11px] leading-relaxed text-cyan-100">
      {nextOperationLabel}
    </div>
    {currentApproval && (
      <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/[0.08] px-2 py-2 text-[11px] leading-relaxed text-amber-100">
        승인 대기: {currentApproval.task_id || "task"} ·{" "}
        {currentApproval.approval_channels.map(approvalChannelLabel).join(", ") || "관리자 대기열"}
      </div>
    )}
  </div>

  <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
    {([
      ["timeline", "타임라인"],
      ["approvals", "승인"],
      ["artifacts", "산출물"],
      ["cost", "비용"],
      ["metrics", "지표"]
    ] as const).map(([key, label]) => (
      <button
        key={key}
        onClick={() => setSideTab(key)}
        className={`min-h-9 rounded-xl px-3 py-2 font-semibold ${sideTab === key ? "bg-blue-600 text-white" : "bg-white/5 text-gray-400 hover:text-gray-200"}`}
      >
        {label}
      </button>
    ))}
  </div>
  <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
    {kpiByTab[sideTab].map((kpi) => (
      <div key={kpi.label} className="stat-chip bg-black/30 px-2 py-1.5">
        <div className="text-gray-500">{kpi.label}</div>
        <div className="mt-0.5 font-semibold text-gray-200">{kpi.value}</div>
      </div>
    ))}
  </div>

  {sideTab === "timeline" && (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-cyan-300">실행 타임라인</h3>
        {(selectedMetricNode || selectedArtifact) && (
          <button
            onClick={() => {
              setSelectedMetricNode(null);
              setSelectedArtifact(null);
            }}
            className="text-[11px] text-gray-400 hover:text-gray-200"
          >
            필터 해제
          </button>
        )}
      </div>
      <div className="mb-2 grid grid-cols-4 gap-1 text-[10px]">
        <div className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-1 text-cyan-100">
          분기 {operationEventCounts.routes}
        </div>
        <div className="rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-1 text-violet-100">
          반복 {operationEventCounts.loops}
        </div>
        <div className="rounded border border-yellow-500/20 bg-yellow-500/10 px-1.5 py-1 text-yellow-100">
          승인 {operationEventCounts.approvals}
        </div>
        <div className="rounded border border-rose-500/20 bg-rose-500/10 px-1.5 py-1 text-rose-100">
          위험 {operationEventCounts.risks}
        </div>
      </div>
      {(selectedMetricNode || selectedArtifact) && (
        <div className="mb-2 text-[11px] text-gray-500">
          필터: {selectedMetricNode || "전체 노드"} / {selectedArtifact || "전체 산출물"}
        </div>
      )}
      <div className="max-h-[420px] space-y-2 overflow-y-auto text-xs">
        {filteredTimeline.map((t) => (
          <div key={t.id} className={`rounded-xl border px-2.5 py-2 ${timelineToneClass(t.tone)}`}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 opacity-80">{timelineIcon(t.kind)}</span>
                <span className="truncate font-semibold">{t.event}</span>
              </span>
              <span className="shrink-0 text-[10px] opacity-60">{t.ts}</span>
            </div>
            {t.detail && <div className="whitespace-pre-wrap text-[11px] leading-relaxed opacity-75">{t.detail}</div>}
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] opacity-60">
              <span>{timelineKindLabel(t.kind)}</span>
              <span>·</span>
              <span>{t.source}</span>
              {t.taskId && (
                <>
                  <span>·</span>
                  <span>{t.taskId}</span>
                </>
              )}
            </div>
          </div>
        ))}
        {filteredTimeline.length === 0 && (
          <div className="log-row px-2 py-1 text-gray-500">선택한 기준의 실행 이벤트가 없습니다.</div>
        )}
      </div>
    </div>
  )}

  {sideTab === "approvals" && (
    <div className="mb-4 space-y-3">
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-3 text-xs text-amber-50">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 font-semibold text-amber-200">
            <ShieldCheck className="h-4 w-4" />
            승인 운영
          </h3>
          <span className="rounded border border-amber-300/20 bg-black/25 px-2 py-1 text-[10px] font-semibold text-amber-100">
            {approvalNextAction}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
            <div className="text-[10px] text-amber-100/50">게이트</div>
            <div className="mt-1 font-semibold text-white">
              {currentApproval?.gate_stage || (approvalGateOpen ? "동기화 중" : "없음")}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
            <div className="text-[10px] text-amber-100/50">채널</div>
            <div className="mt-1 truncate font-semibold text-white">{approvalChannelSummary}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
            <div className="text-[10px] text-amber-100/50">대상</div>
            <div className="mt-1 truncate font-semibold text-white">
              {currentApproval?.approval_target || "운영 관리자"}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
            <div className="text-[10px] text-amber-100/50">요청 시각</div>
            <div className="mt-1 font-semibold text-white">
              {currentApproval ? formatApprovalTime(currentApproval.requested_at) : "-"}
            </div>
          </div>
        </div>
        <div className="mt-3 text-[11px] leading-relaxed text-amber-100/70">
          {currentApproval
            ? currentApproval.runtime_active
              ? "현재 런타임 waiter가 살아 있어 이 화면이나 승인 큐에서 바로 승인할 수 있습니다."
              : "기록에서 복원된 승인 대기입니다. 런타임 재실행 여부를 먼저 확인하세요."
            : approvalGateOpen
              ? "미션 상태는 승인 대기지만 큐 항목을 아직 동기화하지 못했습니다."
              : "열린 Human Gate가 없습니다. 승인 이벤트는 아래 기록으로 확인할 수 있습니다."}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={isApproving || (!currentApproval && !isDemoMission) || Boolean(currentApproval && !currentApproval.can_approve)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {!currentApproval && !isDemoMission
              ? "대기 없음"
              : currentApproval && !currentApproval.can_approve
              ? "재실행 필요"
              : isApproving
                ? "승인 중"
                : "승인하고 계속"}
          </button>
          {approvalRetryableNotifications.length > 0 ? (
            <button
              type="button"
              onClick={handleRetryApprovalNotifications}
              disabled={isRetryingApprovalNotifications}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300/20 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRetryingApprovalNotifications ? "animate-spin" : ""}`} />
              {isRetryingApprovalNotifications ? "재전송 중" : "알림 재전송"}
            </button>
          ) : null}
          <Link
            href="/runs"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
          >
            승인 큐 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/mypage?tab=approval"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
          >
            채널 설정
          </Link>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-cyan-300">알림 채널 상태</h3>
          <span className="text-[11px] text-gray-500">
            {currentApproval?.notifications.length || 0} notifications
          </span>
        </div>
        {approvalRetryableNotifications.length > 0 ? (
          <div className="mb-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-[11px] leading-5 text-violet-100/85">
            {approvalRetryableNotifications.map((notification) => approvalChannelLabel(notification.channel)).join(", ")} 알림은
            재전송할 수 있습니다.
          </div>
        ) : null}
        <div className="space-y-2 text-xs">
          {currentApproval?.notifications.length ? (
            currentApproval.notifications.map((notification) => (
              <div
                key={notification.id || `${notification.channel}-${notification.updated_at}`}
                className={`rounded-xl border px-3 py-2 ${approvalDeliveryToneClass(notification.delivery_status)}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{approvalChannelLabel(notification.channel)}</span>
                  <span className="rounded bg-black/25 px-1.5 py-0.5 text-[10px]">
                    {approvalDeliveryLabel(notification.delivery_status)}
                  </span>
                </div>
                <div className="mt-1 truncate opacity-70">target: {notification.target || "운영 관리자"}</div>
                <div className="mt-1 text-[11px] opacity-65">
                  transport {notification.delivery_transport || "internal_queue"} · status {notification.status}
                </div>
                {notification.delivery_error && (
                  <div className="mt-1 text-[11px] text-rose-100/90">{notification.delivery_error}</div>
                )}
              </div>
            ))
          ) : currentApproval ? (
            currentApproval.approval_channels.map((channel) => (
              <div key={channel} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-gray-300">
                <div className="font-semibold text-gray-100">{approvalChannelLabel(channel)}</div>
                <div className="mt-1 text-[11px] text-gray-500">알림 생성 대기 중</div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-gray-500">
              현재 대기 중인 알림 채널이 없습니다.
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-amber-300">승인 이벤트</h3>
          <span className="text-[11px] text-gray-500">{approvalTimeline.length} events</span>
        </div>
        <div className="max-h-[260px] space-y-2 overflow-y-auto text-xs">
          {approvalTimeline.map((event) => (
            <div key={event.id} className={`rounded-xl border px-2.5 py-2 ${timelineToneClass(event.tone)}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{event.event}</span>
                <span className="shrink-0 text-[10px] opacity-60">{event.ts}</span>
              </div>
              {event.detail && <div className="whitespace-pre-wrap text-[11px] leading-relaxed opacity-75">{event.detail}</div>}
            </div>
          ))}
          {approvalTimeline.length === 0 && (
            <div className="log-row px-2 py-2 text-gray-500">아직 승인 이벤트가 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  )}

  {sideTab === "artifacts" && (
    <div>
    <div className="mb-2 flex items-center justify-between">
      <h3 className="font-semibold text-green-300">산출물 흐름</h3>
      {selectedArtifact && (
        <button onClick={() => setSelectedArtifact(null)} className="text-[11px] text-gray-400 hover:text-gray-200">
          선택 해제
        </button>
      )}
    </div>
    <div className="space-y-2 text-xs">
      {artifactTrace.map((a, idx) => (
        <button
          key={`${a.artifact}-${idx}`}
          onClick={() => setSelectedArtifact(a.artifact)}
          className={`w-full rounded px-2 py-2 text-left ${
            selectedArtifact === a.artifact ? "bg-green-900/20 ring-1 ring-green-400/50" : "bg-black/30"
          }`}
        >
          <div className="font-medium text-gray-200">{a.artifact}</div>
          <div className="mt-0.5 text-gray-500">
            {a.from} → {a.to}
          </div>
          <div className="mt-1 text-[11px] text-cyan-300">status: {a.status}</div>
        </button>
      ))}
      {artifactTrace.length === 0 && (
        <div className="log-row px-2 py-2 text-gray-500">아직 생성된 산출물이 없습니다.</div>
      )}
    </div>
    {missionEvaluations.length > 0 && (
      <div className="mt-4">
        <h3 className="mb-2 font-semibold text-indigo-300">품질 게이트</h3>
        <div className="space-y-2 text-xs">
          {missionEvaluations.slice(-5).map((event, idx) => {
            const score = typeof event.score === "number" ? event.score : 0;
            const qualityPass = Boolean(event.quality_pass);
            return (
              <div key={`${event.task_id || "eval"}-${idx}`} className="log-row px-2 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-200">{String(event.role || event.task_id || "worker")}</span>
                  <span className={qualityPass ? "text-emerald-300" : "text-yellow-300"}>
                    {qualityPass ? "pass" : "review"} · {(score * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1 text-gray-500">{eventMessage(event)}</div>
              </div>
            );
          })}
        </div>
      </div>
    )}
  </div>
  )}

  {sideTab === "artifacts" && (
    <div className="mt-4">
    <h3 className="mb-2 font-semibold text-emerald-300">산출물 상세</h3>
    <div className="log-row px-2 py-2 text-xs">
      <div className="font-medium text-gray-200">{selectedArtifactDetail.artifact}</div>
      <div className="mt-1 text-gray-400">version: {selectedArtifactDetail.version}</div>
      <div className="text-gray-400">owner: {selectedArtifactDetail.owner}</div>
      <div className="mt-2 text-gray-300">변경 요약:</div>
      <ul className="mt-1 list-disc pl-4 text-gray-400">
        {selectedArtifactDetail.changes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="mt-2 text-gray-300">버전 이력:</div>
      <ul className="mt-1 list-disc pl-4 text-gray-400">
        {sortedArtifactHistory.map((v) => (
          <li key={`${v.artifact_id}-${v.version}-${v.timestamp}`}>
            {v.version} ({v.timestamp}) · by {v.changed_by} · {v.summary}
          </li>
        ))}
        {sortedArtifactHistory.length === 0 && <li>버전 이력이 없습니다.</li>}
      </ul>
      {sortedArtifactHistory.length >= 2 && (
        <div className="mt-2 rounded border border-white/10 bg-black/30 px-2 py-2">
          <div className="text-gray-300">
            diff {artifactDiff.from} → {artifactDiff.to}
          </div>
          <div className="mt-1 space-y-1">
            {artifactDiff.added.map((line) => (
              <div key={`add-${line}`} className="text-emerald-300">+ {line}</div>
            ))}
            {artifactDiff.removed.map((line) => (
              <div key={`del-${line}`} className="text-rose-300">- {line}</div>
            ))}
            {artifactDiff.added.length === 0 && artifactDiff.removed.length === 0 && (
              <div className="text-gray-500">변경 요약 diff가 없습니다.</div>
            )}
          </div>
        </div>
      )}
    </div>
  </div>
  )}

  {sideTab === "cost" && (
    <div className="mt-4">
    <h3 className="mb-2 font-semibold text-yellow-300">비용 구성</h3>
    <div className="space-y-2 text-xs">
      {costBreakdown.map((c) => (
        <div key={c.provider} className="log-row px-2 py-2">
          <div className="mb-1 flex items-center justify-between text-gray-200">
            <span>{c.provider}</span>
            <span>${c.cost.toFixed(2)}</span>
          </div>
          <div className="h-1.5 rounded bg-white/10">
            <div className="h-full rounded bg-yellow-400" style={{ width: `${c.share}%` }} />
          </div>
          <div className="mt-1 text-right text-gray-500">{c.share}%</div>
        </div>
      ))}
      <div className="rounded border border-yellow-500/20 bg-yellow-900/10 px-2 py-1.5 text-right text-yellow-200">
        합계: ${totalCost.toFixed(2)}
      </div>
    </div>
  </div>
  )}

  {sideTab === "metrics" && (
    <div className="mt-4">
    <h3 className="mb-2 font-semibold text-purple-300">노드 지표</h3>
    <div className="space-y-2 text-xs">
      {nodeMetrics.map((m) => (
        <button
          key={m.node}
          onClick={() => setSelectedMetricNode((prev) => (prev === m.node ? null : m.node))}
          className={`w-full rounded px-2 py-2 text-left ${
            selectedMetricNode === m.node ? "bg-purple-900/30 ring-1 ring-purple-400/60" : "bg-black/30"
          }`}
        >
          <div className="font-medium text-gray-200">{m.node}</div>
          <div className="mt-1 grid grid-cols-3 gap-2 text-gray-400">
            <span>비용 ${m.cost.toFixed(4)}</span>
            <span>신뢰 {(m.confidence * 100).toFixed(0)}%</span>
            <span>재시도 {m.retries}</span>
          </div>
          <div className="mt-1 text-[11px] text-gray-500">
            상태: {m.state} · 평균 신뢰 {(avgConfidence * 100).toFixed(0)}%
          </div>
        </button>
      ))}
      {nodeMetrics.length === 0 && (
        <div className="log-row px-2 py-2 text-gray-500">라이브 노드 지표가 아직 없습니다.</div>
      )}
    </div>
  </div>
  )}
</aside>
  );
}
