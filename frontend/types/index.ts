export type APIProvider = "openai" | "anthropic" | "gemini" | "stability" | "google" | "mock";
export type AgentCategory = "전체" | "개발" | "글쓰기" | "이미지" | "데이터" | "검토" | "번역" | "기획";
export type OntologyUnitId =
  | "workflow"
  | "agent_profile"
  | "canvas_node"
  | "role_binding"
  | "mission_run"
  | "cost_ledger";
export type SortOption = "recommended" | "rating" | "usage" | "price_low";
export type MissionRunState =
  | "queued"
  | "planning"
  | "running"
  | "blocked"
  | "awaiting_approval"
  | "retrying"
  | "escalated"
  | "completed"
  | "failed"
  | "cancelled";
export type NodeExecutionState = "idle" | "running" | "streaming" | "waiting_input" | "failed" | "skipped" | "completed";

export interface ProjectUnitSnapshot {
  base_unit_id: OntologyUnitId;
  name: string;
  label: string;
  short_label: string;
  description: string;
  effect_summary: string;
  member_role: string;
  data_contract: string;
  responsibility: string;
  capabilities: string[];
  success_metrics: string[];
  setup_steps: string[];
  cost_guidance: string;
  quality_guidance: string;
  default_category: Exclude<AgentCategory, "전체">;
}

export interface ProjectUnitVersion {
  version: string;
  note: string;
  timestamp: string;
  snapshot: ProjectUnitSnapshot;
}

export interface ProjectUnit extends ProjectUnitSnapshot {
  id: string;
  version: string;
  versions: ProjectUnitVersion[];
  published: boolean;
  published_at?: string;
  created_at: string;
  updated_at: string;
  project_id?: string;
}

export interface MissionRunTransitionRecord {
  from: MissionRunState;
  to: MissionRunState;
  allowed: boolean;
  timestamp: string;
  source: string;
  reset?: boolean;
  reject_reason?: MissionTransitionRejectReason;
}

export type MissionTransitionRejectReason = "not_allowed_by_state_machine";

export interface MissionRunRecord {
  id: string;
  goal: string;
  state: MissionRunState;
  workflow_label: string;
  started_at: string;
  est_cost_usd: number;
  latency_sec: number;
  demo: boolean;
  owner_id?: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  category: Exclude<AgentCategory, "전체">;
  required_api: APIProvider;
  available?: boolean;
  runtime_supported?: boolean;
  availability_reason?: string;
  creator: string;
  creator_avatar: string;
  rating: number;
  usage_count: number;
  royalty_per_use: number;
  tags: string[];
  is_featured?: boolean;
  system_prompt?: string;
  input_type?: "text" | "code" | "image";
  output_type?: "text" | "code" | "image";
  model_name?: string;
  model_version?: string;
  updated_at?: string;
  capabilities?: string[];
  ontology_unit?: OntologyUnitId;
  unit_role?: string;
  responsibility?: string;
  source_unit_id?: string;
  source_unit_version?: string;
  avg_latency_ms?: number;
  success_rate?: number;
  fail_rate?: number;
  reuse_rate?: number;
  avg_cost?: number;
}

export interface StudioNode {
  id: string;
  agent: Agent;
  position: { x: number; y: number };
  data: {
    label: string;
    avatar: string;
    category: string;
    required_api: string;
    royalty: number;
    agent_id: string;
    system_prompt?: string;
    execution_mode: "auto" | "confirm";
    approval_channels?: string[];
    approval_gate_stage?: "before_run" | "after_result" | "both";
    approval_target?: string;
    condition_mode?: "always" | "time" | "data" | "composite" | "condition";
    condition_expression?: string;
    condition_time_rule?: string;
    condition_timezone?: string;
    condition_data_path?: string;
    condition_operator?: string;
    condition_value?: string;
  };
}

export interface ArtifactVersion {
  artifact_id: string;
  version: string;
  parent_version?: string;
  changed_by: string;
  summary: string;
  timestamp: string;
}
