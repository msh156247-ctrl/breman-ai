"use client";

import Link from "next/link";
import { ArrowLeft, Plus, UserPlus } from "lucide-react";
import { StudioAgentPoolSidebar } from "./StudioAgentPoolSidebar";
import { StudioAgentSettingsPanel } from "./StudioAgentSettingsPanel";
import { StudioUnitBuilderPanel } from "./StudioUnitBuilderPanel";
import { useStudioMemberSettingsState } from "./useStudioMemberSettingsState";

export default function StudioMemberSettings() {
  const {
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
  } = useStudioMemberSettingsState();

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
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-400/[0.45] hover:bg-cyan-500/15"
            >
              <UserPlus className="h-3.5 w-3.5" />
              에이전트 마켓 열기
            </Link>
            <button
              type="button"
              onClick={addCustomMember}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/10"
            >
              <Plus className="h-3.5 w-3.5" />
              새 에이전트 추가
            </button>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:overflow-hidden lg:p-5">
        <StudioUnitBuilderPanel
          unitDraft={unitDraft}
          setUnitDraft={setUnitDraft}
          selectedDraftBaseUnit={selectedDraftBaseUnit}
          selectedProjectUnit={selectedProjectUnit}
          projectUnits={projectUnits}
          publishedProjectUnitCount={publishedProjectUnitCount}
          draftSuccessMetrics={draftSuccessMetrics}
          draftSetupSteps={draftSetupSteps}
          unitCapabilities={unitCapabilities}
          unitEntryFromHome={unitEntryFromHome}
          unitRuntimePath={unitRuntimePath}
          unitNotice={unitNotice}
          unitError={unitError}
          unitVersionNote={unitVersionNote}
          setUnitVersionNote={setUnitVersionNote}
          onSelectBaseUnitTemplate={selectBaseUnitTemplate}
          onSelectProjectUnit={selectProjectUnit}
          onSaveProjectUnitDraft={saveProjectUnitDraft}
          onSaveProjectUnitVersion={saveProjectUnitVersion}
          onDuplicateProjectUnit={duplicateSelectedProjectUnit}
          onCreateMemberFromProjectUnit={createMemberFromProjectUnit}
          onCreateWorkflowFromUnit={createAndPlaceProjectUnitAgent}
          onPublishProjectUnit={publishSelectedProjectUnit}
          onUnpublishProjectUnit={unpublishSelectedProjectUnit}
          onDeleteProjectUnit={deleteSelectedProjectUnit}
        />

        <StudioAgentPoolSidebar
          workspaceHydrated={workspaceHydrated}
          hiredAgents={hiredAgents}
          canvasNodeCount={canvasNodes.length}
          selectedAgentId={selectedAgent?.id}
          onSelectAgent={selectMember}
        />

        <StudioAgentSettingsPanel
          selectedAgent={selectedAgent}
          memberForm={memberForm}
          setMemberForm={setMemberForm}
          selectedUnit={selectedUnit}
          providerModels={providerModels}
          memberNotice={memberNotice}
          memberError={memberError}
          canvasPlacementCount={canvasPlacementCount}
          onSave={saveMemberSettings}
          onRemove={removeSelectedMember}
          onAddCustom={addCustomMember}
        />
      </div>
    </div>
  );
}
