"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PanelLeft, Settings, Workflow } from "lucide-react";
import { useAppStore } from "../../stores/app.store";
import AgentPoolPanel from "./AgentPoolPanel";
import ConfigPanel from "./ConfigPanel";
import StudioMemberSettings from "./StudioMemberSettings";
import { StudioCanvas } from "./StudioCanvas";

function StudioPageInner() {
  const searchParams = useSearchParams();
  const [workspaceTab, setWorkspaceTab] = useState<"pool" | "workflow" | "settings">("workflow");
  const nodes = useAppStore((state) => state.nodes);
  const hiredAgents = useAppStore((state) => state.hiredAgents);
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);

  useEffect(() => {
    const panelParam = searchParams.get("panel");
    if (panelParam === "pool") {
      setWorkspaceTab("pool");
      return;
    }
    if (panelParam === "settings") {
      setWorkspaceTab("settings");
      return;
    }
    if (panelParam === "flow" || panelParam === "workflow") {
      setWorkspaceTab("workflow");
      return;
    }
    if (selectedNodeId) setWorkspaceTab("settings");
  }, [searchParams, selectedNodeId]);

  const panel = searchParams.get("panel");
  if (panel === "agents" || panel === "members") {
    return <StudioMemberSettings />;
  }

  const workspaceTabs = [
    { id: "pool", label: "구성 풀", detail: `${hiredAgents.length} agents`, icon: PanelLeft },
    { id: "workflow", label: "워크플로우", detail: `${nodes.length} nodes`, icon: Workflow },
    { id: "settings", label: "실행 설정", detail: selectedNodeId ? "선택됨" : "대기", icon: Settings }
  ] as const;

  if (searchParams.get("unit") && !panel) {
    return <StudioMemberSettings />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-white/10 bg-[#080a0f]/95 px-3 py-2 backdrop-blur 2xl:hidden">
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-black/25 p-1">
          {workspaceTabs.map((tab) => {
            const Icon = tab.icon;
            const active = workspaceTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setWorkspaceTab(tab.id)}
                className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2 text-left transition-colors ${
                  active
                    ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-sm shadow-blue-500/20"
                    : "text-gray-500 hover:bg-white/[0.06] hover:text-gray-300"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold">{tab.label}</span>
                  <span className="block truncate text-[10px] opacity-70">{tab.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden 2xl:flex-row">
        <div className={`${workspaceTab === "pool" ? "flex" : "hidden"} min-h-0 flex-1 2xl:flex 2xl:flex-none`}>
          <AgentPoolPanel />
        </div>
        <div className={`${workspaceTab === "workflow" ? "flex" : "hidden"} min-h-0 flex-1 2xl:flex`}>
          <StudioCanvas />
        </div>
        <div className={`${workspaceTab === "settings" ? "flex" : "hidden"} min-h-0 flex-1 2xl:flex 2xl:flex-none`}>
          <ConfigPanel />
        </div>
      </div>
    </div>
  );
}

export default function StudioPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 items-center justify-center text-gray-500">스튜디오 로딩 중…</div>
      }
    >
      <StudioPageInner />
    </Suspense>
  );
}
