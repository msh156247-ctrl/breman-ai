import { FLOW_MODAL_TABS, type FlowModalTab } from "./studio-canvas-model";

type StudioFlowModalTabsProps = {
  flowModalTab: FlowModalTab;
  setFlowModalTab: (tab: FlowModalTab) => void;
};

export function StudioFlowModalTabs({ flowModalTab, setFlowModalTab }: StudioFlowModalTabsProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-1.5">
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
        {FLOW_MODAL_TABS.map((tab) => {
          const active = flowModalTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFlowModalTab(tab.id)}
              className={`min-h-12 rounded-xl px-3 py-2 text-left transition-colors ${
                active
                  ? "border border-blue-400/45 bg-blue-500/20 text-white shadow-sm shadow-blue-500/10"
                  : "border border-transparent text-gray-500 hover:bg-white/[0.055] hover:text-gray-200"
              }`}
            >
              <span className="block text-sm font-bold">{tab.label}</span>
              <span className="mt-0.5 block truncate text-[10px] opacity-70">{tab.detail}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
