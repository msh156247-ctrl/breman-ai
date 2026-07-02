import type { TimelineRow } from "./chat-runtime-model";
import { timelineIcon, timelineKindLabel, timelineToneClass } from "./chat-timeline-model";

type OperationEventCounts = {
  routes: number;
  loops: number;
  approvals: number;
  conditions: number;
  risks: number;
};

type ChatRunAsideTimelinePanelProps = {
  selectedMetricNode: string | null;
  setSelectedMetricNode: (node: string | null | ((prev: string | null) => string | null)) => void;
  selectedArtifact: string | null;
  setSelectedArtifact: (artifact: string | null) => void;
  operationEventCounts: OperationEventCounts;
  filteredTimeline: TimelineRow[];
};

export function ChatRunAsideTimelinePanel({
  selectedMetricNode,
  setSelectedMetricNode,
  selectedArtifact,
  setSelectedArtifact,
  operationEventCounts,
  filteredTimeline
}: ChatRunAsideTimelinePanelProps) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-cyan-300">실행 타임라인</h3>
        {(selectedMetricNode || selectedArtifact) && (
          <button
            onClick={() => {
              setSelectedMetricNode(null);
              setSelectedArtifact(null);
            }}
            className="min-h-9 rounded-lg px-2 text-[11px] text-gray-400 hover:bg-white/5 hover:text-gray-200"
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
  );
}
