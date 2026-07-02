import type { Agent, AgentCategory, APIProvider } from "../types";
import { asNumber, asStringList, asText } from "./api-core";

const CATEGORY_BY_DOMAIN: Record<string, Exclude<AgentCategory, "전체">> = {
  backend: "개발",
  frontend: "개발",
  development: "개발",
  dev: "개발",
  qa: "검토",
  governance: "검토",
  security: "검토",
  data: "데이터",
  writing: "글쓰기",
  content: "글쓰기",
  image: "이미지",
  translation: "번역",
  planning: "기획",
  general: "기획"
};

function normalizeCategory(value: unknown): Exclude<AgentCategory, "전체"> {
  const raw = String(value || "general").trim();
  const normalized = CATEGORY_BY_DOMAIN[raw.toLowerCase()];
  if (normalized) return normalized;
  const allowed: Array<Exclude<AgentCategory, "전체">> = [
    "개발",
    "검토",
    "글쓰기",
    "데이터",
    "이미지",
    "번역",
    "기획"
  ];
  return allowed.includes(raw as Exclude<AgentCategory, "전체">)
    ? (raw as Exclude<AgentCategory, "전체">)
    : "기획";
}

function normalizeProvider(value: unknown): APIProvider {
  const raw = String(value || "mock").trim().toLowerCase();
  if (["openai", "anthropic", "gemini", "stability", "google", "mock"].includes(raw)) {
    return raw as APIProvider;
  }
  return "mock";
}

function stableMemberId(row: Record<string, unknown>, provider: APIProvider): string {
  const explicit = asText(row.id);
  if (explicit) return explicit;
  const seed = [row.name, row.creator, row.model, provider].map((value) => String(value || "").trim()).join("|");
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `agent-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function memberToAgent(row: Record<string, unknown>): Agent {
  const provider = normalizeProvider(row.required_api || row.provider);
  const capabilities = asStringList(row.capabilities);
  return {
    id: stableMemberId(row, provider),
    name: asText(row.name, "Unnamed Agent"),
    description: asText(row.description, "등록된 설명이 없습니다."),
    category: normalizeCategory(row.category || row.domain),
    required_api: provider,
    available: typeof row.available === "boolean" ? row.available : provider === "mock",
    runtime_supported: typeof row.runtime_supported === "boolean" ? row.runtime_supported : undefined,
    availability_reason: asText(row.availability_reason) || undefined,
    creator: asText(row.creator, "workspace"),
    creator_avatar: asText(row.creator_avatar, provider === "mock" ? "🧪" : "🤖"),
    rating: asNumber(row.rating, 4.6),
    usage_count: asNumber(row.usage_count, 0),
    royalty_per_use: asNumber(row.royalty_per_use, asNumber(row.royalty_rate, 0)),
    tags: asStringList(row.tags, capabilities.slice(0, 4)),
    is_featured: Boolean(row.is_featured),
    model_name: asText(row.model),
    model_version: asText(row.version),
    capabilities,
    success_rate: asNumber(row.success_rate, 0),
    avg_latency_ms: asNumber(row.avg_latency_ms, 0),
    reuse_rate: asNumber(row.reuse_rate, 0)
  };
}

export function workspaceAgentToAgent(row: Record<string, unknown>): Agent {
  const base = memberToAgent(row);
  const ontologyUnit = asText(row.ontology_unit);
  const unitRole = asText(row.unit_role);
  const responsibility = asText(row.responsibility);
  const sourceUnitId = asText(row.source_unit_id);
  const sourceUnitVersion = asText(row.source_unit_version);
  return {
    ...base,
    model_name: asText(row.model_name, base.model_name),
    model_version: asText(row.model_version, base.model_version),
    updated_at: asText(row.updated_at, base.updated_at),
    system_prompt: asText(row.system_prompt, base.system_prompt),
    ontology_unit: ontologyUnit ? (ontologyUnit as Agent["ontology_unit"]) : base.ontology_unit,
    unit_role: unitRole || base.unit_role,
    responsibility: responsibility || base.responsibility,
    source_unit_id: sourceUnitId || base.source_unit_id,
    source_unit_version: sourceUnitVersion || base.source_unit_version,
    avg_latency_ms: asNumber(row.avg_latency_ms, base.avg_latency_ms || 0),
    success_rate: asNumber(row.success_rate, base.success_rate || 0),
    fail_rate: asNumber(row.fail_rate, base.fail_rate || 0),
    reuse_rate: asNumber(row.reuse_rate, base.reuse_rate || 0),
    avg_cost: asNumber(row.avg_cost, base.avg_cost || 0)
  };
}
