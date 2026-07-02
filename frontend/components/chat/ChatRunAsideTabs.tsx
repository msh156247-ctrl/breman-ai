import { SIDE_TABS, sideTabLabels, type SideTab } from "./chat-runtime-model";

type ChatRunAsideTabsProps = {
  sideTab: SideTab;
  setSideTab: (tab: SideTab) => void;
  kpiByTab: Record<SideTab, Array<{ label: string; value: string }>>;
};

export function ChatRunAsideTabs({ sideTab, setSideTab, kpiByTab }: ChatRunAsideTabsProps) {
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
        {SIDE_TABS.map((key) => (
          <button
            key={key}
            onClick={() => setSideTab(key)}
            className={`min-h-9 rounded-xl px-3 py-2 font-semibold ${
              sideTab === key ? "bg-blue-600 text-white" : "bg-white/5 text-gray-400 hover:text-gray-200"
            }`}
          >
            {sideTabLabels[key]}
          </button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        {kpiByTab[sideTab].map((kpi) => (
          <div key={kpi.label} className="stat-chip bg-black/30 px-2 py-1.5">
            <div className="text-gray-500">{kpi.label}</div>
            <div className="mt-0.5 font-semibold text-gray-200">{kpi.value}</div>
          </div>
        ))}
      </div>
    </>
  );
}
