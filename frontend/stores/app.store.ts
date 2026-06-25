import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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
  OntologyUnitId,
  ProjectUnit,
  SortOption
} from "../types";
import { MOCK_AGENTS } from "../lib/mock-data";
import { isDemoModeEnabled } from "../lib/demo-mode";
import {
  createProjectUnitFromBase,
  createProjectUnitVersion,
  getAgentOntologyUnit,
  inferOntologyUnitId,
  nextProjectUnitVersion
} from "../lib/ontology";

const memoryStorage = new Map<string, string>();
const safeStateStorage = {
  getItem(name: string): string | null {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(name) : null;
      return stored ?? memoryStorage.get(name) ?? null;
    } catch {
      return memoryStorage.get(name) ?? null;
    }
  },
  setItem(name: string, value: string): void {
    memoryStorage.set(name, value);
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(name, value);
    } catch {
      // Keep the current session usable even when browser persistence is unavailable.
    }
  },
  removeItem(name: string): void {
    memoryStorage.delete(name);
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(name);
    } catch {
      // The in-memory copy has still been removed.
    }
  }
};

type ProjectUnitEditablePatch = Partial<
  Pick<
    ProjectUnit,
    | "base_unit_id"
    | "name"
    | "label"
    | "short_label"
    | "description"
    | "effect_summary"
    | "member_role"
    | "data_contract"
    | "responsibility"
    | "capabilities"
    | "success_metrics"
    | "setup_steps"
    | "cost_guidance"
    | "quality_guidance"
    | "default_category"
  >
>;

export type LoopRegion = {
  id: string;
  name: string;
  nodeIds: string[];
  startNodeId: string;
  endNodeId: string;
  exitNodeId: string;
  exitConditionNodeId?: string;
  repeatCount: number;
  exitCondition: string;
  createdAt: string;
};

export type MemberFolder = {
  id: string;
  name: string;
};

export const DEFAULT_MEMBER_FOLDERS: MemberFolder[] = [
  { id: "folder-dev", name: "개발" },
  { id: "folder-review", name: "검토" },
  { id: "folder-writing", name: "글쓰기" },
  { id: "folder-data", name: "데이터" },
  { id: "folder-design", name: "이미지" },
  { id: "folder-planning", name: "기획" }
];

const CATEGORY_FOLDER_IDS: Partial<Record<Exclude<AgentCategory, "전체">, string>> = {
  개발: "folder-dev",
  검토: "folder-review",
  글쓰기: "folder-writing",
  데이터: "folder-data",
  이미지: "folder-design",
  기획: "folder-planning"
};

const DEFAULT_IS_DEMO = isDemoModeEnabled();
const DEFAULT_HIRED_AGENTS = DEFAULT_IS_DEMO ? [MOCK_AGENTS[0], MOCK_AGENTS[1], MOCK_AGENTS[2]] : [];
const DEFAULT_LIBRARY_AGENTS = DEFAULT_IS_DEMO ? MOCK_AGENTS : [];
const DEFAULT_AGENT_FOLDER_IDS = DEFAULT_IS_DEMO
  ? Object.fromEntries(MOCK_AGENTS.map((agent) => [agent.id, getDefaultMemberFolderId(agent)]))
  : {};
const DEFAULT_NODES: Node[] = DEFAULT_IS_DEMO
  ? [
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
          ontology_unit: inferOntologyUnitId(MOCK_AGENTS[0]),
          unit_role: MOCK_AGENTS[0].unit_role || getAgentOntologyUnit(MOCK_AGENTS[0]).memberRole,
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
          ontology_unit: inferOntologyUnitId(MOCK_AGENTS[1]),
          unit_role: MOCK_AGENTS[1].unit_role || getAgentOntologyUnit(MOCK_AGENTS[1]).memberRole,
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
          ontology_unit: inferOntologyUnitId(MOCK_AGENTS[2]),
          unit_role: MOCK_AGENTS[2].unit_role || getAgentOntologyUnit(MOCK_AGENTS[2]).memberRole,
          system_prompt: MOCK_AGENTS[2].description,
          execution_mode: "auto"
        }
      }
    ]
  : [];
const DEFAULT_EDGES: Edge[] = DEFAULT_IS_DEMO
  ? [
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
    ]
  : [];
const DEFAULT_NODE_EXECUTION_STATES: Record<string, NodeExecutionState> = DEFAULT_IS_DEMO
  ? {
      "node-seed-1": "idle",
      "node-seed-2": "idle",
      "node-seed-3": "idle"
    }
  : {};

function wouldCreateCycle(nodes: Node[], edges: Edge[], sourceId: string, targetId: string): boolean {
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!nodeIds.has(sourceId) || !nodeIds.has(targetId) || sourceId === targetId) return true;
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = adjacency.get(edge.source) || [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
  }
  const stack = [targetId];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    if (current === sourceId) return true;
    visited.add(current);
    stack.push(...(adjacency.get(current) || []));
  }
  return false;
}

function sanitizeEdges(nodes: Node[], rawEdges: Edge[]): Edge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: Edge[] = [];
  for (const edge of rawEdges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) continue;
    if (edges.some((current) => current.source === edge.source && current.target === edge.target)) continue;
    if (wouldCreateCycle(nodes, edges, edge.source, edge.target)) continue;
    edges.push(edge);
  }
  return edges;
}

function sanitizeLoopRegions(nodes: Node[], regions: LoopRegion[]): LoopRegion[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return regions
    .map((region) => ({
      ...region,
      nodeIds: Array.from(new Set(region.nodeIds || [])).filter((nodeId) => nodeIds.has(nodeId)),
      repeatCount: Math.min(50, Math.max(1, Number(region.repeatCount) || 1))
    }))
    .filter(
      (region) =>
        region.nodeIds.length >= 2 &&
        region.nodeIds.includes(region.startNodeId) &&
        region.nodeIds.includes(region.endNodeId) &&
        (!region.exitNodeId || region.exitNodeId === "__finish__" || nodeIds.has(region.exitNodeId))
    );
}

let storeIdSequence = 0;

function uniqueStoreId(prefix: string): string {
  storeIdSequence += 1;
  return `${prefix}_${Date.now()}_${storeIdSequence.toString(36)}`;
}

export function getDefaultMemberFolderId(agent: Pick<Agent, "category">): string {
  return CATEGORY_FOLDER_IDS[agent.category] || "folder-planning";
}

function buildAgentFromProjectUnit(unit: ProjectUnit): Agent {
  return {
    id: uniqueStoreId(`unit-agent-${unit.id}`),
    name: `${unit.name} 담당자`,
    description: [unit.responsibility || unit.description, unit.effect_summary ? `효과: ${unit.effect_summary}` : ""]
      .filter(Boolean)
      .join("\n\n"),
    category: unit.default_category,
    required_api: "mock",
    available: true,
    creator: "project-unit",
    creator_avatar: "🧩",
    rating: 4.5,
    usage_count: 0,
    royalty_per_use: 0,
    tags: ["unit", unit.base_unit_id, unit.version, ...(unit.success_metrics || []).slice(0, 2)],
    capabilities: [...unit.capabilities, ...(unit.setup_steps || []).map((step) => `setup:${step}`)].slice(0, 12),
    ontology_unit: unit.base_unit_id,
    unit_role: unit.member_role,
    responsibility: unit.responsibility,
    source_unit_id: unit.id,
    source_unit_version: unit.version,
    model_name: "unit-runtime",
    model_version: unit.version,
    updated_at: new Date().toISOString()
  };
}

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
  category: AgentCategory;
  search: string;
  sort: SortOption;
  availableOnly: boolean;
  hiredAgents: Agent[];
  libraryAgents: Agent[];
  projectUnits: ProjectUnit[];
  memberFolders: MemberFolder[];
  agentFolderIds: Record<string, string>;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  missionRunState: MissionRunState;
  missionRunTransitionWarning: string | null;
  missionRunTransitionHistory: MissionRunTransitionRecord[];
  nodeExecutionStates: Record<string, NodeExecutionState>;
  artifactVersions: ArtifactVersion[];
  loopRegions: LoopRegion[];
  selectedLoopRegionId: string | null;
  setCategory: (cat: AgentCategory) => void;
  setSearch: (q: string) => void;
  setSort: (s: SortOption) => void;
  setAvailableOnly: (v: boolean) => void;
  hireAgent: (agent: Agent) => void;
  saveAgentToLibrary: (agent: Agent) => void;
  removeAgentFromLibrary: (agentId: string) => void;
  applyWorkspaceSettings: (settings: {
    hiredAgents?: Agent[];
    libraryAgents: Agent[];
    projectUnits: ProjectUnit[];
    memberFolders: MemberFolder[];
    agentFolderIds: Record<string, string>;
    nodes?: Node[];
    edges?: Edge[];
    nodeExecutionStates?: Record<string, NodeExecutionState>;
    artifactVersions?: ArtifactVersion[];
    loopRegions?: LoopRegion[];
  }) => void;
  resetUserWorkspace: () => void;
  createProjectUnit: (baseUnitId: OntologyUnitId, patch?: ProjectUnitEditablePatch) => string;
  updateProjectUnit: (
    unitId: string,
    patch: ProjectUnitEditablePatch,
    options?: { saveVersion?: boolean; note?: string }
  ) => void;
  duplicateProjectUnit: (unitId: string) => string | null;
  deleteProjectUnit: (unitId: string) => void;
  publishProjectUnit: (unitId: string) => void;
  unpublishProjectUnit: (unitId: string) => void;
  createAgentFromUnit: (unitId: string) => string | null;
  createWorkflowFromUnit: (unitId: string) => { agentId: string; nodeIds: string[] } | null;
  addMemberFolder: (folder: MemberFolder) => void;
  moveAgentToFolder: (agentId: string, folderId: string) => void;
  updateHiredAgent: (agentId: string, patch: Partial<Agent>) => void;
  fireAgent: (agentId: string) => void;
  isHired: (agentId: string) => boolean;
  isInLibrary: (agentId: string) => boolean;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  connectNodes: (
    sourceId: string,
    targetId: string,
    options?: { label?: string; condition?: string; animated?: boolean }
  ) => void;
  addNodeFromAgent: (agent: Agent, position: { x: number; y: number }, options?: { connectFromId?: string }) => void;
  addUtilityNode: (
    utility: { kind: "router" | "hitl"; label: string; description: string },
    position: { x: number; y: number },
    options?: { connectFromId?: string }
  ) => void;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  setSelectedNodeId: (id: string | null) => void;
  createLoopRegion: (region: Omit<LoopRegion, "id" | "createdAt"> & { id?: string; createdAt?: string }) => void;
  updateLoopRegion: (id: string, patch: Partial<Omit<LoopRegion, "id" | "createdAt">>) => void;
  removeLoopRegion: (id: string) => void;
  setSelectedLoopRegionId: (id: string | null) => void;
  setMissionRunState: (state: MissionRunState, source?: string) => void;
  resetMissionRunState: (state: MissionRunState, source?: string) => void;
  clearMissionRunTransitionWarning: () => void;
  clearMissionRunTransitionHistory: () => void;
  getAllowedMissionRunTransitions: (state?: MissionRunState) => MissionRunState[];
  setNodeExecutionState: (nodeId: string, state: NodeExecutionState) => void;
  addArtifactVersion: (artifact: ArtifactVersion) => void;
  replaceCanvas: (payload: {
    nodes: Node[];
    edges: Edge[];
    nodeExecutionStates?: Record<string, NodeExecutionState>;
    loopRegions?: LoopRegion[];
  }) => void;
  clearCanvas: () => void;
}

type PersistedAppState = Pick<
  AppStore,
  | "hiredAgents"
  | "libraryAgents"
  | "projectUnits"
  | "memberFolders"
  | "agentFolderIds"
  | "nodes"
  | "edges"
  | "nodeExecutionStates"
  | "artifactVersions"
  | "loopRegions"
>;

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
  category: "전체",
  search: "",
  sort: "recommended",
  availableOnly: false,
  hiredAgents: DEFAULT_HIRED_AGENTS,
  libraryAgents: DEFAULT_LIBRARY_AGENTS,
  projectUnits: [],
  memberFolders: DEFAULT_MEMBER_FOLDERS,
  agentFolderIds: DEFAULT_AGENT_FOLDER_IDS,
  nodes: DEFAULT_NODES,
  edges: DEFAULT_EDGES,
  selectedNodeId: null,
  missionRunState: "queued",
  missionRunTransitionWarning: null,
  missionRunTransitionHistory: [],
  nodeExecutionStates: DEFAULT_NODE_EXECUTION_STATES,
  artifactVersions: DEFAULT_IS_DEMO ? [
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
  ] : [],
  loopRegions: [],
  selectedLoopRegionId: null,
  setCategory: (cat) => set({ category: cat }),
  setSearch: (q) => set({ search: q }),
  setSort: (s) => set({ sort: s }),
  setAvailableOnly: (v) => set({ availableOnly: v }),
  hireAgent: (agent) =>
    set((state) => ({
      hiredAgents: state.hiredAgents.find((a) => a.id === agent.id) ? state.hiredAgents : [...state.hiredAgents, agent],
      libraryAgents: state.libraryAgents.find((a) => a.id === agent.id)
        ? state.libraryAgents.map((a) => (a.id === agent.id ? { ...a, ...agent } : a))
        : [agent, ...state.libraryAgents],
      agentFolderIds: {
        ...state.agentFolderIds,
        [agent.id]: state.agentFolderIds[agent.id] || getDefaultMemberFolderId(agent)
      }
    })),
  saveAgentToLibrary: (agent) =>
    set((state) => ({
      libraryAgents: state.libraryAgents.find((a) => a.id === agent.id)
        ? state.libraryAgents.map((a) => (a.id === agent.id ? { ...a, ...agent } : a))
        : [agent, ...state.libraryAgents],
      agentFolderIds: {
        ...state.agentFolderIds,
        [agent.id]: state.agentFolderIds[agent.id] || getDefaultMemberFolderId(agent)
      }
    })),
  removeAgentFromLibrary: (agentId) =>
    set((state) => {
      const nextAgentFolderIds = { ...state.agentFolderIds };
      delete nextAgentFolderIds[agentId];
      return {
        libraryAgents: state.libraryAgents.filter((agent) => agent.id !== agentId),
        agentFolderIds: nextAgentFolderIds
      };
    }),
  applyWorkspaceSettings: (settings) =>
    set((state) => {
      const nextNodes = settings.nodes ?? state.nodes;
      const nextEdges = settings.edges ?? state.edges;
      const nextNodeExecutionStates = settings.nodeExecutionStates ?? state.nodeExecutionStates;
      const nextLoopRegions = settings.loopRegions ?? state.loopRegions;
      return {
        hiredAgents: settings.hiredAgents ?? state.hiredAgents,
        libraryAgents: settings.libraryAgents,
        projectUnits: settings.projectUnits,
        memberFolders: settings.memberFolders.length > 0 ? settings.memberFolders : state.memberFolders,
        agentFolderIds: settings.agentFolderIds,
        nodes: nextNodes,
        edges: sanitizeEdges(nextNodes, nextEdges),
        selectedNodeId: null,
        nodeExecutionStates: Object.fromEntries(
          nextNodes.map((node) => [node.id, nextNodeExecutionStates[node.id] || "idle"])
        ),
        artifactVersions: settings.artifactVersions ?? state.artifactVersions,
        loopRegions: sanitizeLoopRegions(nextNodes, nextLoopRegions),
        selectedLoopRegionId: null,
        missionRunState: "queued",
        missionRunTransitionWarning: null,
        missionRunTransitionHistory: []
      };
    }),
  resetUserWorkspace: () =>
    set({
      hiredAgents: [],
      libraryAgents: [],
      projectUnits: [],
      memberFolders: DEFAULT_MEMBER_FOLDERS,
      agentFolderIds: {},
      nodes: [],
      edges: [],
      selectedNodeId: null,
      missionRunState: "queued",
      missionRunTransitionWarning: null,
      missionRunTransitionHistory: [],
      nodeExecutionStates: {},
      artifactVersions: [],
      loopRegions: [],
      selectedLoopRegionId: null
    }),
  createProjectUnit: (baseUnitId, patch) => {
    const unit = createProjectUnitFromBase(baseUnitId, patch);
    set((state) => ({
      projectUnits: [unit, ...state.projectUnits]
    }));
    return unit.id;
  },
  updateProjectUnit: (unitId, patch, options) =>
    set((state) => {
      const now = new Date().toISOString();
      return {
        projectUnits: state.projectUnits.map((unit) => {
          if (unit.id !== unitId) return unit;
          const nextBase: ProjectUnit = {
            ...unit,
            ...patch,
            id: unit.id,
            capabilities: patch.capabilities ? [...patch.capabilities] : unit.capabilities,
            success_metrics: patch.success_metrics ? [...patch.success_metrics] : unit.success_metrics,
            setup_steps: patch.setup_steps ? [...patch.setup_steps] : unit.setup_steps,
            created_at: unit.created_at,
            updated_at: now
          };
          if (!options?.saveVersion) return nextBase;
          const versioned: ProjectUnit = {
            ...nextBase,
            version: nextProjectUnitVersion(unit.version),
            updated_at: now
          };
          return {
            ...versioned,
            versions: [createProjectUnitVersion(versioned, options.note || "Unit 버전 저장", now), ...unit.versions].slice(
              0,
              20
            )
          };
        })
      };
    }),
  duplicateProjectUnit: (unitId) => {
    const unit = get().projectUnits.find((item) => item.id === unitId);
    if (!unit) return null;
    const now = new Date().toISOString();
    const copy: ProjectUnit = {
      ...unit,
      id: uniqueStoreId(`unit-copy-${unit.base_unit_id}`),
      name: `${unit.name} Copy`,
      version: "v1",
      versions: [],
      published: false,
      published_at: undefined,
      created_at: now,
      updated_at: now
    };
    copy.versions = [createProjectUnitVersion(copy, `복제 원본: ${unit.name}`, now)];
    set((state) => ({
      projectUnits: [copy, ...state.projectUnits]
    }));
    return copy.id;
  },
  deleteProjectUnit: (unitId) =>
    set((state) => ({
      projectUnits: state.projectUnits.filter((unit) => unit.id !== unitId)
    })),
  publishProjectUnit: (unitId) =>
    set((state) => {
      const now = new Date().toISOString();
      return {
        projectUnits: state.projectUnits.map((unit) => {
          if (unit.id !== unitId) return unit;
          const nextUnit = {
            ...unit,
            published: true,
            published_at: now,
            updated_at: now
          };
          const hasCurrentVersion = unit.versions.some((version) => version.version === unit.version);
          return {
            ...nextUnit,
            versions: hasCurrentVersion
              ? unit.versions
              : [createProjectUnitVersion(nextUnit, "프로젝트 마켓 게시", now), ...unit.versions].slice(0, 20)
          };
        })
      };
    }),
  unpublishProjectUnit: (unitId) =>
    set((state) => ({
      projectUnits: state.projectUnits.map((unit) =>
        unit.id === unitId ? { ...unit, published: false, updated_at: new Date().toISOString() } : unit
      )
    })),
  createAgentFromUnit: (unitId) => {
    const unit = get().projectUnits.find((item) => item.id === unitId);
    if (!unit) return null;
    const agent = buildAgentFromProjectUnit(unit);
    set((state) => ({
      hiredAgents: state.hiredAgents.find((item) => item.id === agent.id) ? state.hiredAgents : [agent, ...state.hiredAgents],
      libraryAgents: state.libraryAgents.find((item) => item.id === agent.id)
        ? state.libraryAgents
        : [agent, ...state.libraryAgents],
      agentFolderIds: {
        ...state.agentFolderIds,
        [agent.id]: getDefaultMemberFolderId(agent)
      }
    }));
    return agent.id;
  },
  createWorkflowFromUnit: (unitId) => {
    const unit = get().projectUnits.find((item) => item.id === unitId);
    if (!unit) return null;
    const agent = buildAgentFromProjectUnit(unit);
    const steps = unit.setup_steps.length > 0 ? unit.setup_steps : [unit.responsibility || unit.name];
    const current = get();
    const startIndex = current.nodes.length;
    const startX = 80 + (startIndex % 3) * 280;
    const startY = 140 + Math.floor(startIndex / 3) * 170;
    const nodeIds: string[] = [];
    const nodes: Node[] = steps.map((step, index) => {
      const nodeId = uniqueStoreId(`node_${unit.base_unit_id}`);
      nodeIds.push(nodeId);
      return {
        id: nodeId,
        type: "agentNode",
        position: {
          x: startX + index * 280,
          y: startY
        },
        data: {
          label: `${index + 1}. ${step}`,
          avatar: agent.creator_avatar,
          category: agent.category,
          required_api: agent.required_api,
          royalty: agent.royalty_per_use,
          agent_id: agent.id,
          ontology_unit: unit.base_unit_id,
          unit_role: unit.member_role,
          unit_id: unit.id,
          unit_version: unit.version,
          system_prompt: [
            unit.responsibility,
            `단계 목표: ${step}`,
            unit.data_contract ? `데이터 계약: ${unit.data_contract}` : "",
            unit.success_metrics.length ? `완료 기준: ${unit.success_metrics.join(", ")}` : ""
          ]
            .filter(Boolean)
            .join("\n"),
          execution_mode: "auto",
          condition_mode: "always"
        }
      } as Node;
    });
    const previousNodeId = current.nodes[current.nodes.length - 1]?.id;
    const edges: Edge[] = [];
    if (previousNodeId && nodeIds[0]) {
      edges.push({
        id: uniqueStoreId(`edge_${previousNodeId}_${nodeIds[0]}`),
        source: previousNodeId,
        target: nodeIds[0],
        type: "smoothstep",
        animated: true,
        style: { stroke: "#4B5563", strokeWidth: 2 }
      } as Edge);
    }
    for (let index = 1; index < nodeIds.length; index += 1) {
      edges.push({
        id: uniqueStoreId(`edge_${nodeIds[index - 1]}_${nodeIds[index]}`),
        source: nodeIds[index - 1],
        target: nodeIds[index],
        type: "smoothstep",
        animated: true,
        label: `step ${index + 1}`,
        data: { unit_id: unit.id, step_index: index + 1 },
        style: { stroke: "#38bdf8", strokeWidth: 2 }
      } as Edge);
    }
    set((state) => ({
      hiredAgents: state.hiredAgents.find((item) => item.id === agent.id) ? state.hiredAgents : [agent, ...state.hiredAgents],
      libraryAgents: state.libraryAgents.find((item) => item.id === agent.id) ? state.libraryAgents : [agent, ...state.libraryAgents],
      agentFolderIds: {
        ...state.agentFolderIds,
        [agent.id]: getDefaultMemberFolderId(agent)
      },
      nodes: [...state.nodes, ...nodes],
      edges: [...state.edges, ...edges],
      selectedNodeId: nodeIds[nodeIds.length - 1] || state.selectedNodeId,
      nodeExecutionStates: {
        ...state.nodeExecutionStates,
        ...Object.fromEntries(nodeIds.map((nodeId) => [nodeId, "idle" as NodeExecutionState]))
      }
    }));
    return { agentId: agent.id, nodeIds };
  },
  addMemberFolder: (folder) =>
    set((state) =>
      state.memberFolders.some((existing) => existing.id === folder.id || existing.name === folder.name)
        ? {}
        : { memberFolders: [...state.memberFolders, folder] }
    ),
  moveAgentToFolder: (agentId, folderId) =>
    set((state) => ({
      agentFolderIds: { ...state.agentFolderIds, [agentId]: folderId }
    })),
  updateHiredAgent: (agentId, patch) =>
    set((state) => {
      const current = state.hiredAgents.find((agent) => agent.id === agentId);
      if (!current) return {};
      const nextAgent = { ...current, ...patch, id: current.id };
      return {
        hiredAgents: state.hiredAgents.map((agent) => (agent.id === agentId ? nextAgent : agent)),
        libraryAgents: state.libraryAgents.map((agent) => (agent.id === agentId ? { ...agent, ...patch, id: agent.id } : agent)),
        nodes: state.nodes.map((node) => {
          if (String((node.data as any)?.agent_id || "") !== agentId) return node;
          return {
            ...node,
            data: {
              ...node.data,
              label: nextAgent.name,
              avatar: nextAgent.creator_avatar,
              category: nextAgent.category,
              required_api: nextAgent.required_api,
              royalty: nextAgent.royalty_per_use,
              ontology_unit: inferOntologyUnitId(nextAgent),
              unit_role: nextAgent.unit_role || getAgentOntologyUnit(nextAgent).memberRole,
              system_prompt: nextAgent.description
            }
          };
        })
      };
    }),
  fireAgent: (agentId) =>
    set((state) => ({
      hiredAgents: state.hiredAgents.filter((a) => a.id !== agentId)
    })),
  isHired: (agentId) => get().hiredAgents.some((a) => a.id === agentId),
  isInLibrary: (agentId) => get().libraryAgents.some((a) => a.id === agentId),
  onNodesChange: (changes) =>
    set((state) => {
      const nodes = applyNodeChanges(changes, state.nodes);
      const nodeIds = new Set(nodes.map((node) => node.id));
      const nodeExecutionStates = Object.fromEntries(
        Object.entries(state.nodeExecutionStates).filter(([nodeId]) => nodeIds.has(nodeId))
      );
      const loopRegions = sanitizeLoopRegions(nodes, state.loopRegions);
      const selectedLoopRegionId = loopRegions.some((region) => region.id === state.selectedLoopRegionId)
        ? state.selectedLoopRegionId
        : null;
      return {
        nodes,
        edges: state.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
        selectedNodeId: state.selectedNodeId && nodeIds.has(state.selectedNodeId) ? state.selectedNodeId : null,
        nodeExecutionStates,
        loopRegions,
        selectedLoopRegionId
      };
    }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (connection) =>
    set((state) => {
      const sourceId = connection.source || "";
      const targetId = connection.target || "";
      if (wouldCreateCycle(state.nodes, state.edges, sourceId, targetId)) return {};
      if (state.edges.some((edge) => edge.source === sourceId && edge.target === targetId)) return {};
      return {
        edges: addEdge(
          {
            ...connection,
            type: "smoothstep",
            style: { stroke: "#4B5563", strokeWidth: 2 },
            animated: true
          },
          state.edges
        )
      };
    }),
  connectNodes: (sourceId, targetId, options) =>
    set((state) => {
      if (!sourceId || !targetId || sourceId === targetId) return {};
      const hasSource = state.nodes.some((node) => node.id === sourceId);
      const hasTarget = state.nodes.some((node) => node.id === targetId);
      if (!hasSource || !hasTarget) return {};
      const duplicate = state.edges.some((edge) => edge.source === sourceId && edge.target === targetId);
      if (duplicate) return { selectedNodeId: targetId };
      if (wouldCreateCycle(state.nodes, state.edges, sourceId, targetId)) return {};
      const condition = options?.condition?.trim();
      const edge: Edge = {
        id: `edge_${sourceId}_${targetId}_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
        source: sourceId,
        target: targetId,
        type: "smoothstep",
        animated: options?.animated ?? true,
        label: options?.label || (condition ? `if ${condition}` : undefined),
        data: condition ? { condition } : undefined,
        style: { stroke: condition ? "#f59e0b" : "#4B5563", strokeWidth: 2 }
      };
      return {
        edges: [...state.edges, edge],
        selectedNodeId: targetId
      };
    }),
  addNodeFromAgent: (agent, position, options) => {
    const current = get();
    const node: Node = {
      id: uniqueStoreId("node"),
      type: "agentNode",
      position,
      data: {
        label: agent.name,
        avatar: agent.creator_avatar,
        category: agent.category,
        required_api: agent.required_api,
        royalty: agent.royalty_per_use,
        agent_id: agent.id,
        ontology_unit: inferOntologyUnitId(agent),
        unit_role: agent.unit_role || getAgentOntologyUnit(agent).memberRole,
        system_prompt: agent.description,
        execution_mode: "auto"
      }
    };
    const sourceId = options?.connectFromId;
    const shouldConnect = sourceId && current.nodes.some((existing) => existing.id === sourceId);
    const nextEdges = shouldConnect
      ? [
          ...current.edges,
          {
            id: uniqueStoreId(`edge_${sourceId}_${node.id}`),
            source: sourceId,
            target: node.id,
            type: "smoothstep",
            animated: true,
            style: { stroke: "#4B5563", strokeWidth: 2 }
          } as Edge
        ]
      : current.edges;
    set({
      nodes: [...current.nodes, node],
      edges: nextEdges,
      selectedNodeId: node.id,
      nodeExecutionStates: { ...current.nodeExecutionStates, [node.id]: "idle" }
    });
  },
  addUtilityNode: (utility, position, options) => {
    const current = get();
    const styleByKind: Record<string, { color: string; avatar: string }> = {
      router: { color: "#f59e0b", avatar: "🧭" },
      hitl: { color: "#eab308", avatar: "🙋" }
    };
    const meta = styleByKind[utility.kind] || { color: "#6b7280", avatar: "🔧" };
    const node: Node = {
      id: uniqueStoreId("utility"),
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
        condition_mode: utility.kind === "router" ? "condition" : "always",
        node_color: meta.color
      }
    };
    const sourceId = options?.connectFromId;
    const shouldConnect = sourceId && current.nodes.some((existing) => existing.id === sourceId);
    const nextEdges = shouldConnect
      ? [
          ...current.edges,
          {
            id: uniqueStoreId(`edge_${sourceId}_${node.id}`),
            source: sourceId,
            target: node.id,
            type: "smoothstep",
            animated: true,
            style: { stroke: "#4B5563", strokeWidth: 2 }
          } as Edge
        ]
      : current.edges;
    set({
      nodes: [...current.nodes, node],
      edges: nextEdges,
      selectedNodeId: node.id,
      nodeExecutionStates: { ...current.nodeExecutionStates, [node.id]: "idle" }
    });
  },
  updateNodeData: (nodeId, data) =>
    set({
      nodes: get().nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node))
    }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  createLoopRegion: (region) =>
    set((state) => {
      const id = region.id || `loop_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
      const nextRegion: LoopRegion = {
        ...region,
        id,
        createdAt: region.createdAt || new Date().toISOString(),
        nodeIds: Array.from(new Set(region.nodeIds)).filter((nodeId) => state.nodes.some((node) => node.id === nodeId)),
        repeatCount: Math.min(50, Math.max(1, Number(region.repeatCount) || 1))
      };
      if (
        nextRegion.nodeIds.length < 2 ||
        !nextRegion.nodeIds.includes(nextRegion.startNodeId) ||
        !nextRegion.nodeIds.includes(nextRegion.endNodeId)
      ) {
        return {};
      }
      return {
        loopRegions: [...state.loopRegions.filter((item) => item.id !== id), nextRegion],
        selectedLoopRegionId: id
      };
    }),
  updateLoopRegion: (id, patch) =>
    set((state) => {
      const nextRegions = state.loopRegions.map((region) =>
        region.id === id
          ? {
              ...region,
              ...patch,
              nodeIds: patch.nodeIds ? Array.from(new Set(patch.nodeIds)) : region.nodeIds,
              repeatCount:
                patch.repeatCount === undefined
                  ? region.repeatCount
                  : Math.min(50, Math.max(1, Number(patch.repeatCount) || 1))
            }
          : region
      );
      const loopRegions = sanitizeLoopRegions(state.nodes, nextRegions);
      return {
        loopRegions,
        selectedLoopRegionId: loopRegions.some((region) => region.id === state.selectedLoopRegionId)
          ? state.selectedLoopRegionId
          : null
      };
    }),
  removeLoopRegion: (id) =>
    set((state) => ({
      loopRegions: state.loopRegions.filter((region) => region.id !== id),
      selectedLoopRegionId: state.selectedLoopRegionId === id ? null : state.selectedLoopRegionId
    })),
  setSelectedLoopRegionId: (id) => set({ selectedLoopRegionId: id }),
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
  resetMissionRunState: (nextState, source = "system.reset") =>
    set((state) => {
      const historyRow: MissionRunTransitionRecord = {
        from: state.missionRunState,
        to: nextState,
        allowed: true,
        timestamp: new Date().toISOString(),
        source,
        reset: true
      };
      return {
        missionRunState: nextState,
        missionRunTransitionWarning: null,
        missionRunTransitionHistory: [historyRow]
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
  replaceCanvas: (payload) =>
    set({
      nodes: payload.nodes,
      edges: payload.edges,
      selectedNodeId: null,
      loopRegions: payload.loopRegions || [],
      selectedLoopRegionId: null,
      nodeExecutionStates:
        payload.nodeExecutionStates ||
        Object.fromEntries(payload.nodes.map((node) => [node.id, "idle" as NodeExecutionState])),
      missionRunState: "queued",
      missionRunTransitionWarning: null,
      missionRunTransitionHistory: []
    }),
  clearCanvas: () =>
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      loopRegions: [],
      selectedLoopRegionId: null,
      nodeExecutionStates: {},
      missionRunState: "queued",
      missionRunTransitionWarning: null,
      missionRunTransitionHistory: []
    })
}),
    {
      name: "bremen.workspace.v1",
      storage: createJSONStorage(() => safeStateStorage),
      partialize: (state): PersistedAppState => ({
        hiredAgents: state.hiredAgents,
        libraryAgents: state.libraryAgents,
        projectUnits: state.projectUnits,
        memberFolders: state.memberFolders,
        agentFolderIds: state.agentFolderIds,
        nodes: state.nodes,
        edges: state.edges,
        nodeExecutionStates: state.nodeExecutionStates,
        artifactVersions: state.artifactVersions,
        loopRegions: state.loopRegions
      }),
      version: 2,
      migrate: (persistedState) => {
        const state = (persistedState || {}) as Partial<PersistedAppState>;
        const nodes = Array.isArray(state.nodes) ? state.nodes : [];
        const edges = sanitizeEdges(nodes, Array.isArray(state.edges) ? state.edges : []);
        return {
          hiredAgents: Array.isArray(state.hiredAgents) ? state.hiredAgents : [],
          libraryAgents: Array.isArray(state.libraryAgents) ? state.libraryAgents : [],
          projectUnits: Array.isArray(state.projectUnits) ? state.projectUnits : [],
          memberFolders:
            Array.isArray(state.memberFolders) && state.memberFolders.length > 0
              ? state.memberFolders
              : DEFAULT_MEMBER_FOLDERS,
          agentFolderIds:
            state.agentFolderIds && typeof state.agentFolderIds === "object" ? state.agentFolderIds : {},
          nodes,
          edges,
          nodeExecutionStates:
            state.nodeExecutionStates && typeof state.nodeExecutionStates === "object"
              ? state.nodeExecutionStates
              : {},
          artifactVersions: Array.isArray(state.artifactVersions) ? state.artifactVersions : [],
          loopRegions: sanitizeLoopRegions(nodes, Array.isArray(state.loopRegions) ? state.loopRegions : [])
        } satisfies PersistedAppState;
      }
    }
  )
);
