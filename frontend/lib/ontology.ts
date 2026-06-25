import type {
  Agent,
  AgentCategory,
  OntologyUnitId,
  ProjectUnit,
  ProjectUnitSnapshot,
  ProjectUnitVersion
} from "../types";
import generatedOntology from "../generated/ontology.json";

export type OntologyUnit = {
  id: OntologyUnitId;
  name: string;
  label: string;
  shortLabel: string;
  description: string;
  effectSummary: string;
  memberRole: string;
  dataContract: string;
  responsibility: string;
  capabilities: string[];
  successMetrics: string[];
  setupSteps: string[];
  costGuidance: string;
  qualityGuidance: string;
  defaultCategory: Exclude<AgentCategory, "전체">;
  accent: string;
};

type GeneratedOntologyUnit = {
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
  accent: string;
};

const generatedUnits = generatedOntology.units as Record<OntologyUnitId, GeneratedOntologyUnit>;

export const ONTOLOGY_UNITS: OntologyUnit[] = Object.entries(generatedUnits).map(([id, unit]) => ({
  id: id as OntologyUnitId,
  name: unit.name,
  label: unit.label,
  shortLabel: unit.short_label,
  description: unit.description,
  effectSummary: unit.effect_summary,
  memberRole: unit.member_role,
  dataContract: unit.data_contract,
  responsibility: unit.responsibility,
  capabilities: [...unit.capabilities],
  successMetrics: [...unit.success_metrics],
  setupSteps: [...unit.setup_steps],
  costGuidance: unit.cost_guidance,
  qualityGuidance: unit.quality_guidance,
  defaultCategory: unit.default_category,
  accent: unit.accent
}));

export const DEFAULT_ONTOLOGY_UNIT_ID: OntologyUnitId = "agent_profile";

export function getOntologyUnit(id: unknown): OntologyUnit {
  return ONTOLOGY_UNITS.find((unit) => unit.id === id) || ONTOLOGY_UNITS[1];
}

export function inferOntologyUnitId(agent: Partial<Agent>): OntologyUnitId {
  if (agent.ontology_unit && ONTOLOGY_UNITS.some((unit) => unit.id === agent.ontology_unit)) {
    return agent.ontology_unit;
  }

  const haystack = [
    agent.name,
    agent.description,
    agent.category,
    ...(agent.tags || []),
    ...(agent.capabilities || [])
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.includes("cost") || haystack.includes("ledger") || haystack.includes("비용") || haystack.includes("정산")) {
    return "cost_ledger";
  }
  if (haystack.includes("runtime") || haystack.includes("mission") || haystack.includes("event") || haystack.includes("로그")) {
    return "mission_run";
  }
  if (haystack.includes("approval") || haystack.includes("review") || haystack.includes("검토") || haystack.includes("권한")) {
    return "role_binding";
  }
  if (haystack.includes("node") || haystack.includes("canvas") || haystack.includes("입출력")) {
    return "canvas_node";
  }
  if (haystack.includes("workflow") || haystack.includes("planning") || haystack.includes("기획") || haystack.includes("설계")) {
    return "workflow";
  }

  return DEFAULT_ONTOLOGY_UNIT_ID;
}

export function getAgentOntologyUnit(agent: Partial<Agent>): OntologyUnit {
  return getOntologyUnit(inferOntologyUnitId(agent));
}

export function projectUnitSnapshot(unit: ProjectUnit): ProjectUnitSnapshot {
  const base = getOntologyUnit(unit.base_unit_id);
  return {
    base_unit_id: unit.base_unit_id,
    name: unit.name,
    label: unit.label,
    short_label: unit.short_label,
    description: unit.description,
    effect_summary: unit.effect_summary || base.effectSummary,
    member_role: unit.member_role,
    data_contract: unit.data_contract,
    responsibility: unit.responsibility,
    capabilities: unit.capabilities,
    success_metrics: unit.success_metrics?.length ? unit.success_metrics : base.successMetrics,
    setup_steps: unit.setup_steps?.length ? unit.setup_steps : base.setupSteps,
    cost_guidance: unit.cost_guidance || base.costGuidance,
    quality_guidance: unit.quality_guidance || base.qualityGuidance,
    default_category: unit.default_category
  };
}

export function createProjectUnitVersion(
  unit: ProjectUnit,
  note = "Unit 버전 저장",
  timestamp = new Date().toISOString()
): ProjectUnitVersion {
  return {
    version: unit.version,
    note,
    timestamp,
    snapshot: projectUnitSnapshot(unit)
  };
}

export function nextProjectUnitVersion(version: string): string {
  const match = version.match(/^v(\d+)$/i);
  if (!match) return "v2";
  return `v${Number(match[1]) + 1}`;
}

export function createProjectUnitFromBase(
  baseUnitId: OntologyUnitId,
  patch: Partial<Omit<ProjectUnit, "id" | "versions" | "created_at" | "updated_at">> = {}
): ProjectUnit {
  const base = getOntologyUnit(baseUnitId);
  const timestamp = new Date().toISOString();
  const unit: ProjectUnit = {
    id: `unit_${base.id}_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
    base_unit_id: base.id,
    name: `${base.name} Unit`,
    label: base.label,
    short_label: base.shortLabel,
    description: base.description,
    effect_summary: base.effectSummary,
    member_role: base.memberRole,
    data_contract: base.dataContract,
    responsibility: base.responsibility,
    capabilities: [...base.capabilities],
    success_metrics: [...base.successMetrics],
    setup_steps: [...base.setupSteps],
    cost_guidance: base.costGuidance,
    quality_guidance: base.qualityGuidance,
    default_category: base.defaultCategory,
    version: "v1",
    versions: [],
    published: false,
    created_at: timestamp,
    updated_at: timestamp,
    ...patch
  };

  return {
    ...unit,
    versions: [createProjectUnitVersion(unit, "초기 Unit 생성", timestamp)]
  };
}
