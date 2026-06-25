import type { MemberFolder } from "../stores/app.store";
import type { Agent, ProjectUnit } from "../types";
import type { WorkspaceSettingsPayload } from "./api";

export const WORKSPACE_SETTINGS_CLIENT_VERSION = "workspace_settings_v4";

export function workspaceSettingsPayload(input: {
  hiredAgents?: WorkspaceSettingsPayload["hired_agents"];
  libraryAgents: Agent[];
  projectUnits: ProjectUnit[];
  memberFolders: MemberFolder[];
  agentFolderIds: Record<string, string>;
  nodes?: WorkspaceSettingsPayload["nodes"];
  edges?: WorkspaceSettingsPayload["edges"];
  nodeExecutionStates?: WorkspaceSettingsPayload["node_execution_states"];
  artifactVersions?: WorkspaceSettingsPayload["artifact_versions"];
  loopRegions?: WorkspaceSettingsPayload["loop_regions"];
}): WorkspaceSettingsPayload {
  return {
    client_version: WORKSPACE_SETTINGS_CLIENT_VERSION,
    hired_agents: input.hiredAgents || [],
    library_agents: input.libraryAgents,
    project_units: input.projectUnits,
    member_folders: input.memberFolders,
    agent_folder_ids: input.agentFolderIds,
    nodes: input.nodes || [],
    edges: input.edges || [],
    node_execution_states: input.nodeExecutionStates || {},
    artifact_versions: input.artifactVersions || [],
    loop_regions: input.loopRegions || []
  };
}

export function workspaceSettingsHasUserConfig(payload: WorkspaceSettingsPayload): boolean {
  return (
    (payload.hired_agents || []).length > 0 ||
    payload.library_agents.length > 0 ||
    payload.project_units.length > 0 ||
    payload.member_folders.length > 0 ||
    Object.keys(payload.agent_folder_ids).length > 0 ||
    (payload.nodes || []).length > 0 ||
    (payload.edges || []).length > 0 ||
    (payload.artifact_versions || []).length > 0 ||
    (payload.loop_regions || []).length > 0
  );
}

export function shouldSeedRemoteWorkspaceSettings(
  localPayload: WorkspaceSettingsPayload,
  remotePayload: WorkspaceSettingsPayload
): boolean {
  return workspaceSettingsHasUserConfig(localPayload) && !workspaceSettingsHasUserConfig(remotePayload);
}

function agentSignature(agent: Agent) {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    category: agent.category,
    required_api: agent.required_api,
    available: agent.available,
    creator: agent.creator,
    creator_avatar: agent.creator_avatar,
    rating: agent.rating,
    usage_count: agent.usage_count,
    royalty_per_use: agent.royalty_per_use,
    tags: agent.tags || [],
    is_featured: agent.is_featured,
    system_prompt: agent.system_prompt,
    input_type: agent.input_type,
    output_type: agent.output_type,
    model_name: agent.model_name,
    model_version: agent.model_version,
    updated_at: agent.updated_at,
    capabilities: agent.capabilities || [],
    ontology_unit: agent.ontology_unit,
    unit_role: agent.unit_role,
    responsibility: agent.responsibility,
    source_unit_id: agent.source_unit_id,
    source_unit_version: agent.source_unit_version,
    avg_latency_ms: agent.avg_latency_ms,
    success_rate: agent.success_rate,
    fail_rate: agent.fail_rate,
    reuse_rate: agent.reuse_rate,
    avg_cost: agent.avg_cost
  };
}

function projectUnitSignature(unit: ProjectUnit) {
  return {
    id: unit.id,
    base_unit_id: unit.base_unit_id,
    name: unit.name,
    label: unit.label,
    short_label: unit.short_label,
    description: unit.description,
    effect_summary: unit.effect_summary,
    member_role: unit.member_role,
    data_contract: unit.data_contract,
    responsibility: unit.responsibility,
    capabilities: unit.capabilities || [],
    success_metrics: unit.success_metrics || [],
    setup_steps: unit.setup_steps || [],
    cost_guidance: unit.cost_guidance,
    quality_guidance: unit.quality_guidance,
    default_category: unit.default_category,
    version: unit.version,
    versions: unit.versions || [],
    published: unit.published,
    published_at: unit.published_at,
    created_at: unit.created_at,
    updated_at: unit.updated_at,
    project_id: unit.project_id
  };
}

export function workspaceSettingsSignature(payload: WorkspaceSettingsPayload): string {
  return JSON.stringify({
    client_version: payload.client_version || WORKSPACE_SETTINGS_CLIENT_VERSION,
    hired_agents: (payload.hired_agents || []).map(agentSignature),
    library_agents: payload.library_agents.map(agentSignature),
    project_units: payload.project_units.map(projectUnitSignature),
    member_folders: payload.member_folders.map((folder) => ({
      id: folder.id,
      name: folder.name
    })),
    agent_folder_ids: Object.fromEntries(
      Object.entries(payload.agent_folder_ids)
        .map(([agentId, folderId]) => [agentId, String(folderId || "")])
        .filter(([agentId, folderId]) => agentId && folderId)
        .sort(([a], [b]) => a.localeCompare(b))
    ),
    nodes: (payload.nodes || []).map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data
    })),
    edges: (payload.edges || []).map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: edge.type,
      label: edge.label,
      data: edge.data,
      animated: edge.animated,
      style: edge.style
    })),
    node_execution_states: Object.fromEntries(
      Object.entries(payload.node_execution_states || {}).sort(([a], [b]) => a.localeCompare(b))
    ),
    artifact_versions: payload.artifact_versions || [],
    loop_regions: payload.loop_regions || []
  });
}
