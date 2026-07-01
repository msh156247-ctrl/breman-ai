import type { Dispatch, SetStateAction } from "react";
import type { MissionTimelineEvent } from "../../lib/api";
import type { ArtifactVersion } from "../../types";
import {
  eventMessage,
  type ArtifactTraceRow,
  type CostRow,
  type NodeMetricRow
} from "./chat-runtime-model";

export type ArtifactDiff = {
  from: string;
  to: string;
  added: string[];
  removed: string[];
};

type ChatRunArtifactsPanelProps = {
  selectedArtifact: string | null;
  setSelectedArtifact: (artifact: string | null) => void;
  artifactTrace: ArtifactTraceRow[];
  missionEvaluations: MissionTimelineEvent[];
  selectedArtifactDetail: ArtifactTraceRow;
  sortedArtifactHistory: ArtifactVersion[];
  artifactDiff: ArtifactDiff;
};

export function ChatRunArtifactsPanel({
  selectedArtifact,
  setSelectedArtifact,
  artifactTrace,
  missionEvaluations,
  selectedArtifactDetail,
  sortedArtifactHistory,
  artifactDiff
}: ChatRunArtifactsPanelProps) {
  return (
    <>
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
          {artifactTrace.map((artifact, idx) => (
            <button
              key={`${artifact.artifact}-${idx}`}
              onClick={() => setSelectedArtifact(artifact.artifact)}
              className={`w-full rounded px-2 py-2 text-left ${
                selectedArtifact === artifact.artifact ? "bg-green-900/20 ring-1 ring-green-400/50" : "bg-black/30"
              }`}
            >
              <div className="font-medium text-gray-200">{artifact.artifact}</div>
              <div className="mt-0.5 text-gray-500">
                {artifact.from} → {artifact.to}
              </div>
              <div className="mt-1 text-[11px] text-cyan-300">status: {artifact.status}</div>
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

      <div className="mt-4">
        <h3 className="mb-2 font-semibold text-emerald-300">산출물 상세</h3>
        <div className="log-row px-2 py-2 text-xs">
          <div className="font-medium text-gray-200">{selectedArtifactDetail.artifact}</div>
          <div className="mt-1 text-gray-400">version: {selectedArtifactDetail.version}</div>
          <div className="text-gray-400">owner: {selectedArtifactDetail.owner}</div>
          <div className="mt-2 text-gray-300">변경 요약:</div>
          <ul className="mt-1 list-disc pl-4 text-gray-400">
            {selectedArtifactDetail.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          <div className="mt-2 text-gray-300">버전 이력:</div>
          <ul className="mt-1 list-disc pl-4 text-gray-400">
            {sortedArtifactHistory.map((version) => (
              <li key={`${version.artifact_id}-${version.version}-${version.timestamp}`}>
                {version.version} ({version.timestamp}) · by {version.changed_by} · {version.summary}
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
    </>
  );
}

type ChatRunCostPanelProps = {
  costBreakdown: CostRow[];
  totalCost: number;
};

export function ChatRunCostPanel({ costBreakdown, totalCost }: ChatRunCostPanelProps) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 font-semibold text-yellow-300">비용 구성</h3>
      <div className="space-y-2 text-xs">
        {costBreakdown.map((cost) => (
          <div key={cost.provider} className="log-row px-2 py-2">
            <div className="mb-1 flex items-center justify-between text-gray-200">
              <span>{cost.provider}</span>
              <span>${cost.cost.toFixed(2)}</span>
            </div>
            <div className="h-1.5 rounded bg-white/10">
              <div className="h-full rounded bg-yellow-400" style={{ width: `${cost.share}%` }} />
            </div>
            <div className="mt-1 text-right text-gray-500">{cost.share}%</div>
          </div>
        ))}
        <div className="rounded border border-yellow-500/20 bg-yellow-900/10 px-2 py-1.5 text-right text-yellow-200">
          합계: ${totalCost.toFixed(2)}
        </div>
      </div>
    </div>
  );
}

type ChatRunMetricsPanelProps = {
  nodeMetrics: NodeMetricRow[];
  selectedMetricNode: string | null;
  setSelectedMetricNode: Dispatch<SetStateAction<string | null>>;
  avgConfidence: number;
};

export function ChatRunMetricsPanel({
  nodeMetrics,
  selectedMetricNode,
  setSelectedMetricNode,
  avgConfidence
}: ChatRunMetricsPanelProps) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 font-semibold text-purple-300">노드 지표</h3>
      <div className="space-y-2 text-xs">
        {nodeMetrics.map((metric) => (
          <button
            key={metric.node}
            onClick={() => setSelectedMetricNode((prev) => (prev === metric.node ? null : metric.node))}
            className={`w-full rounded px-2 py-2 text-left ${
              selectedMetricNode === metric.node ? "bg-purple-900/30 ring-1 ring-purple-400/60" : "bg-black/30"
            }`}
          >
            <div className="font-medium text-gray-200">{metric.node}</div>
            <div className="mt-1 grid grid-cols-3 gap-2 text-gray-400">
              <span>비용 ${metric.cost.toFixed(4)}</span>
              <span>신뢰 {(metric.confidence * 100).toFixed(0)}%</span>
              <span>재시도 {metric.retries}</span>
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              상태: {metric.state} · 평균 신뢰 {(avgConfidence * 100).toFixed(0)}%
            </div>
          </button>
        ))}
        {nodeMetrics.length === 0 && (
          <div className="log-row px-2 py-2 text-gray-500">라이브 노드 지표가 아직 없습니다.</div>
        )}
      </div>
    </div>
  );
}
