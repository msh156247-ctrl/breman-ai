import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import {
  Loader2,
  Maximize2,
  Plus,
  Play,
  RotateCcw,
  Save,
  Settings
} from "lucide-react";

type StudioCanvasHeaderProps = {
  missionGoal: string;
  setMissionGoal: (value: string) => void;
  missionBudget: string;
  setMissionBudget: (value: string) => void;
  useMockRuntime: boolean;
  setUseMockRuntime: (value: boolean) => void;
  isExecuting: boolean;
  isDemoMode: boolean;
  nodeCount: number;
  edgeCount: number;
  loopCount: number;
  approvalGateCount: number;
  conditionRuleCount: number;
  runReadiness: { label: string; tone: "ready" | "warn" };
  setShowAddPanel: Dispatch<SetStateAction<boolean>>;
  openFlowModal: () => void;
  handleClearCanvas: () => void;
  handleSaveDraft: () => void;
  handleExecute: () => void;
};

export function StudioCanvasHeader({
  missionGoal,
  setMissionGoal,
  missionBudget,
  setMissionBudget,
  useMockRuntime,
  setUseMockRuntime,
  isExecuting,
  isDemoMode,
  nodeCount,
  edgeCount,
  loopCount,
  approvalGateCount,
  conditionRuleCount,
  runReadiness,
  setShowAddPanel,
  openFlowModal,
  handleClearCanvas,
  handleSaveDraft,
  handleExecute
}: StudioCanvasHeaderProps) {
  return (
    <div className="relative z-20 flex min-h-16 flex-col gap-3 border-b border-white/10 bg-[#080a0f]/[0.9] px-4 py-3 shadow-lg shadow-black/20 backdrop-blur lg:px-6 2xl:flex-row 2xl:items-center 2xl:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          href="/studio?panel=agents"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-gray-400 shadow-sm shadow-black/20 transition-colors hover:border-blue-300/30 hover:bg-blue-500/10 hover:text-blue-100"
          aria-label="에이전트 설정"
          title="에이전트 설정"
        >
          <Settings className="h-4 w-4" />
        </Link>
        <input
          type="text"
          value={missionGoal}
          onChange={(event) => setMissionGoal(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 py-1.5 font-black text-white outline-none transition-colors placeholder:text-gray-600 focus:border-blue-400/[0.35] focus:bg-white/[0.035] sm:w-80"
        />
      </div>
      <div className="flex w-full flex-col gap-2 2xl:w-auto 2xl:flex-row 2xl:items-center 2xl:justify-end">
        <StudioCanvasRuntimeBadges
          isDemoMode={isDemoMode}
          nodeCount={nodeCount}
          edgeCount={edgeCount}
          loopCount={loopCount}
          approvalGateCount={approvalGateCount}
          conditionRuleCount={conditionRuleCount}
          runReadiness={runReadiness}
        />
        <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap 2xl:w-auto 2xl:justify-end">
          <label className="flex min-h-10 w-full items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-gray-300 shadow-sm shadow-black/20 sm:w-auto">
            $
            <input
              value={missionBudget}
              onChange={(event) => setMissionBudget(event.target.value)}
              className="w-12 bg-transparent text-right outline-none"
              inputMode="decimal"
              aria-label="미션 예산"
            />
          </label>
          <label className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-gray-300 shadow-sm shadow-black/20 sm:w-auto">
            <input
              type="checkbox"
              checked={useMockRuntime}
              onChange={(event) => setUseMockRuntime(event.target.checked)}
              className="h-3.5 w-3.5 accent-blue-600"
            />
            Mock
          </label>
          <button
            type="button"
            onClick={() => setShowAddPanel((value) => !value)}
            className="flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-blue-400/30 bg-blue-500/[0.12] px-3 py-2 text-sm font-semibold text-blue-100 shadow-sm shadow-blue-500/10 transition-colors hover:bg-blue-500/[0.18] sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            <span>노드 추가</span>
          </button>
          <button
            type="button"
            onClick={openFlowModal}
            className="flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-cyan-400/35 bg-cyan-500/[0.14] px-3 py-2 text-sm font-semibold text-cyan-50 shadow-sm shadow-cyan-500/10 transition-colors hover:bg-cyan-500/[0.2] sm:w-auto"
          >
            <Maximize2 className="h-4 w-4" />
            <span>자세히 설정</span>
          </button>
          <button
            onClick={handleClearCanvas}
            className="flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-white/10 sm:w-auto"
          >
            <RotateCcw className="h-4 w-4" />
            <span>초기화</span>
          </button>
          <button
            onClick={handleSaveDraft}
            className="flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.065] px-3 py-2 text-sm font-semibold text-gray-100 transition-colors hover:bg-white/10 sm:w-auto"
          >
            <Save className="h-4 w-4" />
            <span>저장</span>
          </button>
          <button
            onClick={handleExecute}
            disabled={isExecuting || runReadiness.tone !== "ready"}
            className="col-span-2 flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-2 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-500 hover:to-cyan-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 sm:col-auto sm:w-auto sm:px-5"
            title={runReadiness.tone === "ready" ? "런타임 실행" : runReadiness.label}
          >
            {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            <span>{isExecuting ? "실행 중" : "런타임 실행"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function StudioCanvasRuntimeBadges({
  isDemoMode,
  nodeCount,
  edgeCount,
  loopCount,
  approvalGateCount,
  conditionRuleCount,
  runReadiness
}: {
  isDemoMode: boolean;
  nodeCount: number;
  edgeCount: number;
  loopCount: number;
  approvalGateCount: number;
  conditionRuleCount: number;
  runReadiness: { label: string; tone: "ready" | "warn" };
}) {
  return (
    <div className="flex min-h-10 min-w-0 flex-wrap items-center gap-1.5 rounded-2xl border border-white/10 bg-black/20 px-2 py-1.5 shadow-sm shadow-black/20">
      {isDemoMode && (
        <span className="rounded-lg border border-cyan-400/20 bg-cyan-500/[0.12] px-2 py-1 text-xs font-semibold text-cyan-100">
          DEMO MODE
        </span>
      )}
      <span
        className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
          runReadiness.tone === "ready"
            ? "border-emerald-400/25 bg-emerald-500/[0.12] text-emerald-100"
            : "border-amber-400/25 bg-amber-500/[0.12] text-amber-100"
        }`}
        title={runReadiness.label}
        aria-label={runReadiness.label}
      >
        {runReadiness.label}
      </span>
      <span className="rounded-lg border border-blue-300/20 bg-blue-500/[0.12] px-2 py-1 text-xs font-semibold text-blue-100">
        nodes {nodeCount}
      </span>
      <span className="rounded-lg border border-cyan-300/20 bg-cyan-500/[0.1] px-2 py-1 text-xs font-semibold text-cyan-100">
        links {edgeCount}
      </span>
      <span className="rounded-lg border border-violet-300/20 bg-violet-500/[0.1] px-2 py-1 text-xs font-semibold text-violet-100">
        loops {loopCount}
      </span>
      <span className="rounded-lg border border-amber-300/20 bg-amber-500/[0.1] px-2 py-1 text-xs font-semibold text-amber-100">
        승인 {approvalGateCount}
      </span>
      <span className="rounded-lg border border-white/10 bg-white/[0.055] px-2 py-1 text-xs font-semibold text-gray-300">
        조건 {conditionRuleCount}
      </span>
    </div>
  );
}
