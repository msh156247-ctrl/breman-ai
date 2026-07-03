import { formatDraftTime } from "./studio-canvas-model";

type StudioCanvasNoticesProps = {
  missionRunTransitionWarning: string | null;
  clearMissionRunTransitionWarning: () => void;
  executeError: string;
  draftSavedAt: string | null;
  draftNotice: string;
  handleRestoreDraft: () => void;
  handleDiscardDraft: () => void;
};

export function StudioCanvasNotices({
  missionRunTransitionWarning,
  clearMissionRunTransitionWarning,
  executeError,
  draftSavedAt,
  draftNotice,
  handleRestoreDraft,
  handleDiscardDraft
}: StudioCanvasNoticesProps) {
  return (
    <>
      {missionRunTransitionWarning && (
        <div className="mx-6 mt-3 flex items-center justify-between rounded-lg border border-rose-500/40 bg-rose-900/20 px-3 py-2 text-xs text-rose-200">
          <span>{missionRunTransitionWarning}</span>
          <button
            onClick={clearMissionRunTransitionWarning}
            className="inline-flex min-h-9 items-center justify-center rounded border border-rose-400/40 px-2.5 py-1 text-[11px] hover:bg-rose-900/30"
          >
            닫기
          </button>
        </div>
      )}
      {executeError ? (
        <div className="mx-6 mt-3 rounded-lg border border-yellow-500/40 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-100">
          {executeError}
        </div>
      ) : null}
      {(draftSavedAt || draftNotice) && (
        <div className="mx-6 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-100">
          <span>
            {draftNotice ||
              (draftSavedAt ? `저장된 draft · ${formatDraftTime(draftSavedAt)}` : "저장된 draft가 없습니다.")}
          </span>
          {draftSavedAt && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleRestoreDraft}
                className="inline-flex min-h-9 items-center justify-center rounded border border-cyan-400/40 px-2.5 py-1 text-[11px] hover:bg-cyan-900/30"
              >
                복구
              </button>
              <button
                onClick={handleDiscardDraft}
                className="inline-flex min-h-9 items-center justify-center rounded border border-cyan-400/20 px-2.5 py-1 text-[11px] text-cyan-200/80 hover:bg-cyan-900/20"
              >
                삭제
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
