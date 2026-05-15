export type APIProvider = "openai" | "anthropic" | "stability" | "google";
export type AgentCategory = "개발" | "글쓰기" | "이미지" | "데이터" | "검토" | "번역" | "기획";

export interface Agent {
  id: string;
  name: string;
  description: string;
  category: AgentCategory;
  required_api: APIProvider;
  creator: string;
  creator_avatar: string;
  rating: number;
  usage_count: number;
  royalty_per_use: number;
  tags: string[];
  is_featured?: boolean;
  system_prompt?: string;
}

export interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  category: AgentCategory;
  creator: string;
  creator_avatar: string;
  agents: Agent[];
  workflow: string[];
  rating: number;
  usage_count: number;
  royalty_per_execution: number;
  tags: string[];
  is_featured?: boolean;
  estimated_time: string;
  estimated_cost: number;
}
