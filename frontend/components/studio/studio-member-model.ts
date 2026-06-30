import { getAgentOntologyUnit, getOntologyUnit } from "../../lib/ontology";
import type { Agent, AgentCategory, APIProvider, OntologyUnitId, ProjectUnit } from "../../types";

export const MEMBER_CATEGORIES: Exclude<AgentCategory, "전체">[] = [
  "개발",
  "글쓰기",
  "이미지",
  "데이터",
  "검토",
  "번역",
  "기획"
];

export const MEMBER_PROVIDERS: APIProvider[] = ["openai", "anthropic", "gemini", "stability", "google", "mock"];

export type MemberForm = {
  name: string;
  avatar: string;
  category: Exclude<AgentCategory, "전체">;
  ontologyUnit: OntologyUnitId;
  unitRole: string;
  responsibility: string;
  provider: APIProvider;
  royalty: string;
  modelName: string;
  modelVersion: string;
  description: string;
  tags: string;
  capabilities: string;
};

export type UnitDraft = {
  baseUnitId: OntologyUnitId;
  name: string;
  label: string;
  shortLabel: string;
  description: string;
  effectSummary: string;
  memberRole: string;
  dataContract: string;
  responsibility: string;
  capabilities: string;
  successMetrics: string;
  setupSteps: string;
  costGuidance: string;
  qualityGuidance: string;
  defaultCategory: Exclude<AgentCategory, "전체">;
};

export function listToText(value: string[] | undefined): string {
  return (value || []).join(", ");
}

export function textToList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function draftFromBaseUnit(id: unknown): UnitDraft {
  const unit = getOntologyUnit(id);
  return {
    baseUnitId: unit.id,
    name: `${unit.name} Unit`,
    label: unit.label,
    shortLabel: unit.shortLabel,
    description: unit.description,
    effectSummary: unit.effectSummary,
    memberRole: unit.memberRole,
    dataContract: unit.dataContract,
    responsibility: unit.responsibility,
    capabilities: listToText(unit.capabilities),
    successMetrics: listToText(unit.successMetrics),
    setupSteps: listToText(unit.setupSteps),
    costGuidance: unit.costGuidance,
    qualityGuidance: unit.qualityGuidance,
    defaultCategory: unit.defaultCategory
  };
}

export function draftFromProjectUnit(unit: ProjectUnit): UnitDraft {
  const base = getOntologyUnit(unit.base_unit_id);
  return {
    baseUnitId: unit.base_unit_id,
    name: unit.name,
    label: unit.label,
    shortLabel: unit.short_label,
    description: unit.description,
    effectSummary: unit.effect_summary || base.effectSummary,
    memberRole: unit.member_role,
    dataContract: unit.data_contract,
    responsibility: unit.responsibility,
    capabilities: listToText(unit.capabilities),
    successMetrics: listToText(unit.success_metrics?.length ? unit.success_metrics : base.successMetrics),
    setupSteps: listToText(unit.setup_steps?.length ? unit.setup_steps : base.setupSteps),
    costGuidance: unit.cost_guidance || base.costGuidance,
    qualityGuidance: unit.quality_guidance || base.qualityGuidance,
    defaultCategory: unit.default_category
  };
}

export function unitDraftPatch(draft: UnitDraft) {
  const base = getOntologyUnit(draft.baseUnitId);
  return {
    base_unit_id: base.id,
    name: draft.name.trim() || `${base.name} Unit`,
    label: draft.label.trim() || base.label,
    short_label: draft.shortLabel.trim() || base.shortLabel,
    description: draft.description.trim() || base.description,
    effect_summary: draft.effectSummary.trim() || base.effectSummary,
    member_role: draft.memberRole.trim() || base.memberRole,
    data_contract: draft.dataContract.trim() || base.dataContract,
    responsibility: draft.responsibility.trim() || base.responsibility,
    capabilities: textToList(draft.capabilities).length > 0 ? textToList(draft.capabilities) : base.capabilities,
    success_metrics: textToList(draft.successMetrics).length > 0 ? textToList(draft.successMetrics) : base.successMetrics,
    setup_steps: textToList(draft.setupSteps).length > 0 ? textToList(draft.setupSteps) : base.setupSteps,
    cost_guidance: draft.costGuidance.trim() || base.costGuidance,
    quality_guidance: draft.qualityGuidance.trim() || base.qualityGuidance,
    default_category: draft.defaultCategory
  };
}

export function formFromAgent(agent: Agent | null): MemberForm {
  const unit = getAgentOntologyUnit(agent || {});
  return {
    name: agent?.name || "",
    avatar: agent?.creator_avatar || "🤖",
    category: agent?.category || "개발",
    ontologyUnit: unit.id,
    unitRole: agent?.unit_role || unit.memberRole,
    responsibility: agent?.responsibility || unit.responsibility,
    provider: agent?.required_api || "mock",
    royalty: String(agent?.royalty_per_use ?? 0),
    modelName: agent?.model_name || "",
    modelVersion: agent?.model_version || "",
    description: agent?.description || "",
    tags: listToText(agent?.tags),
    capabilities: listToText(agent?.capabilities)
  };
}
