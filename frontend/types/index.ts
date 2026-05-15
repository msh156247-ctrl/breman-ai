export type APIProvider = "openai" | "anthropic" | "stability" | "google";
export type AgentCategory = "전체" | "개발" | "글쓰기" | "이미지" | "데이터" | "검토" | "번역" | "기획";
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
export interface MissionRunTransitionRecord {
  from: MissionRunState;
  to: MissionRunState;
  allowed: boolean;
  timestamp: string;
  source: string;
  reject_reason?: MissionTransitionRejectReason;
}

export type MissionTransitionRejectReason = "not_allowed_by_state_machine";

export interface Agent {
  id: string;
  name: string;
  description: string;
  category: Exclude<AgentCategory, "전체">;
  required_api: APIProvider;
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
  avg_latency_ms?: number;
  success_rate?: number;
  fail_rate?: number;
  reuse_rate?: number;
  avg_cost?: number;
}

export interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  category: Exclude<AgentCategory, "전체">;
  creator: string;
  creator_avatar: string;
  agent_ids: string[];
  workflow: string[];
  rating: number;
  usage_count: number;
  royalty_per_execution: number;
  tags: string[];
  is_featured?: boolean;
  estimated_time: string;
  estimated_cost: number;
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
