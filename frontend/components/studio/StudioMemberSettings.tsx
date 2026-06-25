"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bot,
  CheckCircle,
  Coins,
  Copy,
  GitBranch,
  Layers,
  LineChart,
  PackagePlus,
  Plus,
  Save,
  Target,
  Trash2,
  UploadCloud,
  UserPlus,
  Workflow
} from "lucide-react";
import { useAppStoreHydrated } from "../../hooks/useAppStoreHydrated";
import { readSessionIdentity } from "../../lib/auth";
import { API_PROVIDER_CONFIG } from "../../lib/constants";
import { getAgentOntologyUnit, getOntologyUnit, ONTOLOGY_UNITS } from "../../lib/ontology";
import { useAppStore } from "../../stores/app.store";
import type { Agent, AgentCategory, APIProvider, OntologyUnitId, ProjectUnit } from "../../types";

const MEMBER_CATEGORIES: Exclude<AgentCategory, "전체">[] = [
  "개발",
  "글쓰기",
  "이미지",
  "데이터",
  "검토",
  "번역",
  "기획"
];
const MEMBER_PROVIDERS: APIProvider[] = ["openai", "anthropic", "gemini", "stability", "google", "mock"];

type MemberForm = {
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

type UnitDraft = {
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

function listToText(value: string[] | undefined): string {
  return (value || []).join(", ");
}

function textToList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function draftFromBaseUnit(id: unknown): UnitDraft {
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

function draftFromProjectUnit(unit: ProjectUnit): UnitDraft {
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

function unitDraftPatch(draft: UnitDraft) {
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

function formFromAgent(agent: Agent | null): MemberForm {
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

export default function StudioMemberSettings() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const memberParam = searchParams.get("agent") || searchParams.get("member");
  const unitParam = searchParams.get("unit");
  const workspaceHydrated = useAppStoreHydrated();
  const hiredAgents = useAppStore((s) => s.hiredAgents);
  const canvasNodes = useAppStore((s) => s.nodes);
  const projectUnits = useAppStore((s) => s.projectUnits);
  const hireAgent = useAppStore((s) => s.hireAgent);
  const updateHiredAgent = useAppStore((s) => s.updateHiredAgent);
  const fireAgent = useAppStore((s) => s.fireAgent);
  const createProjectUnit = useAppStore((s) => s.createProjectUnit);
  const updateProjectUnit = useAppStore((s) => s.updateProjectUnit);
  const duplicateProjectUnit = useAppStore((s) => s.duplicateProjectUnit);
  const deleteProjectUnit = useAppStore((s) => s.deleteProjectUnit);
  const publishProjectUnit = useAppStore((s) => s.publishProjectUnit);
  const unpublishProjectUnit = useAppStore((s) => s.unpublishProjectUnit);
  const createAgentFromUnit = useAppStore((s) => s.createAgentFromUnit);
  const createWorkflowFromUnit = useAppStore((s) => s.createWorkflowFromUnit);
  const [selectedMemberId, setSelectedMemberId] = useState(memberParam || "");
  const [selectedProjectUnitId, setSelectedProjectUnitId] = useState("");
  const [unitDraft, setUnitDraft] = useState<UnitDraft>(() => draftFromBaseUnit(unitParam));
  const [unitVersionNote, setUnitVersionNote] = useState("책임과 데이터 계약 업데이트");
  const [unitNotice, setUnitNotice] = useState("");
  const [unitError, setUnitError] = useState("");
  const selectedAgent = useMemo(
    () => hiredAgents.find((agent) => agent.id === selectedMemberId) || hiredAgents[0] || null,
    [hiredAgents, selectedMemberId]
  );
  const selectedProjectUnit = useMemo(
    () => projectUnits.find((unit) => unit.id === selectedProjectUnitId) || null,
    [projectUnits, selectedProjectUnitId]
  );
  const [memberForm, setMemberForm] = useState<MemberForm>(() => formFromAgent(null));
  const [memberNotice, setMemberNotice] = useState("");
  const [memberError, setMemberError] = useState("");
  const providerModels = API_PROVIDER_CONFIG[memberForm.provider]?.models || [];
  const selectedUnit = getOntologyUnit(memberForm.ontologyUnit);
  const selectedDraftBaseUnit = getOntologyUnit(unitDraft.baseUnitId);
  const draftSuccessMetrics = useMemo(() => textToList(unitDraft.successMetrics), [unitDraft.successMetrics]);
  const draftSetupSteps = useMemo(() => textToList(unitDraft.setupSteps), [unitDraft.setupSteps]);
  const unitCapabilities = useMemo(() => textToList(unitDraft.capabilities), [unitDraft.capabilities]);
  const unitEntryFromHome = Boolean(unitParam && !selectedProjectUnit);
  const unitRuntimePath = useMemo(
    () => [
      { label: "Unit", value: selectedDraftBaseUnit.name, detail: unitDraft.label },
      { label: "Agent", value: unitDraft.memberRole, detail: unitDraft.defaultCategory },
      { label: "Workflow", value: draftSetupSteps[0] || "실행 단계 연결", detail: `${draftSetupSteps.length || 1} steps` },
      { label: "Runtime", value: draftSuccessMetrics[0] || "실행 결과 관측", detail: "events · cost · quality" }
    ],
    [draftSetupSteps, draftSuccessMetrics, selectedDraftBaseUnit.name, unitDraft.defaultCategory, unitDraft.label, unitDraft.memberRole]
  );
  const publishedProjectUnitCount = projectUnits.filter((unit) => unit.published).length;
  const canvasPlacementCount = useMemo(() => {
    if (!selectedAgent) return 0;
    return canvasNodes.filter((node) => (node.data as { agent_id?: string } | undefined)?.agent_id === selectedAgent.id).length;
  }, [canvasNodes, selectedAgent]);

  useEffect(() => {
    if (memberParam) {
      setSelectedMemberId(memberParam);
      return;
    }
    if (!selectedMemberId && hiredAgents[0]) {
      setSelectedMemberId(hiredAgents[0].id);
    }
  }, [hiredAgents, memberParam, selectedMemberId]);

  useEffect(() => {
    setMemberForm(formFromAgent(selectedAgent));
    setMemberError("");
  }, [selectedAgent?.id]);

  useEffect(() => {
    if (!selectedProjectUnitId) {
      setUnitDraft(draftFromBaseUnit(unitParam));
    }
  }, [selectedProjectUnitId, unitParam]);

  useEffect(() => {
    if (!selectedProjectUnit) return;
    setUnitDraft(draftFromProjectUnit(selectedProjectUnit));
    setUnitError("");
  }, [selectedProjectUnit]);

  const selectMember = (agentId: string) => {
    setSelectedMemberId(agentId);
    setMemberNotice("");
    setMemberError("");
    router.replace(`/studio?panel=agents&agent=${encodeURIComponent(agentId)}`, { scroll: false });
  };

  const selectProjectUnit = (unitId: string) => {
    const unit = projectUnits.find((item) => item.id === unitId);
    if (!unit) return;
    setSelectedProjectUnitId(unit.id);
    setUnitNotice("");
    setUnitError("");
  };

  const selectBaseUnitTemplate = (unitId: OntologyUnitId) => {
    setSelectedProjectUnitId("");
    setUnitDraft(draftFromBaseUnit(unitId));
    setUnitNotice("");
    setUnitError("");
  };

  const saveProjectUnitDraft = () => {
    const patch = unitDraftPatch(unitDraft);
    if (!patch.name) {
      setUnitError("Unit 이름을 입력하세요.");
      return "";
    }

    if (selectedProjectUnit) {
      updateProjectUnit(selectedProjectUnit.id, patch);
      setUnitNotice(`${patch.name} Unit 초안을 저장했습니다.`);
      setUnitError("");
      return selectedProjectUnit.id;
    }

    const id = createProjectUnit(patch.base_unit_id, patch);
    setSelectedProjectUnitId(id);
    setUnitNotice(`${patch.name} Unit을 만들었습니다.`);
    setUnitError("");
    return id;
  };

  const saveProjectUnitVersion = () => {
    const unitId = selectedProjectUnit?.id || saveProjectUnitDraft();
    if (!unitId) return;
    updateProjectUnit(unitId, unitDraftPatch(unitDraft), {
      saveVersion: true,
      note: unitVersionNote.trim() || "Unit 버전 저장"
    });
    setUnitNotice("현재 Unit 설정을 새 버전으로 저장했습니다.");
    setUnitError("");
  };

  const publishSelectedProjectUnit = () => {
    const unitId = selectedProjectUnit?.id || saveProjectUnitDraft();
    if (!unitId) return;
    publishProjectUnit(unitId);
    setUnitNotice("프로젝트 마켓에 Unit을 게시했습니다. 마켓에서 다시 에이전트로 가져올 수 있습니다.");
    setUnitError("");
  };

  const unpublishSelectedProjectUnit = () => {
    if (!selectedProjectUnit) {
      setUnitError("게시 해제할 저장된 Unit을 먼저 선택하세요.");
      return;
    }
    unpublishProjectUnit(selectedProjectUnit.id);
    setUnitNotice(`${selectedProjectUnit.name} 게시를 해제했습니다. 기존 에이전트와 워크플로우는 유지됩니다.`);
    setUnitError("");
  };

  const duplicateSelectedProjectUnit = () => {
    const sourceId = selectedProjectUnit?.id || saveProjectUnitDraft();
    if (!sourceId) return;
    const copiedId = duplicateProjectUnit(sourceId);
    if (!copiedId) {
      setUnitError("Unit을 복제할 수 없습니다.");
      return;
    }
    setSelectedProjectUnitId(copiedId);
    setUnitNotice("선택한 Unit을 복제했습니다. 복제본은 게시 전 draft 상태로 시작합니다.");
    setUnitError("");
  };

  const deleteSelectedProjectUnit = () => {
    if (!selectedProjectUnit) {
      setUnitError("삭제할 저장된 Unit을 먼저 선택하세요.");
      return;
    }
    const ok = window.confirm(`${selectedProjectUnit.name} Unit을 삭제할까요? 생성된 에이전트와 워크플로우 노드는 유지됩니다.`);
    if (!ok) return;
    const nextUnit = projectUnits.find((unit) => unit.id !== selectedProjectUnit.id) || null;
    deleteProjectUnit(selectedProjectUnit.id);
    setSelectedProjectUnitId(nextUnit?.id || "");
    setUnitDraft(nextUnit ? draftFromProjectUnit(nextUnit) : draftFromBaseUnit(unitDraft.baseUnitId));
    setUnitNotice(`${selectedProjectUnit.name} Unit을 삭제했습니다.`);
    setUnitError("");
  };

  const createMemberFromProjectUnit = () => {
    const unitId = selectedProjectUnit?.id || saveProjectUnitDraft();
    if (!unitId) return;
    const agentId = createAgentFromUnit(unitId);
    if (!agentId) {
      setUnitError("Unit으로 에이전트를 만들 수 없습니다.");
      return;
    }
    setSelectedMemberId(agentId);
    setMemberNotice("Unit 기반 에이전트를 만들었습니다. 아래 설정에서 모델과 프롬프트를 조정하세요.");
    setUnitNotice("Unit 기반 에이전트가 에이전트 풀에 추가됐습니다.");
    setUnitError("");
    router.replace(`/studio?panel=agents&agent=${encodeURIComponent(agentId)}&unit=${unitDraft.baseUnitId}`, {
      scroll: false
    });
  };

  const createAndPlaceProjectUnitAgent = () => {
    const unitId = selectedProjectUnit?.id || saveProjectUnitDraft();
    if (!unitId) return;
    const result = createWorkflowFromUnit(unitId);
    if (!result) {
      setUnitError("Unit 흐름으로 워크플로우를 만들 수 없습니다.");
      return;
    }
    setSelectedMemberId(result.agentId);
    setUnitNotice(`Unit 기반 에이전트와 실행 카드 ${result.nodeIds.length}개를 워크플로우에 만들었습니다.`);
    setMemberNotice("Unit 흐름에서 생성된 에이전트입니다. 필요한 경우 모델과 프롬프트를 조정하세요.");
    setUnitError("");
    router.replace(`/studio?panel=workflow&unit=${unitDraft.baseUnitId}`, { scroll: false });
  };

  const saveMemberSettings = () => {
    if (!selectedAgent) return;
    const name = memberForm.name.trim();
    const royalty = Number(memberForm.royalty);
    if (!name) {
      setMemberError("에이전트 이름을 입력하세요.");
      return;
    }
    if (!Number.isFinite(royalty) || royalty < 0) {
      setMemberError("실행 단가는 0 이상의 숫자로 입력하세요.");
      return;
    }

    updateHiredAgent(selectedAgent.id, {
      name,
      creator_avatar: memberForm.avatar.trim() || "🤖",
      category: memberForm.category,
      ontology_unit: memberForm.ontologyUnit,
      unit_role: memberForm.unitRole.trim() || selectedUnit.memberRole,
      responsibility: memberForm.responsibility.trim() || selectedUnit.responsibility,
      required_api: memberForm.provider,
      royalty_per_use: royalty,
      description: memberForm.description.trim(),
      model_name: memberForm.modelName.trim(),
      model_version: memberForm.modelVersion.trim(),
      tags: textToList(memberForm.tags),
      capabilities: textToList(memberForm.capabilities),
      updated_at: new Date().toISOString()
    });
    setMemberNotice("에이전트 설정을 저장했습니다. 에이전트 풀과 실행 단계에 반영됩니다.");
    setMemberError("");
  };

  const addCustomMember = () => {
    const id = `custom-${Date.now()}`;
    const unit = getOntologyUnit(unitParam);
    const newAgent: Agent = {
      id,
      name: `새 ${unit.name} 에이전트`,
      description: unit.responsibility,
      category: unit.defaultCategory,
      required_api: "mock",
      available: true,
      creator: readSessionIdentity().userId,
      creator_avatar: "🧩",
      rating: 4.5,
      usage_count: 0,
      royalty_per_use: 0,
      tags: ["custom", unit.name],
      capabilities: unit.capabilities,
      ontology_unit: unit.id,
      unit_role: unit.memberRole,
      responsibility: unit.responsibility,
      model_name: "custom",
      model_version: "v1",
      updated_at: new Date().toISOString()
    };
    hireAgent(newAgent);
    setSelectedMemberId(id);
    setMemberNotice(`새 ${unit.name} 에이전트를 추가했습니다. Unit 역할 정보로 수정하세요.`);
    setMemberError("");
    router.replace(`/studio?panel=agents&agent=${encodeURIComponent(id)}`, { scroll: false });
  };

  const removeSelectedMember = () => {
    if (!selectedAgent) return;
    const nextAgent = hiredAgents.find((agent) => agent.id !== selectedAgent.id) || null;
    fireAgent(selectedAgent.id);
    setSelectedMemberId(nextAgent?.id || "");
    setMemberNotice(`${selectedAgent.name}을 에이전트 풀에서 제거했습니다.`);
    setMemberError("");
    router.replace(nextAgent ? `/studio?panel=agents&agent=${encodeURIComponent(nextAgent.id)}` : "/studio?panel=agents", {
      scroll: false
    });
  };

  return (
    <div className="studio-grid-bg flex min-h-0 flex-1 flex-col overflow-y-auto text-white">
      <header className="border-b border-white/10 bg-[#080a0f]/[0.86] px-5 py-4 shadow-lg shadow-black/20 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/studio"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-gray-300 shadow-sm shadow-black/20 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="스튜디오 캔버스로 돌아가기"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">스튜디오</h1>
              <p className="mt-0.5 truncate text-xs text-gray-500">Unit 구성 · 에이전트 설정 · 실행 워크플로우</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/market?tab=agents"
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-400/[0.45] hover:bg-cyan-500/15"
            >
              <UserPlus className="h-3.5 w-3.5" />
              에이전트 마켓 열기
            </Link>
            <button
              type="button"
              onClick={addCustomMember}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/10"
            >
              <Plus className="h-3.5 w-3.5" />
              새 에이전트 추가
            </button>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:overflow-hidden lg:p-5">
        <section className="panel-shell rounded-2xl p-4 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-300">
                <Layers className="h-4 w-4" />
                Ontology Unit 구성
              </div>
              <h2 className="mt-1 text-lg font-bold">Unit을 먼저 설계하고 그 Unit으로 에이전트를 구성합니다</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
                {selectedDraftBaseUnit.name} 템플릿의 책임, 데이터 계약, 기능을 프로젝트용 Unit으로 저장한 뒤 버전을 남기고
                마켓에 게시할 수 있습니다.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-gray-500">
              <div className="rounded-lg bg-black/25 px-3 py-2">
                <div className="text-sm font-semibold text-gray-100">{projectUnits.length}</div>
                프로젝트 Unit
              </div>
              <div className="rounded-lg bg-black/25 px-3 py-2">
                <div className="text-sm font-semibold text-emerald-200">{publishedProjectUnitCount}</div>
                게시됨
              </div>
              <div className="rounded-lg bg-black/25 px-3 py-2">
                <div className="text-sm font-semibold text-cyan-200">{selectedProjectUnit?.version || "draft"}</div>
                현재 버전
              </div>
            </div>
          </div>

          {unitNotice && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              <CheckCircle className="h-4 w-4 shrink-0" />
              {unitNotice}
            </div>
          )}
          {unitError && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {unitError}
            </div>
          )}

          <div className="mb-4 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/[0.12] via-blue-500/[0.055] to-transparent p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-100">
                    Unit 상세
                  </span>
                  {unitEntryFromHome && (
                    <span className="rounded-lg border border-blue-300/20 bg-blue-400/10 px-2 py-1 text-[10px] font-semibold text-blue-100">
                      홈에서 선택한 Unit
                    </span>
                  )}
                  <span className={`rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-[10px] font-semibold ${selectedDraftBaseUnit.accent}`}>
                    {selectedDraftBaseUnit.shortLabel}
                  </span>
                </div>
                <h3 className="text-xl font-black text-white">{selectedDraftBaseUnit.name}</h3>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-cyan-50/75">{unitDraft.description}</p>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">책임</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-200">{unitDraft.responsibility}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">데이터 계약</div>
                    <div className="mt-1 line-clamp-2 font-mono text-xs leading-relaxed text-cyan-100">{unitDraft.dataContract}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">생성되는 에이전트</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-200">{unitDraft.memberRole}</div>
                  </div>
                </div>
              </div>

              <div className="w-full shrink-0 rounded-2xl border border-white/10 bg-black/25 p-3 xl:w-[360px]">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-300">
                  <Workflow className="h-3.5 w-3.5 text-blue-300" />
                  Unit → Runtime 연결
                </div>
                <div className="space-y-2">
                  {unitRuntimePath.map((item, index) => (
                    <div key={item.label} className="flex items-center gap-2 rounded-xl bg-white/[0.045] px-3 py-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-gray-100">{item.value}</span>
                        <span className="block truncate text-[11px] text-gray-500">{item.label} · {item.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {unitCapabilities.slice(0, 5).map((capability) => (
                    <span
                      key={capability}
                      className="rounded-lg border border-cyan-300/15 bg-cyan-500/[0.07] px-2 py-1 text-[10px] font-semibold text-cyan-100"
                    >
                      {capability}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.08] p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-200">
                <Target className="h-4 w-4" />
                이 Unit의 효과
              </div>
              <h3 className="text-base font-bold text-white">{selectedDraftBaseUnit.name} 중심으로 작업을 나눕니다</h3>
              <p className="mt-2 text-sm leading-relaxed text-cyan-50/80">{unitDraft.effectSummary}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {unitCapabilities.slice(0, 4).map((capability) => (
                  <span
                    key={capability}
                    className="rounded-lg border border-cyan-300/15 bg-black/20 px-2 py-1 text-[11px] font-semibold text-cyan-100"
                  >
                    {capability}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <LineChart className="h-4 w-4 text-emerald-300" />
                성공 지표
              </div>
              <div className="space-y-2">
                {draftSuccessMetrics.slice(0, 4).map((metric) => (
                  <div key={metric} className="flex items-center gap-2 rounded-xl bg-white/[0.045] px-3 py-2 text-xs text-gray-200">
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                    <span className="min-w-0 truncate">{metric}</span>
                  </div>
                ))}
                {draftSuccessMetrics.length === 0 && <div className="text-xs text-gray-600">성공 지표를 입력하면 여기에 표시됩니다.</div>}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <Workflow className="h-4 w-4 text-blue-300" />
                구성 흐름
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
                아래 단계는 버튼을 누르면 순서가 연결된 워크플로우 카드로 펼쳐집니다.
              </p>
              <div className="space-y-2">
                {draftSetupSteps.slice(0, 3).map((step, index) => (
                  <div key={step} className="flex items-start gap-2 rounded-xl bg-white/[0.045] px-3 py-2 text-xs text-gray-200">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">
                      {index + 1}
                    </span>
                    <span className="min-w-0 leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={createAndPlaceProjectUnitAgent}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/20 transition-colors hover:from-blue-500 hover:to-cyan-400"
              >
                Unit 흐름으로 워크플로우 생성
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
            <div className="space-y-3">
              <div>
                <div className="mb-2 text-xs font-semibold text-gray-400">기본 Unit 템플릿</div>
                <div className="grid grid-cols-2 gap-2">
                  {ONTOLOGY_UNITS.map((unit) => (
                    <button
                      type="button"
                      key={unit.id}
                      onClick={() => selectBaseUnitTemplate(unit.id)}
                      className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                        unitDraft.baseUnitId === unit.id && !selectedProjectUnit
                          ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-100"
                          : "border-white/5 bg-black/20 text-gray-400 hover:border-white/15 hover:bg-white/5"
                      }`}
                    >
                      <span className="block font-semibold text-gray-100">{unit.name}</span>
                      <span className="mt-1 block truncate text-[11px] text-gray-500">{unit.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-gray-400">
                  <span>저장된 프로젝트 Unit</span>
                  <span className="text-[11px] text-gray-600">{projectUnits.length}개</span>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                  {projectUnits.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-gray-600">
                      아직 저장된 Unit이 없습니다.
                    </div>
                  ) : (
                    projectUnits.map((unit) => (
                      <button
                        type="button"
                        key={unit.id}
                        onClick={() => selectProjectUnit(unit.id)}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                          selectedProjectUnit?.id === unit.id
                            ? "border-blue-400/60 bg-blue-500/10"
                            : "border-white/5 bg-black/20 hover:border-white/15 hover:bg-white/5"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-gray-100">{unit.name}</span>
                          <span className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-400">
                            {unit.version}
                          </span>
                        </span>
                        <span className="mt-1 block truncate text-[11px] text-gray-500">
                          {getOntologyUnit(unit.base_unit_id).name} · {unit.member_role}
                        </span>
                        {unit.published && (
                          <span className="mt-2 inline-flex rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                            Market
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs text-gray-400">
                기준 Ontology Unit
                <select
                  value={unitDraft.baseUnitId}
                  onChange={(event) => selectBaseUnitTemplate(event.target.value as OntologyUnitId)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
                >
                  {ONTOLOGY_UNITS.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} · {unit.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-gray-400">
                실행 역할 카테고리
                <select
                  value={unitDraft.defaultCategory}
                  onChange={(event) =>
                    setUnitDraft((prev) => ({
                      ...prev,
                      defaultCategory: event.target.value as Exclude<AgentCategory, "전체">
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
                >
                  {MEMBER_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-gray-400">
                Unit 이름
                <input
                  value={unitDraft.name}
                  onChange={(event) => setUnitDraft((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
                />
              </label>
              <label className="space-y-1 text-xs text-gray-400">
                화면 라벨
                <input
                  value={unitDraft.label}
                  onChange={(event) => setUnitDraft((prev) => ({ ...prev, label: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
                />
              </label>
              <label className="space-y-1 text-xs text-gray-400">
                짧은 배지
                <input
                  value={unitDraft.shortLabel}
                  onChange={(event) => setUnitDraft((prev) => ({ ...prev, shortLabel: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
                />
              </label>
              <label className="space-y-1 text-xs text-gray-400">
                담당 역할
                <input
                  value={unitDraft.memberRole}
                  onChange={(event) => setUnitDraft((prev) => ({ ...prev, memberRole: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
                />
              </label>
              <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
                Unit 설명
                <textarea
                  value={unitDraft.description}
                  onChange={(event) => setUnitDraft((prev) => ({ ...prev, description: event.target.value }))}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
                />
              </label>
              <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
                사용 효과
                <textarea
                  value={unitDraft.effectSummary}
                  onChange={(event) => setUnitDraft((prev) => ({ ...prev, effectSummary: event.target.value }))}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] px-3 py-2 text-sm text-cyan-50 outline-none focus:border-cyan-400/50"
                />
              </label>
              <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
                책임
                <textarea
                  value={unitDraft.responsibility}
                  onChange={(event) => setUnitDraft((prev) => ({ ...prev, responsibility: event.target.value }))}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
                />
              </label>
              <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
                데이터 계약
                <input
                  value={unitDraft.dataContract}
                  onChange={(event) => setUnitDraft((prev) => ({ ...prev, dataContract: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
                />
              </label>
              <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
                기능
                <input
                  value={unitDraft.capabilities}
                  onChange={(event) => setUnitDraft((prev) => ({ ...prev, capabilities: event.target.value }))}
                  placeholder="planning, execution, audit"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
                />
              </label>
              <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
                성공 지표
                <input
                  value={unitDraft.successMetrics}
                  onChange={(event) => setUnitDraft((prev) => ({ ...prev, successMetrics: event.target.value }))}
                  placeholder="완료율, 비용 절감률, 품질 점수"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
                />
              </label>
              <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
                구성 단계
                <input
                  value={unitDraft.setupSteps}
                  onChange={(event) => setUnitDraft((prev) => ({ ...prev, setupSteps: event.target.value }))}
                  placeholder="목표 분해, 입출력 계약 정의, 승인 지점 연결"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                />
              </label>
              <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
                비용 관리 조언
                <textarea
                  value={unitDraft.costGuidance}
                  onChange={(event) => setUnitDraft((prev) => ({ ...prev, costGuidance: event.target.value }))}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-yellow-500/50"
                />
              </label>
              <label className="space-y-1 text-xs text-gray-400 md:col-span-2">
                품질 관리 조언
                <textarea
                  value={unitDraft.qualityGuidance}
                  onChange={(event) => setUnitDraft((prev) => ({ ...prev, qualityGuidance: event.target.value }))}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-purple-500/50"
                />
              </label>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-300">
                  <GitBranch className="h-3.5 w-3.5 text-purple-300" />
                  버전 관리
                </div>
                <label className="space-y-1 text-xs text-gray-400">
                  버전 메모
                  <input
                    value={unitVersionNote}
                    onChange={(event) => setUnitVersionNote(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-purple-500/50"
                  />
                </label>
                <div className="mt-3 max-h-32 space-y-2 overflow-y-auto pr-1 text-xs">
                  {(selectedProjectUnit?.versions || []).slice(0, 5).map((version) => (
                    <div key={`${version.version}-${version.timestamp}`} className="rounded-lg bg-white/[0.04] px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-purple-200">{version.version}</span>
                        <span className="text-[10px] text-gray-600">
                          {new Date(version.timestamp).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[11px] text-gray-500">{version.note}</div>
                    </div>
                  ))}
                  {!selectedProjectUnit && <div className="text-gray-600">저장 후 버전 히스토리가 표시됩니다.</div>}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-300">
                  <Coins className="h-3.5 w-3.5 text-yellow-300" />
                  운영 조언
                </div>
                <div className="space-y-2 text-xs leading-relaxed">
                  <div className="rounded-xl border border-yellow-500/15 bg-yellow-500/[0.06] px-3 py-2 text-yellow-50/85">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-yellow-200">Cost</div>
                    {unitDraft.costGuidance}
                  </div>
                  <div className="rounded-xl border border-purple-500/15 bg-purple-500/[0.06] px-3 py-2 text-purple-50/85">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-purple-200">Quality</div>
                    {unitDraft.qualityGuidance}
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={saveProjectUnitDraft}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/15"
                >
                  <Save className="h-3.5 w-3.5" />
                  Unit 저장
                </button>
                <button
                  type="button"
                  onClick={saveProjectUnitVersion}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-500/25 bg-purple-500/10 px-3 py-2 text-xs font-semibold text-purple-100 transition-colors hover:bg-purple-500/15"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  버전 저장
                </button>
                <button
                  type="button"
                  onClick={duplicateSelectedProjectUnit}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/10"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Unit 복제
                </button>
                <button
                  type="button"
                  onClick={createMemberFromProjectUnit}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
                >
                  <PackagePlus className="h-3.5 w-3.5" />
                  Unit으로 에이전트 생성
                </button>
                <button
                  type="button"
                  onClick={selectedProjectUnit?.published ? unpublishSelectedProjectUnit : publishSelectedProjectUnit}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    selectedProjectUnit?.published
                      ? "border-yellow-500/25 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-500/15"
                      : "border-emerald-500/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
                  }`}
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  {selectedProjectUnit?.published ? "게시 해제" : "프로젝트 마켓 게시"}
                </button>
                <button
                  type="button"
                  onClick={deleteSelectedProjectUnit}
                  disabled={!selectedProjectUnit}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Unit 삭제
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="panel-shell min-h-0 rounded-2xl lg:overflow-hidden">
          <div className="border-b border-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-blue-300" />
                <h2 className="text-sm font-semibold">에이전트 풀</h2>
              </div>
              <span className="rounded-full bg-white/5 px-2 py-1 text-xs text-gray-500">
                {workspaceHydrated ? `${hiredAgents.length}개` : "..."}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-gray-500">
              <div className="rounded-lg bg-black/25 px-2 py-2">
                <div className="text-sm font-semibold text-gray-200">{hiredAgents.length}</div>
                에이전트
              </div>
              <div className="rounded-lg bg-black/25 px-2 py-2">
                <div className="text-sm font-semibold text-gray-200">{canvasNodes.length}</div>
                노드
              </div>
              <div className="rounded-lg bg-black/25 px-2 py-2">
                <div className="text-sm font-semibold text-gray-200">
                  {hiredAgents.filter((agent) => agent.id.startsWith("custom-")).length}
                </div>
                직접 추가
              </div>
            </div>
          </div>
          <div className="max-h-[320px] space-y-2 overflow-y-auto p-3 lg:max-h-none lg:h-[calc(100vh-18rem)]">
            {!workspaceHydrated ? (
              [0, 1, 2].map((index) => (
                <div key={index} className="h-14 animate-pulse rounded-xl border border-white/5 bg-black/25" />
              ))
            ) : hiredAgents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-sm text-gray-500">
                에이전트가 없습니다.
              </div>
            ) : (
              hiredAgents.map((agent) => (
                <button
                  type="button"
                  key={agent.id}
                  onClick={() => selectMember(agent.id)}
                  className={`flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                    selectedAgent?.id === agent.id
                      ? "border-blue-400/60 bg-blue-500/10"
                      : "border-white/5 bg-black/20 hover:border-white/15 hover:bg-white/5"
                  }`}
                >
                  <span className="text-xl">{agent.creator_avatar}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{agent.name}</span>
                    <span className="block truncate text-xs text-gray-500">
                      {getAgentOntologyUnit(agent).name} · {agent.unit_role || getAgentOntologyUnit(agent).memberRole}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="panel-shell min-h-0 rounded-2xl lg:overflow-y-auto">
          {selectedAgent ? (
            <div className="p-4 lg:p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-white/5 pb-4">
                <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Agent Settings</div>
                  <h2 className="mt-1 truncate text-lg font-bold">{selectedAgent.name}</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    캔버스 배치 {canvasPlacementCount}개 · 실행 단가 ${selectedAgent.royalty_per_use.toFixed(2)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={saveMemberSettings}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
                  >
                    <Save className="h-3.5 w-3.5" />
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={removeSelectedMember}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/15"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    제거
                  </button>
                </div>
              </div>

              {memberNotice && (
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  {memberNotice}
                </div>
              )}
              {memberError && (
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {memberError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <label className="space-y-1 text-xs text-gray-400">
                  이름
                  <input
                    value={memberForm.name}
                    onChange={(event) => setMemberForm((prev) => ({ ...prev, name: event.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                  />
                </label>
                <label className="space-y-1 text-xs text-gray-400">
                  아바타
                  <input
                    value={memberForm.avatar}
                    onChange={(event) => setMemberForm((prev) => ({ ...prev, avatar: event.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                  />
                </label>
                <label className="space-y-1 text-xs text-gray-400">
                  역할
                  <select
                    value={memberForm.category}
                    onChange={(event) =>
                      setMemberForm((prev) => ({
                        ...prev,
                        category: event.target.value as Exclude<AgentCategory, "전체">
                      }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                  >
                    {MEMBER_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-gray-400">
                  Ontology Unit
                  <select
                    value={memberForm.ontologyUnit}
                    onChange={(event) => {
                      const unit = getOntologyUnit(event.target.value);
                      setMemberForm((prev) => ({
                        ...prev,
                        ontologyUnit: unit.id,
                        category: unit.defaultCategory,
                        unitRole: prev.unitRole || unit.memberRole,
                        responsibility: prev.responsibility || unit.responsibility
                      }));
                    }}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
                  >
                    {ONTOLOGY_UNITS.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name} · {unit.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-gray-400">
                  Unit 담당 역할
                  <input
                    value={memberForm.unitRole}
                    onChange={(event) => setMemberForm((prev) => ({ ...prev, unitRole: event.target.value }))}
                    placeholder={selectedUnit.memberRole}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
                  />
                </label>
                <label className="space-y-1 text-xs text-gray-400">
                  API Provider
                  <select
                    value={memberForm.provider}
                    onChange={(event) =>
                      setMemberForm((prev) => ({ ...prev, provider: event.target.value as APIProvider }))
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                  >
                    {MEMBER_PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>
                        {API_PROVIDER_CONFIG[provider]?.label || provider}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-gray-400">
                  실행 단가
                  <input
                    value={memberForm.royalty}
                    onChange={(event) => setMemberForm((prev) => ({ ...prev, royalty: event.target.value }))}
                    inputMode="decimal"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                  />
                </label>
                <label className="space-y-1 text-xs text-gray-400">
                  모델 이름
                  <input
                    value={memberForm.modelName}
                    onChange={(event) => setMemberForm((prev) => ({ ...prev, modelName: event.target.value }))}
                    placeholder={providerModels[0] || "custom-model"}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                  />
                </label>
                <label className="space-y-1 text-xs text-gray-400">
                  모델 버전
                  <input
                    value={memberForm.modelVersion}
                    onChange={(event) => setMemberForm((prev) => ({ ...prev, modelVersion: event.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                  />
                </label>
                <label className="space-y-1 text-xs text-gray-400">
                  태그
                  <input
                    value={memberForm.tags}
                    onChange={(event) => setMemberForm((prev) => ({ ...prev, tags: event.target.value }))}
                    placeholder="code, review"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                  />
                </label>
                <label className="space-y-1 text-xs text-gray-400 xl:col-span-2">
                  Unit 책임
                  <textarea
                    value={memberForm.responsibility}
                    onChange={(event) => setMemberForm((prev) => ({ ...prev, responsibility: event.target.value }))}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
                  />
                  <div className="text-[11px] leading-relaxed text-gray-600">
                    {selectedUnit.dataContract}
                  </div>
                </label>
                <label className="space-y-1 text-xs text-gray-400 xl:col-span-2">
                  기능
                  <input
                    value={memberForm.capabilities}
                    onChange={(event) => setMemberForm((prev) => ({ ...prev, capabilities: event.target.value }))}
                    placeholder="planning, coding, qa"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                  />
                </label>
                <label className="space-y-1 text-xs text-gray-400 xl:col-span-2">
                  설명
                  <textarea
                    value={memberForm.description}
                    onChange={(event) => setMemberForm((prev) => ({ ...prev, description: event.target.value }))}
                    rows={5}
                    className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-6 text-center text-gray-500">
              <Bot className="h-8 w-8" />
              <div className="text-sm">설정할 에이전트가 없습니다.</div>
              <button
                type="button"
                onClick={addCustomMember}
                className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
              >
                직접 추가
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
