import { type Dispatch, type SetStateAction } from "react";
import { Link2 } from "lucide-react";
import { type Edge, type Node } from "reactflow";
import { getNodeCategory, getNodeLabel, type FlowModalTab } from "./studio-canvas-model";

type StudioFlowRoutesTabProps = {
  flowModalTab: FlowModalTab;
  nodes: Node[];
  edges: Edge[];
  selectedNode: Node | null;
  selectedNodeData: Record<string, any>;
  selectedNodeLabel: string;
  linkTargetId: string;
  setLinkTargetId: Dispatch<SetStateAction<string>>;
  linkableTargetNodes: Node[];
  connectSelectedToTarget: () => void;
  stepIndexByNodeId: Map<string, number>;
};

export function StudioFlowRoutesTab({
  flowModalTab,
  nodes,
  edges,
  selectedNode,
  selectedNodeData,
  selectedNodeLabel,
  linkTargetId,
  setLinkTargetId,
  linkableTargetNodes,
  connectSelectedToTarget,
  stepIndexByNodeId
}: StudioFlowRoutesTabProps) {
  return (
    <div className={`${flowModalTab === "routes" ? "grid" : "hidden"} gap-4 xl:grid-cols-3`}>
      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.055] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-cyan-200" />
            <div>
              <div className="text-sm font-bold text-white">연결 목록</div>
              <div className="text-[11px] text-cyan-100/60">단계 사이 이동 경로입니다.</div>
            </div>
          </div>
          <span className="rounded-lg border border-cyan-400/20 bg-black/25 px-2 py-1 text-[10px] text-cyan-100">
            {edges.length}
          </span>
        </div>
        <div className="space-y-2 text-xs">
          {edges.map((edge) => {
            const sourceNode = nodes.find((node) => node.id === edge.source);
            const targetNode = nodes.find((node) => node.id === edge.target);
            const edgeLabel = String((edge as any).label || (edge.data as any)?.condition || "direct");
            return (
              <div key={edge.id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2 text-gray-200">
                  <span className="truncate">{sourceNode ? getNodeLabel(sourceNode) : edge.source}</span>
                  <span className="text-cyan-300">→</span>
                  <span className="truncate">{targetNode ? getNodeLabel(targetNode) : edge.target}</span>
                </div>
                <div className="mt-1 truncate text-[11px] text-gray-500">{edgeLabel}</div>
              </div>
            );
          })}
          {edges.length === 0 && (
            <div className="rounded-xl border border-dashed border-cyan-400/20 px-3 py-6 text-center text-cyan-100/50">
              아직 연결이 없습니다.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.055] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-cyan-200" />
            <div>
              <div className="text-sm font-bold text-white">선택 노드 연결</div>
              <div className="text-[11px] text-cyan-100/60">
                선택한 단계에서 다음 단계로 링크를 추가합니다.
              </div>
            </div>
          </div>
          {selectedNode ? (
            <span className="rounded-lg border border-cyan-400/20 bg-black/25 px-2 py-1 text-[10px] text-cyan-100">
              step {selectedNodeData.step_index || stepIndexByNodeId.get(selectedNode.id) || "-"}
            </span>
          ) : null}
        </div>
        {selectedNode ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-white/10 bg-black/25 px-2 py-2 text-xs text-gray-200">
              <div className="truncate font-semibold">{selectedNodeLabel}</div>
              <div className="mt-0.5 truncate text-[11px] text-gray-500">{getNodeCategory(selectedNode)}</div>
            </div>
            <div className="flex gap-2">
              <select
                value={linkTargetId}
                onChange={(event) => setLinkTargetId(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#101010] px-2 py-2 text-xs text-gray-200 outline-none"
              >
                {linkableTargetNodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {stepIndexByNodeId.get(node.id) || "-"} · {getNodeLabel(node)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={connectSelectedToTarget}
                disabled={!linkTargetId}
                className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                연결
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-cyan-400/20 px-3 py-6 text-center text-xs text-cyan-100/50">
            실행 단계 탭에서 연결 시작 노드를 먼저 선택하세요.
          </div>
        )}
      </div>
    </div>
  );
}
