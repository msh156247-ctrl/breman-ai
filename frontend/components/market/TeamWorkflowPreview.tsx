"use client";

import { useCallback, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, Edge, Handle, Node, NodeProps, Position, ReactFlowProvider } from "reactflow";
import "reactflow/dist/style.css";
import type { Agent } from "../../types";

function DagStepNode({ data }: NodeProps) {
  return (
    <div className="min-w-[120px] rounded-lg border border-cyan-500/35 bg-[#0f172a] px-3 py-2 text-center text-xs font-semibold text-cyan-100 shadow-md">
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-cyan-400" />
      {String(data.label)}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-cyan-400" />
    </div>
  );
}

function OrgUnitNode({ data }: NodeProps) {
  const sub = data.subtitle ? String(data.subtitle) : "";
  return (
    <div className="min-w-[140px] rounded-lg border border-white/15 bg-[#111827] px-3 py-2 text-left text-xs text-white shadow-md">
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-slate-400" />
      <div className="font-bold">{String(data.label)}</div>
      {sub ? <div className="mt-0.5 text-[10px] text-gray-400">{sub}</div> : null}
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-slate-400" />
    </div>
  );
}

const nodeTypes = { dagStep: DagStepNode, orgUnit: OrgUnitNode };

type PreviewMode = "dag" | "org";

function FlowInner({
  mode,
  workflow,
  teamName,
  members
}: {
  mode: PreviewMode;
  workflow: string[];
  teamName: string;
  members: Agent[];
}) {
  const { nodes, edges } = useMemo(() => {
    if (mode === "dag") {
      const nodes: Node[] = workflow.map((label, i) => ({
        id: `dag-${i}`,
        type: "dagStep",
        position: { x: 24 + i * 168, y: 56 },
        data: { label }
      }));
      const edges: Edge[] = workflow.slice(0, -1).map((_, i) => ({
        id: `de-${i}`,
        source: `dag-${i}`,
        target: `dag-${i + 1}`,
        type: "smoothstep",
        animated: true,
        style: { stroke: "#22d3ee", strokeWidth: 1.5 }
      }));
      return { nodes, edges };
    }

    const nodes: Node[] = [
      {
        id: "org-root",
        type: "orgUnit",
        position: { x: 120, y: 12 },
        data: { label: teamName, subtitle: "실행 조직 단위" }
      },
      ...members.map((m, i) => ({
        id: `org-m-${m.id}`,
        type: "orgUnit",
        position: { x: 40 + i * 176, y: 120 },
        data: { label: m.name, subtitle: `${m.category} · ${m.model_name}` }
      }))
    ];
    const edges: Edge[] = members.map((m, i) => ({
      id: `oe-${i}`,
      source: "org-root",
      target: `org-m-${m.id}`,
      type: "smoothstep",
      style: { stroke: "#94a3b8", strokeWidth: 1.25 }
    }));
    return { nodes, edges };
  }, [mode, workflow, teamName, members]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnScroll
      zoomOnScroll
      proOptions={{ hideAttribution: true }}
      className="bg-black/25"
    >
      <Background color="#1e293b" gap={16} size={1} />
      <Controls className="!m-2 !rounded-lg !border !border-white/10 !bg-[#111]" showInteractive={false} />
    </ReactFlow>
  );
}

export default function TeamWorkflowPreview({
  workflow,
  teamName,
  members
}: {
  workflow: string[];
  teamName: string;
  members: Agent[];
}) {
  const [mode, setMode] = useState<PreviewMode>("dag");

  const safeWorkflow = workflow.length > 0 ? workflow : ["시작", "실행", "완료"];

  const tab = useCallback(
    (m: PreviewMode, label: string) => (
      <button
        key={m}
        type="button"
        onClick={() => setMode(m)}
        className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
          mode === m ? "bg-cyan-600 text-white" : "bg-black/40 text-gray-400 hover:text-gray-200"
        }`}
      >
        {label}
      </button>
    ),
    [mode]
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f15]">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <span className="text-xs font-semibold text-gray-400">조직 시각화 (데모)</span>
        <div className="flex gap-1">
          {tab("dag", "실행 DAG")}
          {tab("org", "구성 · 역할")}
        </div>
      </div>
      <div className="h-72 w-full">
        <ReactFlowProvider>
          <FlowInner mode={mode} workflow={safeWorkflow} teamName={teamName} members={members} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
