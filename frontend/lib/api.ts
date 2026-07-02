import { apiUrl } from "./runtime-config";
import { buildAuthHeaders } from "./auth";
import type { SessionRole } from "./auth";
import { apiErrorMessage, asNumber, asRecord, asStringList, asText, fetchWithTimeout } from "./api-core";
import { memberToAgent, workspaceAgentToAgent } from "./api-agent-mappers";
import type { Edge, Node } from "reactflow";
import type {
  Agent,
  ArtifactVersion,
  MissionRunRecord,
  MissionRunState,
  NodeExecutionState,
  ProjectUnit
} from "../types";
import type { LoopRegion } from "../stores/app.store";

type BackendMember = Record<string, unknown>;
type BackendMission = Record<string, unknown>;
type BackendTask = Record<string, unknown>;

export type AuthWhoami = {
  user_id: string;
  role: SessionRole;
  source: "jwt" | "header";
};

export type HealthResponse = {
  status: "healthy" | "degraded" | "unhealthy" | string;
  service: string;
  database?: string;
  auth_mode?: string;
  key_storage?: string;
  runtime_providers?: string[];
  warnings?: string[];
};

export type AuthTokenResponse = {
  access_token: string;
  token_type: "bearer";
  expires_at: string;
  expires_in: number;
  user_id: string;
  role: SessionRole;
  auth_mode: "hybrid" | "jwt_only";
};

export type ProviderKeyStatus = {
  provider: string;
  registered: boolean;
  masked?: string | null;
  updated_at?: number | null;
};

export type SettlementRecord = {
  cycle?: string;
  period: string;
  receiver_team_id?: string;
  receiver_workflow_id?: string;
  provider_cost?: number;
  royalty_cost: number;
  platform_fee?: number;
  total_cost: number;
  entries: number;
};

export type CreateMissionInput = {
  goal: string;
  budget: number;
  useMock: boolean;
  workflowId?: string;
  workflowLabel?: string;
  workflowGraph?: Record<string, unknown>;
  autoMode?: boolean;
};

export type CreateMissionResponse = {
  mission_id: string;
  goal: string;
  budget: string;
  status: "started";
  workflow_id?: string | null;
  workflow_label?: string | null;
  team_id?: string | null;
  team_label?: string | null;
  message: string;
};

export type MissionTaskDetail = {
  id: string;
  description: string;
  role: string;
  dependencies: string[];
  status: string;
  artifacts: Record<string, unknown>;
  confidence: number;
  cost: number;
  retry_count: number;
  error_message?: string | null;
};

export type MissionDetail = {
  id: string;
  goal: string;
  status: MissionRunState;
  raw_status: string;
  total_cost: number;
  budget: number;
  created_at: string;
  finished_at?: string;
  owner_id: string;
  created_role?: string;
  use_mock?: boolean;
  auto_mode?: boolean;
  workflow_id?: string | null;
  workflow_label?: string | null;
  workflow_graph?: Record<string, unknown>;
  team_id?: string | null;
  team_label?: string | null;
  team_graph?: Record<string, unknown>;
  tasks: MissionTaskDetail[];
};

export type MissionTimelineEvent = {
  type: string;
  message?: string;
  timestamp?: number | string;
  mission_id?: string;
  task_id?: string;
  role?: string;
  [key: string]: unknown;
};

export type MissionTimelineResponse = {
  mission_id: string;
  events: MissionTimelineEvent[];
  count: number;
};

export type MissionArtifactsResponse = {
  mission_id: string;
  artifacts: Record<string, Record<string, unknown>>;
  total_tasks: number;
  completed_tasks: number;
};

export type MissionEvaluationsResponse = {
  mission_id: string;
  evaluations: MissionTimelineEvent[];
  count: number;
};

export type ApproveMissionResponse = {
  status: "approved";
  mission_id: string;
  task_id?: string | null;
  approved_by: string;
  timestamp: number | string;
  gate_stage?: string | null;
  notifications?: ApprovalNotification[];
};

export type RetryApprovalNotificationsResponse = {
  status: "retry_dispatched";
  mission_id: string;
  retried_count: number;
  notifications: ApprovalNotification[];
};

export type ApprovalNotification = {
  id: string;
  mission_id: string;
  task_id: string;
  gate_stage: string;
  channel: string;
  target: string;
  status: string;
  requested_at: number | string;
  updated_at: number | string;
  delivery_mode: string;
  delivery_status: string;
  delivery_transport: string;
  delivery_error?: string;
  delivery_attempted_at?: number | string;
  delivered_at?: number | string;
  approved_by?: string;
  approved_at?: number | string;
};

export type PendingApproval = {
  mission_id: string;
  task_id: string;
  role: string;
  gate_stage: string;
  approval_channels: string[];
  approval_target: string;
  requested_at: number | string;
  mission_goal: string;
  mission_status: string;
  owner_id?: string | null;
  runtime_active: boolean;
  can_approve: boolean;
  recovery_reason?: string;
  notifications: ApprovalNotification[];
};

export type PendingApprovalsResponse = {
  approvals: PendingApproval[];
  count: number;
};

export type ApprovalChannelId = "admin_queue" | "email" | "sms" | "kakao";

export type ApprovalChannelConfig = {
  enabled: boolean;
  delivery_mode: string;
  target: string;
  webhook_url: string;
};

export type ApprovalChannelSettings = {
  schema_version?: number;
  public_base_url: string;
  webhook_token?: string;
  clear_webhook_token?: boolean;
  webhook_token_registered: boolean;
  webhook_token_masked?: string | null;
  channels: Record<ApprovalChannelId, ApprovalChannelConfig>;
};

export type ApprovalChannelSettingsResponse = {
  user_id: string;
  settings: ApprovalChannelSettings;
  env_overrides?: Record<string, boolean>;
};

export type WorkspaceMemberFolder = {
  id: string;
  name: string;
};

export type WorkspaceSettingsPayload = {
  schema_version?: number;
  client_version?: string;
  hired_agents: Agent[];
  library_agents: Agent[];
  project_units: ProjectUnit[];
  member_folders: WorkspaceMemberFolder[];
  agent_folder_ids: Record<string, string>;
  nodes: Node[];
  edges: Edge[];
  node_execution_states: Record<string, NodeExecutionState>;
  artifact_versions: ArtifactVersion[];
  loop_regions: LoopRegion[];
  approval_channel_settings?: ApprovalChannelSettings;
  updated_at?: number;
};

export type WorkspaceSettingsResponse = {
  user_id: string;
  exists: boolean;
  settings: WorkspaceSettingsPayload;
};

function normalizeMissionState(value: unknown): MissionRunState {
  const raw = String(value || "queued").trim().toLowerCase();
  if (
    [
      "queued",
      "planning",
      "running",
      "blocked",
      "awaiting_approval",
      "retrying",
      "escalated",
      "completed",
      "failed",
      "cancelled"
    ].includes(raw)
  ) {
    return raw as MissionRunState;
  }
  return "queued";
}

export async function fetchWhoami(): Promise<AuthWhoami> {
  const res = await fetchWithTimeout(apiUrl("/api/auth/whoami"), { headers: buildAuthHeaders() });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_fetch_identity"));
  return (await res.json()) as AuthWhoami;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetchWithTimeout(apiUrl("/api/health"));
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_fetch_health"));
  return (await res.json()) as HealthResponse;
}

export async function issueSessionToken(input: {
  userId: string;
  role: SessionRole;
  ttlSeconds: number;
  adminToken: string;
}): Promise<AuthTokenResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.adminToken.trim()) {
    headers["X-Admin-Token"] = input.adminToken.trim();
  }
  const res = await fetchWithTimeout(apiUrl("/api/auth/token"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      user_id: input.userId,
      role: input.role,
      ttl_seconds: input.ttlSeconds
    })
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_issue_session_token"));
  return (await res.json()) as AuthTokenResponse;
}

export async function fetchKeyStatuses(): Promise<ProviderKeyStatus[]> {
  const res = await fetchWithTimeout(apiUrl("/api/keys/status"), { headers: buildAuthHeaders() });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_fetch_key_statuses"));
  const body = await res.json();
  return Array.isArray(body?.providers) ? (body.providers as ProviderKeyStatus[]) : [];
}

export async function registerProviderKey(input: {
  provider: string;
  apiKey: string;
  adminToken: string;
}): Promise<ProviderKeyStatus> {
  const headers = buildAuthHeaders({ "Content-Type": "application/json" });
  if (input.adminToken.trim()) {
    headers["X-Admin-Token"] = input.adminToken.trim();
  }
  const res = await fetchWithTimeout(apiUrl("/api/keys/register"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider: input.provider,
      api_key: input.apiKey
    })
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_register_key"));
  return (await res.json()) as ProviderKeyStatus;
}

export async function deleteProviderKey(input: { provider: string; adminToken: string }): Promise<ProviderKeyStatus> {
  const headers = buildAuthHeaders();
  if (input.adminToken.trim()) {
    headers["X-Admin-Token"] = input.adminToken.trim();
  }
  const res = await fetchWithTimeout(apiUrl(`/api/keys/${encodeURIComponent(input.provider)}`), {
    method: "DELETE",
    headers
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_delete_key"));
  return (await res.json()) as ProviderKeyStatus;
}

export async function createMission(input: CreateMissionInput): Promise<CreateMissionResponse> {
  const res = await fetchWithTimeout(apiUrl("/api/missions"), {
    method: "POST",
    headers: buildAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      goal: input.goal,
      budget: input.budget,
      use_mock: input.useMock,
      workflow_id: input.workflowId,
      workflow_label: input.workflowLabel,
      workflow_graph: input.workflowGraph,
      auto_mode: input.autoMode ?? true
    })
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_create_mission"));
  return (await res.json()) as CreateMissionResponse;
}

function taskToDetail(row: BackendTask): MissionTaskDetail {
  return {
    id: asText(row.id, "unknown-task"),
    description: asText(row.description, "작업 설명 없음"),
    role: asText(row.role, "worker"),
    dependencies: asStringList(row.dependencies),
    status: asText(row.status, "pending"),
    artifacts: asRecord(row.artifacts),
    confidence: asNumber(row.confidence, 0),
    cost: asNumber(row.cost, 0),
    retry_count: asNumber(row.retry_count, 0),
    error_message: typeof row.error_message === "string" ? row.error_message : null
  };
}

function missionToDetail(row: BackendMission): MissionDetail {
  const rawStatus = asText(row.status, "queued");
  const tasks = Array.isArray(row.tasks) ? row.tasks : [];
  const workflowId = typeof row.workflow_id === "string" ? row.workflow_id : typeof row.team_id === "string" ? row.team_id : null;
  const workflowLabel =
    typeof row.workflow_label === "string" ? row.workflow_label : typeof row.team_label === "string" ? row.team_label : null;
  const workflowGraph = asRecord(row.workflow_graph);
  const legacyGraph = asRecord(row.team_graph);
  const graph = Object.keys(workflowGraph).length ? workflowGraph : legacyGraph;
  return {
    id: asText(row.id, "unknown-mission"),
    goal: asText(row.goal, "Untitled mission"),
    status: normalizeMissionState(rawStatus),
    raw_status: rawStatus,
    total_cost: asNumber(row.total_cost, 0),
    budget: asNumber(row.budget, 0),
    created_at: asText(row.created_at, new Date().toISOString()),
    finished_at: asText(row.finished_at) || undefined,
    owner_id: asText(row.owner_id),
    created_role: asText(row.created_role),
    use_mock: typeof row.use_mock === "boolean" ? row.use_mock : undefined,
    auto_mode: typeof row.auto_mode === "boolean" ? row.auto_mode : undefined,
    workflow_id: workflowId,
    workflow_label: workflowLabel,
    workflow_graph: Object.keys(graph).length ? graph : undefined,
    team_id: workflowId,
    team_label: workflowLabel,
    team_graph: Object.keys(graph).length ? graph : undefined,
    tasks: tasks.map((item) => taskToDetail(asRecord(item)))
  };
}

function missionToRun(row: BackendMission): MissionRunRecord {
  const startedAt = asText(row.created_at, new Date().toISOString());
  const startedMs = Date.parse(startedAt);
  const finishedMs = Date.parse(asText(row.finished_at));
  const elapsedEnd = Number.isFinite(finishedMs) ? finishedMs : Date.now();
  const latencySec = Number.isFinite(startedMs) ? Math.max(1, Math.round((elapsedEnd - startedMs) / 1000)) : 1;
  const tasks = Array.isArray(row.tasks) ? row.tasks : [];
  return {
    id: asText(row.id, "unknown-mission"),
    goal: asText(row.goal, "Untitled mission"),
    state: normalizeMissionState(row.status),
    workflow_label: asText(row.workflow_label || row.team_label || row.owner_id, `runtime · ${tasks.length} tasks`),
    started_at: startedAt,
    est_cost_usd: asNumber(row.total_cost, asNumber(row.budget, 0)),
    latency_sec: latencySec,
    demo: false,
    owner_id: asText(row.owner_id)
  };
}

export async function fetchMissionDetail(id: string): Promise<MissionDetail> {
  const res = await fetchWithTimeout(apiUrl(`/api/missions/${encodeURIComponent(id)}`), { headers: buildAuthHeaders() });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_fetch_mission"));
  return missionToDetail((await res.json()) as BackendMission);
}

export async function fetchMissionTimeline(id: string): Promise<MissionTimelineResponse> {
  const res = await fetchWithTimeout(apiUrl(`/api/missions/${encodeURIComponent(id)}/timeline`), { headers: buildAuthHeaders() });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_fetch_mission_timeline"));
  const body = await res.json();
  const events = Array.isArray(body?.events) ? body.events : [];
  return {
    mission_id: asText(body?.mission_id, id),
    events: events.map((event: unknown) => asRecord(event) as MissionTimelineEvent),
    count: asNumber(body?.count, events.length)
  };
}

export async function fetchMissionArtifacts(id: string): Promise<MissionArtifactsResponse> {
  const res = await fetchWithTimeout(apiUrl(`/api/missions/${encodeURIComponent(id)}/artifacts`), { headers: buildAuthHeaders() });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_fetch_mission_artifacts"));
  const body = await res.json();
  const rawArtifacts = asRecord(body?.artifacts);
  const artifacts = Object.fromEntries(
    Object.entries(rawArtifacts).map(([taskId, value]) => [taskId, asRecord(value)])
  );
  return {
    mission_id: asText(body?.mission_id, id),
    artifacts,
    total_tasks: asNumber(body?.total_tasks, 0),
    completed_tasks: asNumber(body?.completed_tasks, Object.keys(artifacts).length)
  };
}

export async function fetchMissionEvaluations(id: string): Promise<MissionEvaluationsResponse> {
  const res = await fetchWithTimeout(apiUrl(`/api/missions/${encodeURIComponent(id)}/evaluations`), { headers: buildAuthHeaders() });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_fetch_mission_evaluations"));
  const body = await res.json();
  const evaluations = Array.isArray(body?.evaluations) ? body.evaluations : [];
  return {
    mission_id: asText(body?.mission_id, id),
    evaluations: evaluations.map((event: unknown) => asRecord(event) as MissionTimelineEvent),
    count: asNumber(body?.count, evaluations.length)
  };
}

export async function approveMissionGate(id: string): Promise<ApproveMissionResponse> {
  const res = await fetchWithTimeout(apiUrl(`/api/missions/${encodeURIComponent(id)}/approve`), {
    method: "POST",
    headers: buildAuthHeaders()
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_approve_mission"));
  return (await res.json()) as ApproveMissionResponse;
}

export async function retryApprovalNotifications(id: string): Promise<RetryApprovalNotificationsResponse> {
  const res = await fetchWithTimeout(apiUrl(`/api/missions/${encodeURIComponent(id)}/approval-notifications/retry`), {
    method: "POST",
    headers: buildAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({})
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_retry_approval_notifications"));
  const body = await res.json();
  const notifications = Array.isArray(body?.notifications) ? body.notifications : [];
  return {
    status: asText(body?.status, "retry_dispatched") as RetryApprovalNotificationsResponse["status"],
    mission_id: asText(body?.mission_id, id),
    retried_count: asNumber(body?.retried_count, notifications.length),
    notifications: notifications.map((row: unknown) => approvalNotificationToDetail(asRecord(row)))
  };
}

function approvalNotificationToDetail(row: Record<string, unknown>): ApprovalNotification {
  return {
    id: asText(row.id, ""),
    mission_id: asText(row.mission_id, "unknown-mission"),
    task_id: asText(row.task_id, ""),
    gate_stage: asText(row.gate_stage, "before_run"),
    channel: asText(row.channel, "admin_queue"),
    target: asText(row.target),
    status: asText(row.status, "queued"),
    requested_at: typeof row.requested_at === "number" ? row.requested_at : asText(row.requested_at, ""),
    updated_at: typeof row.updated_at === "number" ? row.updated_at : asText(row.updated_at, ""),
    delivery_mode: asText(row.delivery_mode, "internal_queue"),
    delivery_status: asText(row.delivery_status, row.channel === "admin_queue" ? "queued" : "pending"),
    delivery_transport: asText(row.delivery_transport, asText(row.delivery_mode, "internal_queue")),
    delivery_error: asText(row.delivery_error) || undefined,
    delivery_attempted_at:
      typeof row.delivery_attempted_at === "number" ? row.delivery_attempted_at : asText(row.delivery_attempted_at, "") || undefined,
    delivered_at: typeof row.delivered_at === "number" ? row.delivered_at : asText(row.delivered_at, "") || undefined,
    approved_by: asText(row.approved_by) || undefined,
    approved_at: typeof row.approved_at === "number" ? row.approved_at : asText(row.approved_at, "") || undefined
  };
}

function pendingApprovalToDetail(row: Record<string, unknown>): PendingApproval {
  const notifications = Array.isArray(row.notifications) ? row.notifications : [];
  return {
    mission_id: asText(row.mission_id, "unknown-mission"),
    task_id: asText(row.task_id, ""),
    role: asText(row.role, "worker"),
    gate_stage: asText(row.gate_stage, "before_run"),
    approval_channels: asStringList(row.approval_channels, ["admin_queue"]),
    approval_target: asText(row.approval_target),
    requested_at: typeof row.requested_at === "number" ? row.requested_at : asText(row.requested_at, ""),
    mission_goal: asText(row.mission_goal, "Untitled mission"),
    mission_status: asText(row.mission_status, "awaiting_approval"),
    owner_id: asText(row.owner_id) || null,
    runtime_active: typeof row.runtime_active === "boolean" ? row.runtime_active : true,
    can_approve: typeof row.can_approve === "boolean" ? row.can_approve : true,
    recovery_reason: asText(row.recovery_reason) || undefined,
    notifications: notifications.map((item: unknown) => approvalNotificationToDetail(asRecord(item)))
  };
}

const DEFAULT_APPROVAL_CHANNEL_SETTINGS: ApprovalChannelSettings = {
  schema_version: 1,
  public_base_url: "",
  webhook_token_registered: false,
  webhook_token_masked: null,
  channels: {
    admin_queue: { enabled: true, delivery_mode: "internal_queue", target: "운영 관리자", webhook_url: "" },
    email: { enabled: false, delivery_mode: "webhook", target: "", webhook_url: "" },
    sms: { enabled: false, delivery_mode: "webhook", target: "", webhook_url: "" },
    kakao: { enabled: false, delivery_mode: "webhook", target: "", webhook_url: "" }
  }
};

function approvalChannelConfigToDetail(row: Record<string, unknown>, fallback: ApprovalChannelConfig): ApprovalChannelConfig {
  return {
    enabled: typeof row.enabled === "boolean" ? row.enabled : fallback.enabled,
    delivery_mode: asText(row.delivery_mode, fallback.delivery_mode),
    target: asText(row.target, fallback.target),
    webhook_url: asText(row.webhook_url, fallback.webhook_url)
  };
}

function approvalChannelSettingsToDetail(row: Record<string, unknown>): ApprovalChannelSettings {
  const channels = asRecord(row.channels);
  return {
    schema_version: asNumber(row.schema_version, 1),
    public_base_url: asText(row.public_base_url),
    webhook_token_registered: Boolean(row.webhook_token_registered),
    webhook_token_masked: asText(row.webhook_token_masked) || null,
    channels: {
      admin_queue: approvalChannelConfigToDetail(asRecord(channels.admin_queue), DEFAULT_APPROVAL_CHANNEL_SETTINGS.channels.admin_queue),
      email: approvalChannelConfigToDetail(asRecord(channels.email), DEFAULT_APPROVAL_CHANNEL_SETTINGS.channels.email),
      sms: approvalChannelConfigToDetail(asRecord(channels.sms), DEFAULT_APPROVAL_CHANNEL_SETTINGS.channels.sms),
      kakao: approvalChannelConfigToDetail(asRecord(channels.kakao), DEFAULT_APPROVAL_CHANNEL_SETTINGS.channels.kakao)
    }
  };
}

export async function fetchPendingApprovals(): Promise<PendingApprovalsResponse> {
  const res = await fetchWithTimeout(apiUrl("/api/approvals/pending"), { headers: buildAuthHeaders() });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_fetch_pending_approvals"));
  const body = await res.json();
  const rows = Array.isArray(body?.approvals) ? body.approvals : [];
  return {
    approvals: rows.map((row: unknown) => pendingApprovalToDetail(asRecord(row))),
    count: asNumber(body?.count, rows.length)
  };
}

export async function fetchApprovalChannelSettings(): Promise<ApprovalChannelSettingsResponse> {
  const res = await fetchWithTimeout(apiUrl("/api/approval-channels/settings"), { headers: buildAuthHeaders() });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_fetch_approval_channel_settings"));
  const body = asRecord(await res.json());
  return {
    user_id: asText(body.user_id, "local-owner"),
    settings: approvalChannelSettingsToDetail(asRecord(body.settings)),
    env_overrides: asRecord(body.env_overrides) as Record<string, boolean>
  };
}

export async function saveApprovalChannelSettings(input: ApprovalChannelSettings): Promise<ApprovalChannelSettingsResponse> {
  const res = await fetchWithTimeout(apiUrl("/api/approval-channels/settings"), {
    method: "PUT",
    headers: buildAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ approval_channel_settings: input })
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_save_approval_channel_settings"));
  const body = asRecord(await res.json());
  return {
    user_id: asText(body.user_id, "local-owner"),
    settings: approvalChannelSettingsToDetail(asRecord(body.settings)),
    env_overrides: asRecord(body.env_overrides) as Record<string, boolean>
  };
}

function workspaceSettingsToResponse(body: Record<string, unknown>): WorkspaceSettingsResponse {
  const settings = asRecord(body.settings);
  const folders = Array.isArray(settings.member_folders) ? settings.member_folders : [];
  const hiredAgents = Array.isArray(settings.hired_agents) ? settings.hired_agents : [];
  const agents = Array.isArray(settings.library_agents) ? settings.library_agents : [];
  const projectUnits = Array.isArray(settings.project_units) ? settings.project_units : [];
  const nodes = Array.isArray(settings.nodes) ? settings.nodes : [];
  const edges = Array.isArray(settings.edges) ? settings.edges : [];
  const artifactVersions = Array.isArray(settings.artifact_versions) ? settings.artifact_versions : [];
  const loopRegions = Array.isArray(settings.loop_regions) ? settings.loop_regions : [];
  const rawFolderIds = asRecord(settings.agent_folder_ids);
  const rawNodeExecutionStates = asRecord(settings.node_execution_states);
  return {
    user_id: asText(body.user_id, "local-owner"),
    exists: Boolean(body.exists),
    settings: {
      schema_version: asNumber(settings.schema_version, 1),
      client_version: asText(settings.client_version, "workspace_settings_v4"),
      hired_agents: hiredAgents.map((agent: unknown) => workspaceAgentToAgent(asRecord(agent))),
      library_agents: agents.map((agent: unknown) => workspaceAgentToAgent(asRecord(agent))),
      project_units: projectUnits.map((unit: unknown) => asRecord(unit) as unknown as ProjectUnit),
      member_folders: folders
        .map((folder: unknown) => {
          const row = asRecord(folder);
          return { id: asText(row.id), name: asText(row.name) };
        })
        .filter((folder) => folder.id && folder.name),
      agent_folder_ids: Object.fromEntries(
        Object.entries(rawFolderIds)
          .map(([agentId, folderId]) => [agentId, String(folderId || "")])
          .filter(([agentId, folderId]) => agentId && folderId)
      ),
      nodes: nodes.map((node: unknown) => asRecord(node) as unknown as Node),
      edges: edges.map((edge: unknown) => asRecord(edge) as unknown as Edge),
      node_execution_states: Object.fromEntries(
        Object.entries(rawNodeExecutionStates).map(([nodeId, state]) => [nodeId, String(state) as NodeExecutionState])
      ),
      artifact_versions: artifactVersions.map((row: unknown) => asRecord(row) as unknown as ArtifactVersion),
      loop_regions: loopRegions.map((row: unknown) => asRecord(row) as unknown as LoopRegion),
      updated_at: typeof settings.updated_at === "number" ? settings.updated_at : undefined
      ,
      approval_channel_settings: approvalChannelSettingsToDetail(asRecord(settings.approval_channel_settings))
    }
  };
}

export async function fetchWorkspaceSettings(): Promise<WorkspaceSettingsResponse> {
  const res = await fetchWithTimeout(apiUrl("/api/workspace/settings"), { headers: buildAuthHeaders() });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_fetch_workspace_settings"));
  return workspaceSettingsToResponse(asRecord(await res.json()));
}

export async function saveWorkspaceSettings(input: WorkspaceSettingsPayload): Promise<WorkspaceSettingsResponse> {
  const res = await fetchWithTimeout(apiUrl("/api/workspace/settings"), {
    method: "PUT",
    headers: buildAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      hired_agents: input.hired_agents,
      library_agents: input.library_agents,
      project_units: input.project_units,
      member_folders: input.member_folders,
      agent_folder_ids: input.agent_folder_ids,
      nodes: input.nodes,
      edges: input.edges,
      node_execution_states: input.node_execution_states,
      artifact_versions: input.artifact_versions,
      loop_regions: input.loop_regions,
      ...(input.approval_channel_settings ? { approval_channel_settings: input.approval_channel_settings } : {}),
      client_version: input.client_version || "workspace_settings_v4"
    })
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_save_workspace_settings"));
  return workspaceSettingsToResponse(asRecord(await res.json()));
}

export async function fetchMarketAgents(params: {
  category?: string;
  search?: string;
  available_only?: boolean;
}): Promise<Agent[]> {
  const q = new URLSearchParams();
  if (params.category && params.category !== "전체") q.set("category", params.category);
  if (params.search) q.set("search", params.search);
  if (params.available_only) q.set("available_only", "true");
  q.set("is_ai", "true");
  q.set("published", "true");
  const res = await fetchWithTimeout(apiUrl(`/api/members?${q.toString()}`), { headers: buildAuthHeaders() });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_fetch_agents"));
  const body = await res.json();
  const rows = Array.isArray(body?.members) ? body.members : Array.isArray(body?.agents) ? body.agents : [];
  return rows.map(memberToAgent);
}

export async function fetchMarketAgent(id: string): Promise<Agent> {
  const res = await fetchWithTimeout(apiUrl(`/api/members/${encodeURIComponent(id)}`), { headers: buildAuthHeaders() });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_fetch_agent"));
  const body = await res.json();
  const row = body?.member || body?.agent;
  if (!row || typeof row !== "object") throw new Error("failed_to_fetch_agent:invalid_shape");
  return memberToAgent(row as BackendMember);
}

export async function fetchMissionRuns(): Promise<MissionRunRecord[]> {
  const res = await fetchWithTimeout(apiUrl("/api/missions"), { headers: buildAuthHeaders() });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_fetch_mission_runs"));
  const body = await res.json();
  const rows = Array.isArray(body) ? body : Array.isArray(body?.missions) ? body.missions : [];
  return rows.map(missionToRun);
}

export async function fetchSettlements(cycle: "daily" | "weekly" | "monthly" = "weekly"): Promise<SettlementRecord[]> {
  const query = new URLSearchParams({ cycle });
  const res = await fetchWithTimeout(apiUrl(`/api/ledger/settlements?${query.toString()}`), {
    headers: buildAuthHeaders()
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "failed_to_fetch_settlements"));
  const body = asRecord(await res.json());
  const rows = Array.isArray(body.settlements) ? body.settlements : [];
  return rows.map((value) => {
    const row = asRecord(value);
    return {
      cycle: asText(row.cycle, cycle),
      period: asText(row.period, "-"),
      receiver_team_id: asText(row.receiver_team_id) || undefined,
      receiver_workflow_id: asText(row.receiver_workflow_id) || undefined,
      provider_cost: asNumber(row.provider_cost, 0),
      royalty_cost: asNumber(row.royalty_cost, 0),
      platform_fee: asNumber(row.platform_fee, 0),
      total_cost: asNumber(row.total_cost, 0),
      entries: Math.max(0, Math.trunc(asNumber(row.entries, 0)))
    };
  });
}
