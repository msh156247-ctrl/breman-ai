import type { Dispatch, SetStateAction } from "react";
import type { Node } from "reactflow";
import type { MockMissionRunRecord } from "../../lib/mock-data";
import type { MissionRunState, NodeExecutionState } from "../../types";
import {
  appendUniqueChatRows,
  eventDate,
  missionStateLabels,
  roomStatusFromMissionState,
  type ChatRow,
  type RoomStatus,
  type RuntimeDataMode
} from "./chat-runtime-model";
import { resolveNodeIdForRuntimeEvent, setHumanApprovalNodeState } from "./chat-runtime-events";

type RuntimeNodeExecutionSetter = (nodeId: string, state: NodeExecutionState) => void;
type RuntimeStateResetter = (state: MissionRunState, source?: string) => void;
type RuntimeStateTransitioner = (nextState: MissionRunState, source: string) => void;

type RuntimeSetters = {
  setMessages: Dispatch<SetStateAction<ChatRow[]>>;
  setRuntimeDataMode: Dispatch<SetStateAction<RuntimeDataMode>>;
  setStatus: Dispatch<SetStateAction<RoomStatus>>;
  resetMissionRunState: RuntimeStateResetter;
};

export function appendMockRunSnapshotRow(
  setMessages: Dispatch<SetStateAction<ChatRow[]>>,
  mockRunRecord: MockMissionRunRecord,
  idPrefix: string
): void {
  setMessages((prev) => appendUniqueChatRows(prev, [mockRunSnapshotRow(mockRunRecord, idPrefix)]));
}

export function initializeDemoRuntime({
  runId,
  mockRunRecord,
  setMessages,
  setStatus,
  resetMissionRunState
}: RuntimeSetters & {
  runId: string;
  mockRunRecord: MockMissionRunRecord | null;
}): void {
  const initialDemoState = mockRunRecord?.state || "planning";
  resetMissionRunState(initialDemoState, "runtime.demo.init");
  setStatus(roomStatusFromMissionState(initialDemoState));
  setMessages((prev) =>
    appendUniqueChatRows(prev, [
      {
        id: `sys-demo-${runId}`,
        type: "system",
        content: "DEMO 모드: 서버 연결 없이 로컬 예시 실행 로그를 보여줍니다.",
        timestamp: new Date(),
        source: "simulation"
      }
    ])
  );
}

export async function runChatFallbackSimulation({
  runId,
  isDemoMission,
  mockRunRecord,
  nodes,
  delay,
  isCancelled,
  setMessages,
  setRuntimeDataMode,
  setStatus,
  resetMissionRunState,
  setNodeExecutionState,
  transitionRuntimeState
}: RuntimeSetters & {
  runId: string;
  isDemoMission: boolean;
  mockRunRecord: MockMissionRunRecord | null;
  nodes: Node[];
  delay: (ms: number) => Promise<void>;
  isCancelled: () => boolean;
  setNodeExecutionState: RuntimeNodeExecutionSetter;
  transitionRuntimeState: RuntimeStateTransitioner;
}): Promise<void> {
  if (isCancelled()) return;
  if (isDemoMission && mockRunRecord?.state === "awaiting_approval") {
    setRuntimeDataMode("demo");
    setStatus("blocked");
    resetMissionRunState("awaiting_approval", "runtime.demo.approval_snapshot");
    appendMockRunSnapshotRow(setMessages, mockRunRecord, "mock-approval");
    return;
  }
  if (!isDemoMission && mockRunRecord) {
    setRuntimeDataMode("fallback");
    setStatus(roomStatusFromMissionState(mockRunRecord.state));
    resetMissionRunState(mockRunRecord.state, "runtime.mock.fallback");
    appendMockRunSnapshotRow(setMessages, mockRunRecord, "mock-fallback");
    return;
  }

  if (!isDemoMission) setRuntimeDataMode("fallback");
  transitionRuntimeState("running", "runtime.fallback.start");
  for (const event of fallbackSimulationEvents(runId)) {
    await delay(event.delay);
    if (isCancelled()) return;
    setMessages((prev) => appendUniqueChatRows(prev, [event.row]));
    const mappedNodeId = resolveNodeIdForRuntimeEvent(nodes, undefined, event.row.role, event.row.content);
    if (mappedNodeId && event.row.type === "agent") {
      setNodeExecutionState(mappedNodeId, "running");
    }
    if (event.row.type === "human_gate") {
      setStatus("blocked");
      transitionRuntimeState("awaiting_approval", "runtime.fallback.human_gate");
      setHumanApprovalNodeState(nodes, setNodeExecutionState, "waiting_input");
    }
  }
}

function mockRunSnapshotRow(mockRunRecord: MockMissionRunRecord, idPrefix: string): ChatRow {
  return {
    id: `${idPrefix}-${mockRunRecord.id}`,
    type: mockRunRecord.state === "awaiting_approval" ? "human_gate" : "system",
    content: `${mockRunRecord.workflow_label}\n${missionStateLabels[mockRunRecord.state] || mockRunRecord.state} · ${mockRunRecord.goal}`,
    timestamp: eventDate(mockRunRecord.started_at),
    source: "simulation"
  };
}

function fallbackSimulationEvents(runId: string): Array<{ delay: number; row: ChatRow }> {
  return [
    {
      delay: 800,
      row: {
        id: `sim-${runId}-1`,
        type: "agent",
        role: "developer",
        content: "풀스택 코드 작성봇이 작업을 시작합니다...",
        timestamp: new Date(),
        source: "simulation"
      }
    },
    {
      delay: 1200,
      row: {
        id: `sim-${runId}-2`,
        type: "agent",
        role: "developer",
        content: "FastAPI 백엔드 + Next.js 프론트엔드 초안 완성!",
        timestamp: new Date(),
        source: "simulation"
      }
    },
    {
      delay: 1200,
      row: {
        id: `sim-${runId}-3`,
        type: "human_gate",
        content: "코드 리뷰 단계 진행 전 최종 승인 필요",
        timestamp: new Date(),
        source: "simulation"
      }
    }
  ];
}
