import { create } from "zustand";
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges
} from "reactflow";
import {
  Agent,
  AgentCategory,
  ArtifactVersion,
  MissionRunState,
  MissionRunTransitionRecord,
  MissionTransitionRejectReason,
  NodeExecutionState,
  SortOption
} from "../types";
import { MOCK_AGENTS } from "../lib/mock-data";

type TeamLink = {
  from: string;
  to: string;
  artifact: string;
  policy: string;
  sla: string;
  contract: string;
  schema: string;
  mode: string;
};

const MISSION_RUN_TRANSITIONS: Record<MissionRunState, MissionRunState[]> = {
  queued: ["planning", "cancelled"],
  planning: ["running", "failed", "cancelled", "escalated"],
  running: ["blocked", "awaiting_approval", "retrying", "completed", "failed", "escalated", "cancelled"],
  blocked: ["awaiting_approval", "retrying", "failed", "cancelled", "escalated"],
  awaiting_approval: ["running", "retrying", "failed", "cancelled", "escalated"],
  retrying: ["running", "failed", "cancelled", "escalated"],
  escalated: ["running", "failed", "cancelled"],
  completed: ["queued", "planning"],
  failed: ["queued", "planning", "cancelled"],
  cancelled: ["queued", "planning"]
};

function canTransitionMissionRunState(current: MissionRunState, next: MissionRunState): boolean {
  if (current === next) return true;
  return (MISSION_RUN_TRANSITIONS[current] || []).includes(next);
}

interface AppStore {
  activeTab: "agents" | "teams";
  category: AgentCategory;
  search: string;
  sort: SortOption;
  availableOnly: boolean;
  hiredAgents: Agent[];
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  missionRunState: MissionRunState;
  missionRunTransitionWarning: string | null;
  missionRunTransitionHistory: MissionRunTransitionRecord[];
  nodeExecutionStates: Record<string, NodeExecutionState>;
  artifactVersions: ArtifactVersion[];
  teamLinks: TeamLink[];
  setActiveTab: (tab: "agents" | "teams") => void;
  setCategory: (cat: AgentCategory) => void;
  setSearch: (q: string) => void;
  setSort: (s: SortOption) => void;
  setAvailableOnly: (v: boolean) => void;
  hireAgent: (agent: Agent) => void;
  fireAgent: (agentId: string) => void;
  isHired: (agentId: string) => boolean;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNodeFromAgent: (agent: Agent, position: { x: number; y: number }) => void;
  addUtilityNode: (
    utility: { kind: "router" | "hitl" | "team"; label: string; description: string },
    position: { x: number; y: number }
  ) => void;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  setSelectedNodeId: (id: string | null) => void;
  setMissionRunState: (state: MissionRunState, source?: string) => void;
  clearMissionRunTransitionWarning: () => void;
  clearMissionRunTransitionHistory: () => void;
  getAllowedMissionRunTransitions: (state?: MissionRunState) => MissionRunState[];
  setNodeExecutionState: (nodeId: string, state: NodeExecutionState) => void;
  addArtifactVersion: (artifact: ArtifactVersion) => void;
  clearCanvas: () => void;
  updateTeamLink: (index: number, patch: Partial<TeamLink>) => void;
  addTeamLink: (link: TeamLink) => void;
  removeTeamLink: (index: number) => void;
  duplicateTeamLink: (index: number) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  activeTab: "agents",
  category: "전체",
  search: "",
  sort: "recommended",
  availableOnly: false,
  hiredAgents: [MOCK_AGENTS[0], MOCK_AGENTS[1], MOCK_AGENTS[2]],
  nodes: [
    {
      id: "node-seed-1",
      type: "agentNode",
      position: { x: 60, y: 160 },
      data: {
        label: MOCK_AGENTS[0].name,
        avatar: MOCK_AGENTS[0].creator_avatar,
        category: MOCK_AGENTS[0].category,
        required_api: MOCK_AGENTS[0].required_api,
        royalty: MOCK_AGENTS[0].royalty_per_use,
        agent_id: MOCK_AGENTS[0].id,
        system_prompt: MOCK_AGENTS[0].description,
        execution_mode: "auto"
      }
    },
    {
      id: "node-seed-2",
      type: "agentNode",
      position: { x: 400, y: 160 },
      data: {
        label: MOCK_AGENTS[1].name,
        avatar: MOCK_AGENTS[1].creator_avatar,
        category: MOCK_AGENTS[1].category,
        required_api: MOCK_AGENTS[1].required_api,
        royalty: MOCK_AGENTS[1].royalty_per_use,
        agent_id: MOCK_AGENTS[1].id,
        system_prompt: MOCK_AGENTS[1].description,
        execution_mode: "confirm"
      }
    },
    {
      id: "node-seed-3",
      type: "agentNode",
      position: { x: 740, y: 160 },
      data: {
        label: MOCK_AGENTS[2].name,
        avatar: MOCK_AGENTS[2].creator_avatar,
        category: MOCK_AGENTS[2].category,
        required_api: MOCK_AGENTS[2].required_api,
        royalty: MOCK_AGENTS[2].royalty_per_use,
        agent_id: MOCK_AGENTS[2].id,
        system_prompt: MOCK_AGENTS[2].description,
        execution_mode: "auto"
      }
    }
  ],
  edges: [
    {
      id: "edge-seed-1",
      source: "node-seed-1",
      target: "node-seed-2",
      type: "smoothstep",
      animated: true,
      style: { stroke: "#4B5563", strokeWidth: 2 }
    },
    {
      id: "edge-seed-2",
      source: "node-seed-2",
      target: "node-seed-3",
      type: "smoothstep",
      animated: true,
      style: { stroke: "#4B5563", strokeWidth: 2 }
    }
  ],
  selectedNodeId: null,
  missionRunState: "queued",
  missionRunTransitionWarning: null,
  missionRunTransitionHistory: [],
  nodeExecutionStates: {
    "node-seed-1": "idle",
    "node-seed-2": "idle",
    "node-seed-3": "idle"
  },
  artifactVersions: [
    {
      artifact_id: "api_spec.json",
      version: "v3",
      parent_version: "v2",
      changed_by: "backend_executor",
      summary: "auth endpoint 및 rate-limit schema 업데이트",
      timestamp: "14:31:10"
    },
    {
      artifact_id: "api_spec.json",
      version: "v4",
      parent_version: "v3",
      changed_by: "qa_reviewer",
      summary: "validation rule 보강 및 경계값 케이스 추가",
      timestamp: "14:33:42"
    },
    {
      artifact_id: "requirements.md",
      version: "v2",
      parent_version: "v1",
      changed_by: "planner",
      summary: "실행 범위와 승인 기준 정교화",
      timestamp: "14:28:05"
    }
  ],
  teamLinks: [
    {
      from: "team-001",
      to: "team-002",
      artifact: "PR Diff",
      policy: "QA 승인 필요",
      sla: "15m",
      contract: "royalty 8%",
      schema: "pull_request.v2",
      mode: "approval_chain"
    },
    {
      from: "team-002",
      to: "team-001",
      artifact: "Content Brief",
      policy: "Direct Pass",
      sla: "10m",
      contract: "royalty 3%",
      schema: "brief.v1",
      mode: "direct_pass"
    },
    {
      from: "team-001",
      to: "team-002",
      artifact: "Risk Report",
      policy: "if risk_score > 0.8 → security_team",
      sla: "8m",
      contract: "royalty 5%",
      schema: "risk_report.v1",
      mode: "conditional_routing"
    }
  ],
  setActiveTab: (tab) => set({ activeTab: tab }),
  setCategory: (cat) => set({ category: cat }),
  setSearch: (q) => set({ search: q }),
  setSort: (s) => set({ sort: s }),
  setAvailableOnly: (v) => set({ availableOnly: v }),
  hireAgent: (agent) =>
    set((state) => ({
      hiredAgents: state.hiredAgents.find((a) => a.id === agent.id) ? state.hiredAgents : [...state.hiredAgents, agent]
    })),
  fireAgent: (agentId) =>
    set((state) => ({
      hiredAgents: state.hiredAgents.filter((a) => a.id !== agentId)
    })),
  isHired: (agentId) => get().hiredAgents.some((a) => a.id === agentId),
  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (connection) =>
    set({
      edges: addEdge(
        {
          ...connection,
          type: "smoothstep",
          style: { stroke: "#4B5563", strokeWidth: 2 },
          animated: true
        },
        get().edges
      )
    }),
  addNodeFromAgent: (agent, position) => {
    const node: Node = {
      id: `node_${Date.now()}`,
      type: "agentNode",
      position,
      data: {
        label: agent.name,
        avatar: agent.creator_avatar,
        category: agent.category,
        required_api: agent.required_api,
        royalty: agent.royalty_per_use,
        agent_id: agent.id,
        system_prompt: agent.description,
        execution_mode: "auto"
      }
    };
    set({
      nodes: [...get().nodes, node],
      nodeExecutionStates: { ...get().nodeExecutionStates, [node.id]: "idle" }
    });
  },
  addUtilityNode: (utility, position) => {
    const styleByKind: Record<string, { color: string; avatar: string }> = {
      router: { color: "#f59e0b", avatar: "🧭" },
      hitl: { color: "#eab308", avatar: "🙋" },
      team: { color: "#06b6d4", avatar: "🏢" }
    };
    const meta = styleByKind[utility.kind] || { color: "#6b7280", avatar: "🔧" };
    const node: Node = {
      id: `utility_${Date.now()}`,
      type: "utilityNode",
      position,
      data: {
        label: utility.label,
        avatar: meta.avatar,
        category: utility.kind.toUpperCase(),
        required_api: "internal",
        royalty: 0,
        agent_id: utility.kind,
        system_prompt: utility.description,
        execution_mode: utility.kind === "hitl" ? "confirm" : "auto",
        node_color: meta.color
      }
    };
    set({
      nodes: [...get().nodes, node],
      nodeExecutionStates: { ...get().nodeExecutionStates, [node.id]: "idle" }
    });
  },
  updateNodeData: (nodeId, data) =>
    set({
      nodes: get().nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node))
    }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setMissionRunState: (nextState, source = "system") =>
    set((state) => {
      const allowed = canTransitionMissionRunState(state.missionRunState, nextState);
      const rejectReason: MissionTransitionRejectReason | undefined = allowed ? undefined : "not_allowed_by_state_machine";
      const historyRow: MissionRunTransitionRecord = {
        from: state.missionRunState,
        to: nextState,
        allowed,
        timestamp: new Date().toISOString(),
        source,
        reject_reason: rejectReason
      };
      return allowed
        ? {
            missionRunState: nextState,
            missionRunTransitionWarning: null,
            missionRunTransitionHistory: [historyRow, ...state.missionRunTransitionHistory].slice(0, 120)
          }
        : {
            missionRunTransitionWarning: `invalid transition: ${state.missionRunState} -> ${nextState} (allowed: ${(MISSION_RUN_TRANSITIONS[state.missionRunState] || []).join(", ")})`,
            missionRunTransitionHistory: [historyRow, ...state.missionRunTransitionHistory].slice(0, 120)
          };
    }),
  clearMissionRunTransitionWarning: () => set({ missionRunTransitionWarning: null }),
  clearMissionRunTransitionHistory: () => set({ missionRunTransitionHistory: [] }),
  getAllowedMissionRunTransitions: (state) => MISSION_RUN_TRANSITIONS[state || get().missionRunState] || [],
  setNodeExecutionState: (nodeId, state) =>
    set({
      nodeExecutionStates: { ...get().nodeExecutionStates, [nodeId]: state }
    }),
  addArtifactVersion: (artifact) =>
    set({
      artifactVersions: [artifact, ...get().artifactVersions]
    }),
  clearCanvas: () =>
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      nodeExecutionStates: {},
      missionRunState: "queued",
      missionRunTransitionWarning: null,
      missionRunTransitionHistory: []
    }),
  updateTeamLink: (index, patch) =>
    set({
      teamLinks: get().teamLinks.map((row, i) => (i === index ? { ...row, ...patch } : row))
    }),
  addTeamLink: (link) =>
    set({
      teamLinks: [...get().teamLinks, link]
    }),
  removeTeamLink: (index) =>
    set({
      teamLinks: get().teamLinks.filter((_, i) => i !== index)
    }),
  duplicateTeamLink: (index) =>
    set({
      teamLinks: get().teamLinks[index]
        ? [
            ...get().teamLinks,
            {
              ...get().teamLinks[index],
              artifact: `${get().teamLinks[index].artifact} (copy)`
            }
          ]
        : get().teamLinks
    })
}));
