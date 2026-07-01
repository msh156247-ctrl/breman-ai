import { RotateCcw } from "lucide-react";
import { type Edge, type Node } from "reactflow";
import { type LoopRegion } from "../../stores/app.store";
import { getNodeLabel, LOOP_EXIT_FINISH, type FlowModalTab } from "./studio-canvas-model";

type StudioFlowLoopPanelProps = {
  flowModalTab: FlowModalTab;
  loopBandMode: boolean;
  bandSelectedNodes: Node[];
  bandSelectedEdges: Edge[];
  createLoopRegionFromBand: () => void;
  loopRegions: LoopRegion[];
  selectedLoopRegion: LoopRegion | null;
  setSelectedLoopRegionId: (regionId: string | null) => void;
  selectedLoopStartNode: Node | null;
  selectedLoopEndNode: Node | null;
  selectedLoopConditionNodeId: string;
  updateSelectedLoopRegion: (patch: Partial<LoopRegion>) => void;
  nodes: Node[];
  stepIndexByNodeId: Map<string, number>;
  outsideLoopNodes: Node[];
  selectedLoopConditionNode: Node | null;
  selectedLoopExitNode: Node | null;
  removeLoopRegion: (regionId: string) => void;
};

export function StudioFlowLoopPanel({
  flowModalTab,
  loopBandMode,
  bandSelectedNodes,
  bandSelectedEdges,
  createLoopRegionFromBand,
  loopRegions,
  selectedLoopRegion,
  setSelectedLoopRegionId,
  selectedLoopStartNode,
  selectedLoopEndNode,
  selectedLoopConditionNodeId,
  updateSelectedLoopRegion,
  nodes,
  stepIndexByNodeId,
  outsideLoopNodes,
  selectedLoopConditionNode,
  selectedLoopExitNode,
  removeLoopRegion
}: StudioFlowLoopPanelProps) {
  return (
    <div className={`${flowModalTab === "routes" ? "block" : "hidden"} mb-4 rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-3`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-violet-200" />
          <div>
            <div className="text-sm font-bold text-white">반복 영역</div>
            <div className="text-[11px] text-violet-100/60">
              반복 선택 모드에서 연결된 단계 카드를 선택하세요.
            </div>
          </div>
        </div>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            loopBandMode ? "bg-violet-500 text-white" : "bg-black/30 text-gray-400"
          }`}
        >
          {loopBandMode ? "selecting" : "idle"}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-black/25 px-2 py-2 text-gray-300">
          <div className="text-gray-500">선택 노드</div>
          <div className="mt-0.5 font-semibold text-violet-100">{bandSelectedNodes.length}개</div>
        </div>
        <div className="rounded-lg bg-black/25 px-2 py-2 text-gray-300">
          <div className="text-gray-500">내부 링크</div>
          <div className="mt-0.5 font-semibold text-violet-100">{bandSelectedEdges.length}개</div>
        </div>
      </div>

      <button
        type="button"
        onClick={createLoopRegionFromBand}
        disabled={bandSelectedNodes.length < 2}
        className="mb-3 w-full rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        선택 영역을 반복으로 만들기
      </button>

      {loopRegions.length > 0 ? (
        <div className="space-y-3">
          <label className="block text-[11px] font-semibold text-gray-400">
            반복 영역 선택
            <select
              value={selectedLoopRegion?.id || ""}
              onChange={(event) => setSelectedLoopRegionId(event.target.value || null)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-gray-200 outline-none focus:border-violet-500/50"
            >
              {loopRegions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name} · {region.nodeIds.length} nodes
                </option>
              ))}
            </select>
          </label>

          {selectedLoopRegion ? (
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
              <label className="block text-[11px] text-gray-500">
                이름
                <input
                  value={selectedLoopRegion.name}
                  onChange={(event) => updateSelectedLoopRegion({ name: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none focus:border-violet-500/50"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-[11px] text-gray-500">
                  반복 초기 노드
                  <div className="mt-1 rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200">
                    <div className="truncate">
                      {selectedLoopStartNode
                        ? `${stepIndexByNodeId.get(selectedLoopStartNode.id) || "-"} · ${getNodeLabel(selectedLoopStartNode)}`
                        : "자동 설정됨"}
                    </div>
                    <div className="mt-1 text-[10px] text-violet-300">생성 시 고정</div>
                  </div>
                </div>
                <div className="text-[11px] text-gray-500">
                  반복 종료 노드
                  <div className="mt-1 rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200">
                    <div className="truncate">
                      {selectedLoopEndNode
                        ? `${stepIndexByNodeId.get(selectedLoopEndNode.id) || "-"} · ${getNodeLabel(selectedLoopEndNode)}`
                        : "자동 설정됨"}
                    </div>
                    <div className="mt-1 text-[10px] text-violet-300">생성 시 고정</div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-2">
                <div className="mb-2 text-[11px] font-semibold text-violet-100">종료 조건 평가 위치</div>
                <div className="grid grid-cols-2 gap-2">
                  {[selectedLoopRegion.startNodeId, selectedLoopRegion.endNodeId].map((nodeId) => {
                    const node = nodes.find((item) => item.id === nodeId);
                    const active = selectedLoopConditionNodeId === nodeId;
                    return (
                      <button
                        key={nodeId}
                        type="button"
                        onClick={() => updateSelectedLoopRegion({ exitConditionNodeId: nodeId })}
                        className={`rounded-lg border px-2 py-2 text-left text-xs font-semibold ${
                          active
                            ? "border-violet-400/60 bg-violet-500/20 text-violet-50"
                            : "border-white/10 bg-black/20 text-gray-400 hover:text-white"
                        }`}
                      >
                        <span className="block truncate">{node ? getNodeLabel(node) : nodeId}</span>
                        <span className="mt-1 block text-[10px] opacity-70">
                          {nodeId === selectedLoopRegion.startNodeId ? "초기에서 검사" : "종료에서 검사"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="block text-[11px] text-gray-500">
                종료 후 노드
                <select
                  value={selectedLoopRegion.exitNodeId || LOOP_EXIT_FINISH}
                  onChange={(event) => updateSelectedLoopRegion({ exitNodeId: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none"
                >
                  <option value={LOOP_EXIT_FINISH}>플로우 종료</option>
                  {outsideLoopNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {stepIndexByNodeId.get(node.id) || "-"} · {getNodeLabel(node)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
                <label className="text-[11px] text-gray-500">
                  최대 반복
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={selectedLoopRegion.repeatCount}
                    onChange={(event) =>
                      updateSelectedLoopRegion({ repeatCount: Math.max(1, Number(event.target.value) || 1) })
                    }
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none"
                  />
                </label>
                <label className="text-[11px] text-gray-500">
                  종료 조건
                  <input
                    value={selectedLoopRegion.exitCondition}
                    onChange={(event) => updateSelectedLoopRegion({ exitCondition: event.target.value })}
                    placeholder="예: result.done == true"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none placeholder:text-gray-700 focus:border-violet-500/50"
                  />
                </label>
              </div>
              <div className="rounded-lg bg-black/25 px-2 py-2 text-[11px] leading-relaxed text-gray-400">
                선택한 평가 위치에서 종료 조건을 만족하면 종료 후 노드로 이동하고, 아니면 반복 초기 노드로 돌아갑니다.
              </div>
              <div className="rounded-lg border border-violet-400/20 bg-violet-500/[0.055] p-2 text-[11px]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold text-violet-100">반복 런타임</span>
                  <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-violet-200">
                    loop_region_v1
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 rounded-md bg-black/20 px-2 py-1.5">
                    <span className="text-violet-200">반복 대상</span>
                    <span className="truncate text-gray-300">
                      {selectedLoopRegion.nodeIds.length} steps · {selectedLoopStartNode ? getNodeLabel(selectedLoopStartNode) : "start"} →{" "}
                      {selectedLoopEndNode ? getNodeLabel(selectedLoopEndNode) : "end"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 rounded-md bg-black/20 px-2 py-1.5">
                    <span className="text-violet-200">종료 평가</span>
                    <span className="truncate text-gray-300">
                      {selectedLoopConditionNode ? getNodeLabel(selectedLoopConditionNode) : "종료 노드"} ·{" "}
                      {selectedLoopRegion.exitCondition || "조건 없음"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 rounded-md bg-black/20 px-2 py-1.5">
                    <span className="text-violet-200">true / false</span>
                    <span className="truncate text-gray-300">
                      true →{" "}
                      {selectedLoopRegion.exitNodeId === LOOP_EXIT_FINISH
                        ? "플로우 종료"
                        : selectedLoopExitNode
                          ? getNodeLabel(selectedLoopExitNode)
                          : "종료 후 노드 없음"}
                      {" · false → 반복 초기로"}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeLoopRegion(selectedLoopRegion.id)}
                className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/15"
              >
                반복 영역 삭제
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-violet-400/20 px-3 py-4 text-center text-xs text-violet-100/50">
          아직 반복 영역이 없습니다.
        </div>
      )}
    </div>
  );
}
