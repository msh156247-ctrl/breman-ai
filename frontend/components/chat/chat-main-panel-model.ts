import type { SideTab } from "./chat-runtime-model";

export type OperationEventCounts = {
  routes: number;
  loops: number;
  approvals: number;
  conditions: number;
  risks: number;
};

export type PrimaryRuntimeAction = {
  tab: SideTab;
  label: string;
  caption: string;
  className: string;
};
