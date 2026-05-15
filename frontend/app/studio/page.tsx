"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Play, RotateCcw, Save, ChevronLeft, Activity, DollarSign, TimerReset } from "lucide-react";
import ReactFlow, { Background, Connection, Controls, MiniMap, ReactFlowProvider, useNodesState } from "reactflow";
import "reactflow/dist/style.css";
import AgentNode from "../../components/studio/AgentNode";
import UtilityNode from "../../components/studio/UtilityNode";
import AgentPoolPanel from "../../components/studio/AgentPoolPanel";
import ConfigPanel from "../../components/studio/ConfigPanel";
import { useAppStore } from "../../stores/app.store";
import { buildAuthHeaders } from "../../lib/auth";
import { isDemoModeEnabled } from "../../lib/demo-mode";
import { MOCK_TEAMS } from "../../lib/mock-data";

const nodeTypes = { agentNode: AgentNode, utilityNode: UtilityNode };
const NODE_STATE_BADGE: Record<string, string> = {
  idle: "bg-gray-900/60 text-gray-300 border border-gray-700/60",
  running: "bg-blue-900/50 text-blue-200 border border-blue-500/40",
  streaming: "bg-cyan-900/50 text-cyan-200 border border-cyan-500/40",
  waiting_input: "bg-yellow-900/50 text-yellow-200 border border-yellow-500/40",
  failed: "bg-rose-900/50 text-rose-200 border border-rose-500/40",
  skipped: "bg-slate-900/50 text-slate-200 border border-slate-500/40",
  completed: "bg-emerald-900/50 text-emerald-200 border border-emerald-500/40"
};

function StudioCanvas() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"execution" | "organization">("execution");
  const [transitionFilter, setTransitionFilter] = useState<"all" | "allowed" | "blocked">("all");
  const [transitionSourceFilter, setTransitionSourceFilter] = useState<"all" | "studio" | "runtime" | "system">("all");
  const isDemoMode = isDemoModeEnabled();
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNodeFromAgent,
    addUtilityNode,
    setSelectedNodeId,
    clearCanvas,
    missionRunState,
    missionRunTransitionWarning,
    missionRunTransitionHistory,
    clearMissionRunTransitionWarning,
    setMissionRunState,
    setNodeExecutionState,
    nodeExecutionStates,
    getAllowedMissionRunTransitions
  } = useAppStore();
  const estimatedCost = useMemo(() => Number((nodes.length * 0.018 + edges.length * 0.006).toFixed(3)), [nodes.length, edges.length]);
  const simulatedLatencySec = useMemo(() => Math.max(8, nodes.length * 3 + edges.length), [edges.length, nodes.length]);
  const failureProbability = useMemo(() => Math.min(42, 8 + Math.max(0, nodes.length - 2) * 4), [nodes.length]);
  const runtimeLogs = useMemo(
    () => [
      "Planner 완료: 요구사항 명세 아티팩트 생성",
      "Router 판단: risk_score > 0.8 조건 평가",
      "Backend Executor 실행: API spec draft 출력",
      "QA Reviewer 검토: schema mismatch 1건 감지",
      "Retry 정책 적용: Backend Executor 재실행",
      `MissionRunState: ${missionRunState}`
    ],
    [missionRunState]
  );
  const allowedMissionTransitions = getAllowedMissionRunTransitions();
  const filteredTransitionHistory = useMemo(
    () =>
      missionRunTransitionHistory.filter((row) => {
        const byAllowed =
          transitionFilter === "all" || (transitionFilter === "allowed" ? row.allowed : !row.allowed);
        const bySource =
          transitionSourceFilter === "all" ||
          (transitionSourceFilter === "studio" && row.source.startsWith("studio")) ||
          (transitionSourceFilter === "runtime" && row.source.startsWith("runtime")) ||
          (transitionSourceFilter === "system" && row.source.startsWith("system"));
        return byAllowed && bySource;
      }),
    [missionRunTransitionHistory, transitionFilter, transitionSourceFilter]
  );

  useEffect(() => {
    const g = searchParams.get("graph");
    setViewMode(g === "organization" ? "organization" : "execution");
  }, [searchParams]);

  const setViewAndUrl = useCallback(
    (mode: "execution" | "organization") => {
      setViewMode(mode);
      if (mode === "organization") {
        router.replace("/studio?graph=organization", { scroll: false });
      } else {
        router.replace("/studio", { scroll: false });
      }
    },
    [router]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      const payloadStr = event.dataTransfer.getData("application/reactflow");
      if (!payloadStr || !reactFlowInstance || !bounds) return;
      const payload = JSON.parse(payloadStr);
      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top
      });
      if (payload?.payloadType === "utility") {
        addUtilityNode(payload.data, position);
      } else if (payload?.payloadType === "agent") {
        addNodeFromAgent(payload.data, position);
      }
    },
    [addNodeFromAgent, addUtilityNode, reactFlowInstance]
  );

  const handleExecute = async () => {
    if (nodes.length === 0) {
      alert("먼저 팀원을 캔버스에 배치해주세요!");
      return;
    }
    setMissionRunState("planning", "studio.execute");
    nodes.forEach((node, idx) => setNodeExecutionState(node.id, idx === 0 ? "running" : "idle"));
    if (isDemoMode) {
      setMissionRunState("running", "studio.execute.demo");
      const fakeMissionId = `demo-${Date.now()}`;
      router.push(`/chat/${fakeMissionId}`);
      return;
    }

    try {
      setMissionRunState("running", "studio.execute.api");
      const response = await fetch("http://localhost:8000/api/missions", {
        method: "POST",
        headers: buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          goal: "스튜디오에서 생성한 실행 조직 런타임",
          team_graph: { nodes, edges },
          auto_mode: true,
          budget: 5,
          use_mock: true
        })
      });
      const data = await response.json();
      if (data.mission_id) router.push(`/chat/${data.mission_id}`);
    } catch {
      setMissionRunState("failed", "studio.execute.error");
      alert("미션 실행에 실패했습니다. 다시 시도해주세요.");
    }
  };

  return (
    <div className="flex h-full flex-1 flex-col bg-[#0A0A0A]">
      <div className="flex h-16 items-center justify-between border-b border-white/5 bg-[#0A0A0A] px-6">
        <div className="flex items-center space-x-4">
          <Link href="/market" className="text-gray-500 transition-colors hover:text-white">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <input
            type="text"
            defaultValue="새로운 실행 조직 팀"
            className="w-80 bg-transparent py-1 font-bold text-white outline-none focus:border-b focus:border-blue-500"
          />
        </div>
        <div className="flex items-center space-x-3">
          {isDemoMode && <span className="rounded bg-cyan-900/40 px-2 py-1 text-xs text-cyan-200">DEMO MODE</span>}
          <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewAndUrl("execution")}
              className={`rounded px-2 py-1 ${viewMode === "execution" ? "bg-blue-600 text-white" : "text-gray-300"}`}
            >
              Execution Graph
            </button>
            <button
              type="button"
              onClick={() => setViewAndUrl("organization")}
              className={`rounded px-2 py-1 ${viewMode === "organization" ? "bg-blue-600 text-white" : "text-gray-300"}`}
            >
              Organization Graph
            </button>
          </div>
          <button
            onClick={clearCanvas}
            className="flex items-center space-x-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10"
          >
            <RotateCcw className="h-4 w-4" />
            <span>초기화</span>
          </button>
          <button className="flex items-center space-x-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10">
            <Save className="h-4 w-4" />
            <span>저장</span>
          </button>
          <button
            onClick={handleExecute}
            className="flex items-center space-x-1.5 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold shadow-lg shadow-blue-600/20 transition-all hover:scale-105 hover:bg-blue-500 active:scale-95"
          >
            <Play className="h-4 w-4" />
            <span>런타임 실행</span>
          </button>
        </div>
      </div>
      {missionRunTransitionWarning && (
        <div className="mx-6 mt-3 flex items-center justify-between rounded-lg border border-rose-500/40 bg-rose-900/20 px-3 py-2 text-xs text-rose-200">
          <span>{missionRunTransitionWarning}</span>
          <button
            onClick={clearMissionRunTransitionWarning}
            className="rounded border border-rose-400/40 px-2 py-0.5 text-[11px] hover:bg-rose-900/30"
          >
            닫기
          </button>
        </div>
      )}

      <div className="relative flex-1" ref={reactFlowWrapper}>
        {viewMode === "execution" ? (
          <div className="flex h-full flex-col">
            <div className="relative min-h-0 flex-1">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onInit={setReactFlowInstance}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                onPaneClick={() => setSelectedNodeId(null)}
                nodeTypes={nodeTypes}
                defaultEdgeOptions={{ type: "smoothstep" }}
                fitView
                className="bg-[#0A0A0A]"
              >
                <Background color="#1F2937" gap={20} size={1} />
                <Controls className="rounded-xl border border-white/10 bg-[#111111]" />
              </ReactFlow>

              {nodes.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-gray-600">
                    <div className="mb-4 text-6xl">🤖</div>
                    <div className="mb-2 text-xl font-semibold">Role Runtime 스튜디오</div>
                    <div className="max-w-md text-sm leading-relaxed">
                      좌측에서 팀원을 드래그해서 캔버스에 배치하고,
                      <br />
                      좌→우로 화살표를 연결해 실행 파이프라인을 넓게 이어가 보세요.
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid h-48 grid-cols-[1fr_320px_280px] gap-3 border-t border-white/5 bg-[#0b0f15] p-3">
              <div className="panel-shell rounded-xl p-3">
                <div className="mb-2 text-xs font-semibold text-cyan-300">시뮬레이터 로그</div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="stat-chip bg-black/30 px-2 py-1.5 text-gray-300">
                    <div className="flex items-center gap-1 text-gray-500">
                      <DollarSign className="h-3.5 w-3.5 text-yellow-300" />
                      예상 비용
                    </div>
                    <div className="mt-0.5 font-semibold text-yellow-200">${estimatedCost}</div>
                  </div>
                  <div className="stat-chip bg-black/30 px-2 py-1.5 text-gray-300">
                    <div className="flex items-center gap-1 text-gray-500">
                      <TimerReset className="h-3.5 w-3.5 text-blue-300" />
                      예상 시간
                    </div>
                    <div className="mt-0.5 font-semibold text-blue-200">{simulatedLatencySec}s</div>
                  </div>
                  <div className="stat-chip bg-black/30 px-2 py-1.5 text-gray-300">
                    <div className="flex items-center gap-1 text-gray-500">
                      <Activity className="h-3.5 w-3.5 text-rose-300" />
                      실패 확률
                    </div>
                    <div className="mt-0.5 font-semibold text-rose-200">{failureProbability}%</div>
                  </div>
                </div>
                <div className="mt-2 max-h-[88px] space-y-1 overflow-y-auto text-[11px]">
                  {runtimeLogs.map((log) => (
                    <div key={log} className="log-row px-2 py-1 text-gray-300">
                      {log}
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel-shell rounded-xl p-3">
                <div className="mb-2 text-xs font-semibold text-purple-300">실행 경로 요약</div>
                <div className="space-y-1.5 text-[11px] text-gray-300">
                  <div className="log-row px-2 py-1 text-cyan-300">mission state: {missionRunState}</div>
                  <div className="log-row px-2 py-1">node count: {nodes.length}</div>
                  <div className="log-row px-2 py-1">edge count: {edges.length}</div>
                  <div className="log-row px-2 py-1">router node: {nodes.filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "router").length}</div>
                  <div className="log-row px-2 py-1">hitl node: {nodes.filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "hitl").length}</div>
                  <div className="log-row px-2 py-1 text-emerald-300">status: ready for runtime</div>
                </div>
                <div className="mt-2 max-h-[62px] space-y-1 overflow-y-auto text-[11px]">
                  {nodes.slice(0, 4).map((node) => (
                    <div key={node.id} className="log-row flex items-center justify-between px-2 py-1 text-gray-300">
                      <span className="truncate pr-2">{String((node.data as any)?.label || node.id)}</span>
                      <span
                        className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          NODE_STATE_BADGE[nodeExecutionStates[node.id] || "idle"] || NODE_STATE_BADGE.idle
                        }`}
                      >
                        {nodeExecutionStates[node.id] || "idle"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel-shell rounded-xl p-3">
                <div className="mb-2 text-xs font-semibold text-orange-300">Mission State Machine</div>
                <div className="log-row mb-2 px-2 py-1 text-[11px] text-gray-300">
                  current: <span className="font-semibold text-cyan-300">{missionRunState}</span>
                </div>
                <div className="mb-2 text-[11px] text-gray-400">allowed next:</div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {allowedMissionTransitions.map((next) => (
                    <button
                      key={next}
                      onClick={() => setMissionRunState(next, "studio.simulator")}
                      className="stat-chip rounded px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-white/10"
                    >
                      {next}
                    </button>
                  ))}
                  {allowedMissionTransitions.length === 0 && (
                    <span className="text-[11px] text-gray-500">no transition</span>
                  )}
                </div>
                <div className="mb-2">
                  <button
                    onClick={() => setMissionRunState("completed", "studio.simulator.invalid-test")}
                    className="rounded border border-rose-500/40 bg-rose-900/20 px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-900/30"
                  >
                    invalid transition test
                  </button>
                </div>
                <div className="mb-2 flex items-center gap-1">
                  <button
                    onClick={() => setTransitionFilter("all")}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${transitionFilter === "all" ? "bg-blue-600 text-white" : "bg-black/30 text-gray-400"}`}
                  >
                    all
                  </button>
                  <button
                    onClick={() => setTransitionFilter("allowed")}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${transitionFilter === "allowed" ? "bg-emerald-600 text-white" : "bg-black/30 text-gray-400"}`}
                  >
                    allowed
                  </button>
                  <button
                    onClick={() => setTransitionFilter("blocked")}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${transitionFilter === "blocked" ? "bg-rose-600 text-white" : "bg-black/30 text-gray-400"}`}
                  >
                    blocked
                  </button>
                  <select
                    value={transitionSourceFilter}
                    onChange={(e) =>
                      setTransitionSourceFilter(e.target.value as "all" | "studio" | "runtime" | "system")
                    }
                    className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-gray-300"
                  >
                    <option value="all">source:all</option>
                    <option value="studio">studio</option>
                    <option value="runtime">runtime</option>
                    <option value="system">system</option>
                  </select>
                </div>
                <div className="max-h-[66px] space-y-1 overflow-y-auto text-[10px] text-gray-500">
                  <div className="log-row px-2 py-1">queued -&gt; planning/cancelled</div>
                  <div className="log-row px-2 py-1">planning -&gt; running/failed/escalated</div>
                  <div className="log-row px-2 py-1">running -&gt; blocked/awaiting_approval/retrying/completed</div>
                  <div className="log-row px-2 py-1">awaiting_approval -&gt; running/retrying/escalated</div>
                  <div className="log-row px-2 py-1">retrying -&gt; running/failed/escalated</div>
                </div>
                <div className="mt-2 text-[11px] text-gray-400">transition timeline:</div>
                <div className="mt-1 max-h-[62px] space-y-1 overflow-y-auto text-[10px]">
                  {filteredTransitionHistory.slice(0, 6).map((row, idx) => (
                    <div key={`${row.timestamp}-${idx}`} className="log-row flex items-center justify-between px-2 py-1">
                      <span className={row.allowed ? "text-emerald-300" : "text-rose-300"}>
                        {row.from} -&gt; {row.to}
                        {!row.allowed && row.reject_reason ? ` (${row.reject_reason})` : ""}
                      </span>
                      <span className="text-gray-500">{row.source}</span>
                    </div>
                  ))}
                  {filteredTransitionHistory.length === 0 && (
                    <div className="text-gray-500">no transitions yet</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <TeamCollaborationView />
        )}
      </div>
    </div>
  );
}

function StudioPageInner() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AgentPoolPanel />
      <ReactFlowProvider>
        <StudioCanvas />
      </ReactFlowProvider>
      <ConfigPanel />
    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 items-center justify-center text-gray-500">스튜디오 로딩 중…</div>
      }
    >
      <StudioPageInner />
    </Suspense>
  );
}

function TeamCollaborationView() {
  const { teamLinks: links, updateTeamLink, addTeamLink, removeTeamLink, duplicateTeamLink } = useAppStore();
  const [selectedLinkIndex, setSelectedLinkIndex] = useState<number | null>(null);
  const teamNodesSeed = useMemo(
    () =>
      MOCK_TEAMS.map((team, idx) => ({
        id: team.id,
        position: { x: 120 + idx * 340, y: 120 + (idx % 2) * 110 },
        data: { label: team.name },
        style: {
          background: "#111111",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 12,
          padding: 10,
          width: 220
        }
      })),
    []
  );
  const [teamNodes, , onTeamNodesChange] = useNodesState(teamNodesSeed);
  const teamEdges = useMemo(
    () =>
      links.map((link, idx) => ({
        id: String(idx),
        source: link.from,
        target: link.to,
        animated: link.mode !== "direct_pass",
        label: `${link.artifact} · ${link.mode}`,
        style:
          idx === (selectedLinkIndex ?? 0)
            ? { stroke: "#facc15", strokeWidth: 2.5 }
            : link.mode === "conditional_routing"
              ? { stroke: "#22d3ee", strokeWidth: 2 }
              : { stroke: "#94a3b8", strokeWidth: 2 }
      })),
    [links, selectedLinkIndex]
  );
  const selectedLink = selectedLinkIndex !== null ? links[selectedLinkIndex] : links[0];
  const selectedIndex = selectedLinkIndex !== null ? selectedLinkIndex : 0;
  if (!selectedLink) {
    return <div className="p-6 text-sm text-gray-400">팀 링크 데이터가 없습니다.</div>;
  }

  const validateTeamLinkSchema = (schema: string, artifact: string) => {
    const normalized = schema.trim().toLowerCase();
    const artifactNormalized = artifact.trim().toLowerCase();
    if (!/^[a-z_]+(\.[a-z_]+)*\.v\d+$/.test(normalized)) {
      return { ok: false, message: "schema 형식은 example.name.v1 이어야 합니다." };
    }
    const expectedBySchema: Record<string, string> = {
      "pull_request.v2": "pr",
      "brief.v1": "brief",
      "risk_report.v1": "risk"
    };
    const expectedToken = expectedBySchema[normalized];
    if (expectedToken && !artifactNormalized.includes(expectedToken)) {
      return {
        ok: false,
        message: `${normalized} 스키마는 artifact 이름에 "${expectedToken}" 관련 키워드가 필요합니다.`
      };
    }
    return { ok: true, message: "schema validator 통과" };
  };

  const schemaCheck = validateTeamLinkSchema(selectedLink.schema, selectedLink.artifact);

  const handleDelete = () => {
    removeTeamLink(selectedIndex);
    const nextLength = links.length - 1;
    if (nextLength <= 0) {
      setSelectedLinkIndex(null);
      return;
    }
    setSelectedLinkIndex(Math.min(selectedIndex, nextLength - 1));
  };

  const handleDuplicate = () => {
    duplicateTeamLink(selectedIndex);
    setSelectedLinkIndex(links.length);
  };
  const handleTeamConnect = (conn: Connection) => {
    if (!conn.source || !conn.target) return;
    const next = {
      from: conn.source,
      to: conn.target,
      artifact: "New Artifact",
      policy: "Direct Pass",
      sla: "10m",
      contract: "royalty 1%",
      schema: "custom.v1",
      mode: "direct_pass"
    };
    addTeamLink(next);
    setSelectedLinkIndex(links.length);
  };

  return (
    <div className="grid h-full grid-cols-[1fr_360px] gap-4 overflow-hidden p-6 text-white">
      <div className="min-h-0 overflow-y-auto">
        <h2 className="mb-4 text-lg font-bold">Team Collaboration View</h2>
        <div className="mb-6 rounded-2xl border border-white/10 bg-[#111111] p-4">
          <h3 className="mb-3 font-semibold text-blue-300">협업 그래프 (드래그/연결 가능)</h3>
          <div className="h-80 overflow-hidden rounded-xl bg-black/30">
            <ReactFlow
              nodes={teamNodes}
              edges={teamEdges}
              onNodesChange={onTeamNodesChange}
              onConnect={handleTeamConnect}
              onEdgeClick={(_, edge) => setSelectedLinkIndex(Number(edge.id))}
              fitView
              className="bg-black/10"
            >
              <Background color="#1f2937" gap={20} size={1} />
              <MiniMap pannable zoomable />
              <Controls />
            </ReactFlow>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-[#111111] p-4">
          <h3 className="mb-3 font-semibold text-cyan-300">팀 간 연결 정책</h3>
          <div className="space-y-2 text-sm">
            {links.map((link, idx) => (
              <button
                key={`${link.from}-${link.to}-${idx}`}
                onClick={() => setSelectedLinkIndex(idx)}
                className={`flex w-full flex-wrap items-center gap-2 rounded px-3 py-2 text-left ${
                  idx === selectedIndex ? "bg-blue-900/25 ring-1 ring-blue-400/50" : "bg-black/30 hover:bg-black/50"
                }`}
              >
                <span className="font-medium">{link.from}</span>
                <span>→</span>
                <span className="font-medium">{link.to}</span>
                <span className="text-gray-500">artifact: {link.artifact}</span>
                <span className="text-yellow-300">policy: {link.policy}</span>
                <span className="text-green-300">SLA: {link.sla}</span>
                <span className="text-purple-300">contract: {link.contract}</span>
                <span className="text-cyan-300">schema: {link.schema}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <aside className="min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-[#111111] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Team Link 정책 편집</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDuplicate}
              className="rounded border border-cyan-500/30 bg-cyan-900/20 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-900/40"
            >
              복제
            </button>
            <button
              onClick={handleDelete}
              className="rounded border border-rose-500/30 bg-rose-900/20 px-2 py-1 text-xs text-rose-200 hover:bg-rose-900/40"
            >
              삭제
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm">
          <input
            value={selectedLink.artifact}
            onChange={(e) =>
              updateTeamLink(selectedIndex, { artifact: e.target.value })
            }
            className="rounded border border-white/10 bg-black/30 px-2 py-2"
            placeholder="artifact type"
          />
          <input
            value={selectedLink.sla}
            onChange={(e) =>
              updateTeamLink(selectedIndex, { sla: e.target.value })
            }
            className="rounded border border-white/10 bg-black/30 px-2 py-2"
            placeholder="SLA"
          />
          <input
            value={selectedLink.contract}
            onChange={(e) =>
              updateTeamLink(selectedIndex, { contract: e.target.value })
            }
            className="rounded border border-white/10 bg-black/30 px-2 py-2"
            placeholder="contract"
          />
          <input
            value={selectedLink.schema}
            onChange={(e) =>
              updateTeamLink(selectedIndex, { schema: e.target.value })
            }
            className={`rounded border bg-black/30 px-2 py-2 ${schemaCheck.ok ? "border-white/10" : "border-red-500/50"}`}
            placeholder="schema"
          />
          <select
            value={selectedLink.mode}
            onChange={(e) =>
              updateTeamLink(selectedIndex, { mode: e.target.value })
            }
            className="rounded border border-white/10 bg-black/30 px-2 py-2"
          >
            <option value="direct_pass">direct_pass</option>
            <option value="approval_chain">approval_chain</option>
            <option value="conditional_routing">conditional_routing</option>
          </select>
          <input
            value={selectedLink.policy}
            onChange={(e) =>
              updateTeamLink(selectedIndex, { policy: e.target.value })
            }
            className="rounded border border-white/10 bg-black/30 px-2 py-2"
            placeholder="approval policy"
          />
        </div>
        <div className={`mt-3 rounded px-2 py-1.5 text-xs ${schemaCheck.ok ? "bg-emerald-900/20 text-emerald-300" : "bg-red-900/20 text-red-300"}`}>
          {schemaCheck.message}
        </div>
        <div className="mt-4 text-xs text-gray-500">변경값은 현재 데모 UI 상태에 반영됩니다.</div>
      </aside>
    </div>
  );
}
