"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppStoreHydrated } from "../../hooks/useAppStoreHydrated";
import { readSessionIdentity } from "../../lib/auth";
import { API_PROVIDER_CONFIG } from "../../lib/constants";
import { getOntologyUnit } from "../../lib/ontology";
import { useAppStore } from "../../stores/app.store";
import type { Agent, OntologyUnitId } from "../../types";
import {
  draftFromBaseUnit,
  draftFromProjectUnit,
  formFromAgent,
  textToList,
  unitDraftPatch,
  type MemberForm,
  type UnitDraft
} from "./studio-member-model";

export function useStudioMemberSettingsState() {
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
  const [memberForm, setMemberForm] = useState<MemberForm>(() => formFromAgent(null));
  const [memberNotice, setMemberNotice] = useState("");
  const [memberError, setMemberError] = useState("");

  const selectedAgent = useMemo(
    () => hiredAgents.find((agent) => agent.id === selectedMemberId) || hiredAgents[0] || null,
    [hiredAgents, selectedMemberId]
  );
  const selectedProjectUnit = useMemo(
    () => projectUnits.find((unit) => unit.id === selectedProjectUnitId) || null,
    [projectUnits, selectedProjectUnitId]
  );
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
    [
      draftSetupSteps,
      draftSuccessMetrics,
      selectedDraftBaseUnit.name,
      unitDraft.defaultCategory,
      unitDraft.label,
      unitDraft.memberRole
    ]
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

  return {
    workspaceHydrated,
    hiredAgents,
    canvasNodes,
    selectedAgent,
    unitDraft,
    setUnitDraft,
    selectedDraftBaseUnit,
    selectedProjectUnit,
    projectUnits,
    publishedProjectUnitCount,
    draftSuccessMetrics,
    draftSetupSteps,
    unitCapabilities,
    unitEntryFromHome,
    unitRuntimePath,
    unitNotice,
    unitError,
    unitVersionNote,
    setUnitVersionNote,
    selectBaseUnitTemplate,
    selectProjectUnit,
    saveProjectUnitDraft,
    saveProjectUnitVersion,
    duplicateSelectedProjectUnit,
    createMemberFromProjectUnit,
    createAndPlaceProjectUnitAgent,
    publishSelectedProjectUnit,
    unpublishSelectedProjectUnit,
    deleteSelectedProjectUnit,
    selectMember,
    memberForm,
    setMemberForm,
    selectedUnit,
    providerModels,
    memberNotice,
    memberError,
    canvasPlacementCount,
    saveMemberSettings,
    removeSelectedMember,
    addCustomMember
  };
}
