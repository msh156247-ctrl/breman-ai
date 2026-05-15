"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Activity, ArrowLeft, Coins, Loader2, ShieldCheck, Timer } from "lucide-react";
import { wsAuthQuery } from "../../../lib/auth";
import { useAppStore } from "../../../stores/app.store";

type RoomStatus = "running" | "completed" | "blocked";
type ChatRow = {
  id: string;
  type: "system" | "agent" | "human_gate";
  content: string;
  role?: string;
  timestamp: Date;
};

export default function ChatRoom({ params }: { params: { id: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [status, setStatus] = useState<RoomStatus>("running");
  const [selectedMetricNode, setSelectedMetricNode] = useState<string | null>(searchParams.get("node"));
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(searchParams.get("artifact"));
  const [sideTab, setSideTab] = useState<"timeline" | "artifacts" | "cost" | "metrics">(
    (searchParams.get("tab") as "timeline" | "artifacts" | "cost" | "metrics") || "timeline"
  );
  const [transitionFilter, setTransitionFilter] = useState<"all" | "allowed" | "blocked">("all");
  const [transitionSourceFilter, setTransitionSourceFilter] = useState<"all" | "studio" | "runtime" | "system">("all");
  const {
    missionRunState,
    missionRunTransitionWarning,
    missionRunTransitionHistory,
    clearMissionRunTransitionWarning,
    setMissionRunState,
    artifactVersions,
    nodes,
    setNodeExecutionState,
    getAllowedMissionRunTransitions
  } = useAppStore();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const resolveNodeIdForEvent = (roleText?: string, eventText?: string): string | null => {
    const role = String(roleText || "").toLowerCase();
    const event = String(eventText || "").toLowerCase();
    const combined = `${role} ${event}`;
    const matched = nodes.find((node) => {
      const label = String((node.data as any)?.label || "").toLowerCase();
      const agentId = String((node.data as any)?.agent_id || "").toLowerCase();
      const category = String((node.data as any)?.category || "").toLowerCase();
      return [label, agentId, category].some((token) => token && (combined.includes(token) || token.includes(role)));
    });
    return matched?.id || null;
  };

  useEffect(() => {
    const runFallbackSimulation = async () => {
      setMissionRunState("running", "runtime.fallback.start");
      const events: Array<{ delay: number; row: ChatRow }> = [
        {
          delay: 800,
          row: {
            id: `sim-1-${Date.now()}`,
            type: "agent",
            role: "developer",
            content: "풀스택 코드 작성봇이 작업을 시작합니다...",
            timestamp: new Date()
          }
        },
        {
          delay: 1200,
          row: {
            id: `sim-2-${Date.now()}`,
            type: "agent",
            role: "developer",
            content: "FastAPI 백엔드 + Next.js 프론트엔드 초안 완성!",
            timestamp: new Date()
          }
        },
        {
          delay: 1200,
          row: {
            id: `sim-3-${Date.now()}`,
            type: "human_gate",
            content: "코드 리뷰 단계 진행 전 최종 승인 필요",
            timestamp: new Date()
          }
        }
      ];
      for (const event of events) {
        await new Promise((resolve) => setTimeout(resolve, event.delay));
        setMessages((prev) => [...prev, event.row]);
        const mappedNodeId = resolveNodeIdForEvent(event.row.role, event.row.content);
        if (mappedNodeId && event.row.type === "agent") {
          setNodeExecutionState(mappedNodeId, "running");
        }
        if (event.row.type === "human_gate") {
          setStatus("blocked");
          setMissionRunState("awaiting_approval", "runtime.fallback.human_gate");
          nodes
            .filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "hitl")
            .forEach((n) => setNodeExecutionState(n.id, "waiting_input"));
        }
      }
    };

    if (params.id.startsWith("demo-")) {
      setMissionRunState("planning", "runtime.demo.init");
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-demo-${Date.now()}`,
          type: "system",
          content: "🧪 DEMO 모드: 로컬 시뮬레이션으로 런타임 로그를 실행합니다.",
          timestamp: new Date()
        }
      ]);
      void runFallbackSimulation();
      return;
    }

    let hasLiveEvent = false;
    const ws = new WebSocket(`ws://localhost:8000/ws/${params.id}?${wsAuthQuery()}`);
    ws.onmessage = (e) => {
      hasLiveEvent = true;
      const data = JSON.parse(e.data || "{}");
      const kind = String(data.type || "event");
      const message = String(data.message || JSON.stringify(data));
      const nextType: ChatRow["type"] =
        kind.includes("human_gate") || kind.includes("approve") ? "human_gate" : kind.includes("task") ? "agent" : "system";
      if (nextType === "human_gate") setStatus("blocked");
      if (nextType === "human_gate") setMissionRunState("awaiting_approval", "runtime.ws.human_gate");
      if (kind.includes("completed")) {
        setStatus("completed");
        setMissionRunState("completed", "runtime.ws.completed");
      }
      if (kind.includes("retry")) setMissionRunState("retrying", "runtime.ws.retry");
      const mappedNodeId = resolveNodeIdForEvent(data.role ? String(data.role) : undefined, message);
      if (mappedNodeId) {
        if (nextType === "agent") setNodeExecutionState(mappedNodeId, "running");
        if (kind.includes("completed")) setNodeExecutionState(mappedNodeId, "completed");
        if (kind.includes("fail") || kind.includes("error")) setNodeExecutionState(mappedNodeId, "failed");
        if (kind.includes("stream")) setNodeExecutionState(mappedNodeId, "streaming");
      }
      if (nextType === "human_gate") {
        nodes
          .filter((n) => String((n.data as any)?.agent_id || "").toLowerCase() === "hitl")
          .forEach((n) => setNodeExecutionState(n.id, "waiting_input"));
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          type: nextType,
          content: message,
          role: data.role ? String(data.role) : undefined,
          timestamp: new Date()
        }
      ]);
    };
    ws.onopen = () => {
      setMissionRunState("running", "runtime.ws.open");
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-open-${Date.now()}`,
          type: "system",
          content: "🚀 실행 조직 런타임을 시작합니다!",
          timestamp: new Date()
        }
      ]);
    };
    ws.onerror = async () => {
      // 서버 연동이 없을 때도 런타임 UX를 체험할 수 있도록 최소 시뮬레이션 유지
      if (hasLiveEvent) return;
      setMissionRunState("escalated", "runtime.ws.error");
      await runFallbackSimulation();
    };
    return () => ws.close();
  }, [nodes, params.id, setMissionRunState, setNodeExecutionState]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const q = new URLSearchParams(searchParams.toString());
    if (selectedMetricNode) q.set("node", selectedMetricNode);
    else q.delete("node");
    if (selectedArtifact) q.set("artifact", selectedArtifact);
    else q.delete("artifact");
    if (sideTab) q.set("tab", sideTab);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }, [pathname, router, searchParams, selectedArtifact, selectedMetricNode, sideTab]);

  const handleApprove = () => {
    setMissionRunState("retrying", "runtime.human.approve");
    setMessages((prev) => [
      ...prev,
      {
        id: `approve-${Date.now()}`,
        type: "system",
        content: "✅ 승인 완료. 다음 단계를 진행합니다.",
        timestamp: new Date()
      }
    ]);
    setStatus("running");
    setMissionRunState("running", "runtime.human.resume");
  };

  const timeline = messages.map((m) => ({
    ts: m.timestamp.toLocaleTimeString(),
    event: m.type === "agent" ? `${m.role || "worker"} completed` : m.content
  }));

  const artifactTrace = [
    {
      artifact: "requirements.md",
      from: "planner",
      to: "backend_team",
      status: "generated",
      version: "v3",
      owner: "planner",
      changes: ["scope refined", "acceptance criteria updated"]
    },
    {
      artifact: "api_spec.json",
      from: "backend_team",
      to: "qa_team",
      status: "reviewing",
      version: "v5",
      owner: "backend_executor",
      changes: ["new auth endpoint", "rate-limit schema added"]
    },
    {
      artifact: "build_report.txt",
      from: "qa_team",
      to: "deploy_team",
      status: status === "blocked" ? "blocked" : "ready",
      version: "v2",
      owner: "qa_reviewer",
      changes: ["2 flaky tests isolated", "coverage +3.2%"]
    }
  ];
  const selectedArtifactDetail =
    artifactTrace.find((a) => a.artifact === selectedArtifact) || artifactTrace[0];
  const selectedArtifactHistory = artifactVersions.filter((row) => row.artifact_id === selectedArtifactDetail.artifact);
  const sortedArtifactHistory = useMemo(() => {
    const parseVersion = (v: string) => Number(String(v).replace(/[^0-9]/g, "")) || 0;
    return [...selectedArtifactHistory].sort((a, b) => parseVersion(a.version) - parseVersion(b.version));
  }, [selectedArtifactHistory]);
  const artifactDiff = useMemo(() => {
    const latest = sortedArtifactHistory[sortedArtifactHistory.length - 1];
    const prev = sortedArtifactHistory[sortedArtifactHistory.length - 2];
    if (!latest || !prev) return { from: prev?.version || "-", to: latest?.version || "-", added: [] as string[], removed: [] as string[] };
    const tokenize = (summary: string) =>
      summary
        .split(/,|및|\/|->|→/g)
        .map((t) => t.trim())
        .filter(Boolean);
    const prevTokens = tokenize(prev.summary);
    const latestTokens = tokenize(latest.summary);
    return {
      from: prev.version,
      to: latest.version,
      added: latestTokens.filter((token) => !prevTokens.includes(token)),
      removed: prevTokens.filter((token) => !latestTokens.includes(token))
    };
  }, [sortedArtifactHistory]);

  const costBreakdown = [
    { provider: "Claude Opus", share: 62, cost: 18.42 },
    { provider: "GPT-4o", share: 21, cost: 6.23 },
    { provider: "Human Approval", share: 8, cost: 2.38 },
    { provider: "Others", share: 9, cost: 2.67 }
  ];
  const totalCost = costBreakdown.reduce((acc, row) => acc + row.cost, 0);
  const nodeMetrics = [
    { node: "Planner", tokens: 1840, latencyMs: 920, retries: 0 },
    { node: "Backend Executor", tokens: 6420, latencyMs: 2480, retries: 1 },
    { node: "QA Reviewer", tokens: 3110, latencyMs: 1890, retries: 0 },
    { node: "HITL Approver", tokens: 0, latencyMs: 5400, retries: 0 }
  ];
  const nodeRoleHints: Record<string, string[]> = {
    Planner: ["planner", "analyst"],
    "Backend Executor": ["developer", "backend"],
    "QA Reviewer": ["qa", "reviewer"],
    "HITL Approver": ["approver", "human"]
  };
  const filteredTimeline =
    timeline.filter((t) => {
      const nodeOk =
        !selectedMetricNode ||
        !nodeRoleHints[selectedMetricNode] ||
        nodeRoleHints[selectedMetricNode].some((hint) => t.event.toLowerCase().includes(hint.toLowerCase()));
      const artifactOk = !selectedArtifact || t.event.toLowerCase().includes(selectedArtifact.toLowerCase().split(".")[0]);
      return nodeOk && artifactOk;
    });

  const avgLatency =
    nodeMetrics.length > 0
      ? Math.round(nodeMetrics.reduce((acc, row) => acc + row.latencyMs, 0) / nodeMetrics.length)
      : 0;
  const totalRetries = nodeMetrics.reduce((acc, row) => acc + row.retries, 0);
  const successRate = nodeMetrics.length > 0 ? ((nodeMetrics.length - totalRetries) / nodeMetrics.length) * 100 : 0;
  const elapsedSec = Math.max(1, messages.length * 12);
  const runtimeHealth = status === "blocked" ? "attention" : status === "completed" ? "stable" : "running";
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
  const kpiByTab: Record<"timeline" | "artifacts" | "cost" | "metrics", Array<{ label: string; value: string }>> = {
    timeline: [
      { label: "시간", value: `${elapsedSec}s` },
      { label: "성공률", value: `${successRate.toFixed(0)}%` },
      { label: "비용", value: `$${totalCost.toFixed(2)}` },
      { label: "재시도", value: `${totalRetries}` }
    ],
    artifacts: [
      { label: "시간", value: `${elapsedSec}s` },
      { label: "성공률", value: `${successRate.toFixed(0)}%` },
      { label: "비용", value: `$${totalCost.toFixed(2)}` },
      { label: "재시도", value: `${totalRetries}` }
    ],
    cost: [
      { label: "시간", value: `${elapsedSec}s` },
      { label: "성공률", value: `${successRate.toFixed(0)}%` },
      { label: "비용", value: `$${totalCost.toFixed(2)}` },
      { label: "재시도", value: `${totalRetries}` }
    ],
    metrics: [
      { label: "시간", value: `${elapsedSec}s` },
      { label: "성공률", value: `${successRate.toFixed(0)}%` },
      { label: "비용", value: `$${totalCost.toFixed(2)}` },
      { label: "재시도", value: `${totalRetries}` }
    ]
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0A0A0A]">
      <div className="flex h-16 items-center justify-between border-b border-white/5 px-6">
        <div className="flex items-center space-x-4">
          <Link href="/studio" className="text-gray-500 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="flex items-center font-bold">
              💬 Workforce Runtime Log
              {status === "running" && <Loader2 className="ml-2 h-4 w-4 animate-spin text-blue-400" />}
            </h1>
            <div className="text-xs text-gray-500">Mission ID: {params.id} · state: {missionRunState}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="stat-chip px-2 py-1 text-gray-300">
            <Timer className="mr-1 inline h-3.5 w-3.5 text-blue-300" />
            ETA <span className="font-semibold text-blue-200">{elapsedSec}s</span>
          </div>
          <div className="stat-chip px-2 py-1 text-gray-300">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-emerald-300" />
            Success <span className="font-semibold text-emerald-200">{successRate.toFixed(0)}%</span>
          </div>
          <div className="stat-chip px-2 py-1 text-gray-300">
            <Coins className="mr-1 inline h-3.5 w-3.5 text-yellow-300" />
            Cost <span className="font-semibold text-yellow-200">${totalCost.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          {missionRunTransitionWarning && (
            <div className="flex items-center justify-between rounded-lg border border-rose-500/40 bg-rose-900/20 px-3 py-2 text-xs text-rose-200">
              <span>{missionRunTransitionWarning}</span>
              <button
                onClick={clearMissionRunTransitionWarning}
                className="rounded border border-rose-400/40 px-2 py-0.5 text-[11px] hover:bg-rose-900/30"
              >
                닫기
              </button>
            </div>
          )}
          <div className="panel-shell mb-1 bg-[#0d1117] px-3 py-2 text-xs text-gray-400">
            Event Stream · {messages.length} events · status {runtimeHealth}
          </div>
          {messages.map((msg) => (
            <div key={msg.id} className="flex space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800">
                {msg.type === "system" ? "🤖" : msg.type === "agent" ? "⚙️" : "⚠️"}
              </div>
              <div className="max-w-2xl flex-1">
                {msg.role && <div className="mb-1 text-xs font-bold uppercase text-gray-500">{msg.role}</div>}
                <div
                  className={`rounded-2xl p-4 text-sm ${
                    msg.type === "human_gate"
                      ? "border border-yellow-500/30 bg-yellow-500/10 text-yellow-100"
                      : "border border-white/10 bg-[#111111] text-gray-200"
                  }`}
                >
                  {msg.content}
                  {msg.type === "human_gate" && status === "blocked" && (
                    <div className="mt-4 flex space-x-2">
                      <button
                        onClick={handleApprove}
                        className="rounded-lg bg-yellow-500 px-4 py-2 font-bold text-black transition-colors hover:bg-yellow-400"
                      >
                        승인하고 계속 진행
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-1 text-xs text-gray-600">{msg.timestamp.toLocaleTimeString()}</div>
              </div>
            </div>
          ))}
          {messages.length === 0 && <div className="text-sm text-gray-600">실시간 이벤트 대기 중...</div>}
          <div ref={bottomRef} />
        </div>

        <aside className="w-[360px] border-l border-white/10 bg-[#0d1117] p-4">
          <div className="panel-shell mb-3 bg-black/30 px-3 py-2 text-xs text-gray-300">
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1 text-cyan-300">
                <Activity className="h-3.5 w-3.5" />
                Runtime Health
              </span>
              <span className={runtimeHealth === "attention" ? "text-yellow-300" : "text-emerald-300"}>{runtimeHealth}</span>
            </div>
            <div className="text-gray-500">mission_owner: local-owner · mode: workforce-runtime</div>
            <div className="mt-1 text-gray-500">MissionRunState: {missionRunState}</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {allowedMissionTransitions.map((next) => (
                <span key={next} className="stat-chip rounded px-1.5 py-0.5 text-[10px] text-gray-300">
                  {next}
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1">
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
            <div className="mt-2 max-h-[70px] space-y-1 overflow-y-auto text-[10px]">
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
                <div className="text-gray-500">no transitions</div>
              )}
            </div>
          </div>

          <div className="mb-3 flex gap-1 text-xs">
            {([
              ["timeline", "Timeline"],
              ["artifacts", "Artifacts"],
              ["cost", "Cost"],
              ["metrics", "Metrics"]
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSideTab(key)}
                className={`rounded px-2 py-1 ${sideTab === key ? "bg-blue-600 text-white" : "bg-white/5 text-gray-400"}`}
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
              <h3 className="font-semibold text-cyan-300">Event Timeline</h3>
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
            {(selectedMetricNode || selectedArtifact) && (
              <div className="mb-2 text-[11px] text-gray-500">
                filter: {selectedMetricNode || "all-node"} / {selectedArtifact || "all-artifact"}
              </div>
            )}
            <div className="max-h-44 space-y-2 overflow-y-auto text-xs">
              {filteredTimeline.map((t, idx) => (
                <div key={`${t.ts}-${idx}`} className="log-row px-2 py-1 text-gray-300">
                  <span className="mr-2 text-gray-500">{t.ts}</span>
                  <span>{t.event}</span>
                </div>
              ))}
              {filteredTimeline.length === 0 && (
                <div className="log-row px-2 py-1 text-gray-500">선택한 노드 기준 이벤트가 없습니다.</div>
              )}
            </div>
          </div>
          )}

          {sideTab === "artifacts" && (
            <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-green-300">Artifact Trace</h3>
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
            </div>
          </div>
          )}

          {sideTab === "artifacts" && (
            <div className="mt-4">
            <h3 className="mb-2 font-semibold text-emerald-300">Artifact Detail</h3>
            <div className="log-row px-2 py-2 text-xs">
              <div className="font-medium text-gray-200">{selectedArtifactDetail.artifact}</div>
              <div className="mt-1 text-gray-400">version: {selectedArtifactDetail.version}</div>
              <div className="text-gray-400">owner: {selectedArtifactDetail.owner}</div>
              <div className="mt-2 text-gray-300">changes:</div>
              <ul className="mt-1 list-disc pl-4 text-gray-400">
                {selectedArtifactDetail.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div className="mt-2 text-gray-300">version history:</div>
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
            <h3 className="mb-2 font-semibold text-yellow-300">Cost Stack</h3>
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
                Total: ${totalCost.toFixed(2)}
              </div>
            </div>
          </div>
          )}

          {sideTab === "metrics" && (
            <div className="mt-4">
            <h3 className="mb-2 font-semibold text-purple-300">Node Metrics</h3>
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
                    <span>tokens {m.tokens.toLocaleString()}</span>
                    <span>latency {m.latencyMs}ms</span>
                    <span>retry {m.retries}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">avg latency baseline: {avgLatency}ms</div>
                </button>
              ))}
            </div>
          </div>
          )}
        </aside>
      </div>

      <div className="border-t border-white/5 px-6 py-3 text-xs text-gray-600">
        상태: {status === "blocked" ? "승인 대기" : status === "completed" ? "완료" : "실행 중"} · mission_state: {missionRunState} · active_tab: {sideTab} · events: {messages.length}
      </div>
    </div>
  );
}
