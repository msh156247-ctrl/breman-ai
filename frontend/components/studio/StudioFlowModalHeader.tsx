import { Maximize2, RotateCcw, Save, X } from "lucide-react";

type StudioFlowModalHeaderProps = {
  addContextLabel: string;
  loopBandMode: boolean;
  onToggleLoopBandMode: () => void;
  handleSaveDraft: () => void;
  closeFlowModal: () => void;
};

export function StudioFlowModalHeader({
  addContextLabel,
  loopBandMode,
  onToggleLoopBandMode,
  handleSaveDraft,
  closeFlowModal
}: StudioFlowModalHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Maximize2 className="h-4 w-4 text-blue-300" />
          <h2 className="truncate text-lg font-bold">플로우 자세히 설정</h2>
        </div>
        <div className="mt-0.5 text-xs text-gray-500">
          {addContextLabel} · 그래프 캔버스 대신 실행 단계, 연결, 조건, 반복을 카드로 관리합니다.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleLoopBandMode}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold ${
            loopBandMode
              ? "border-violet-400/50 bg-violet-500/20 text-violet-100"
              : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
          }`}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          반복 선택
        </button>
        <button
          type="button"
          onClick={handleSaveDraft}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10 hover:text-white"
        >
          <Save className="h-3.5 w-3.5" />
          저장
        </button>
        <button
          type="button"
          onClick={closeFlowModal}
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-gray-300 hover:bg-white/10 hover:text-white"
          aria-label="플로우 자세히 설정 닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
