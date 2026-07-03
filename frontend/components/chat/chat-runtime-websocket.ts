import type { Dispatch, SetStateAction } from "react";
import type { Node } from "reactflow";
import type { MissionRunState, NodeExecutionState } from "../../types";
import { appendUniqueChatRows, type ChatRow, type RoomStatus } from "./chat-runtime-model";
import { applyRuntimeNodeState, runtimeEventChatRow } from "./chat-runtime-events";

type RuntimeNodeExecutionSetter = (nodeId: string, state: NodeExecutionState) => void;
type RuntimeStateTransitioner = (nextState: MissionRunState, source: string) => void;

const SNAPSHOT_REFRESH_EVENTS = new Set([
  "mission_snapshot",
  "mission_completed",
  "mission_failed",
  "mission_cancelled",
  "task_completed",
  "task_failed",
  "execution_result",
  "evaluation_result"
]);

type RuntimeWebSocketMessageInput = {
  runId: string;
  rawMessage: string;
  nodes: Node[];
  setNodeExecutionState: RuntimeNodeExecutionSetter;
  setMessages: Dispatch<SetStateAction<ChatRow[]>>;
  setStatus: Dispatch<SetStateAction<RoomStatus>>;
  setRuntimeRefreshNonce: Dispatch<SetStateAction<number>>;
  transitionRuntimeState: RuntimeStateTransitioner;
};

export function applyRuntimeWebSocketMessage({
  runId,
  rawMessage,
  nodes,
  setNodeExecutionState,
  setMessages,
  setStatus,
  setRuntimeRefreshNonce,
  transitionRuntimeState
}: RuntimeWebSocketMessageInput): void {
  let data: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawMessage || "{}");
    data = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return;
  }

  const kind = String(data.type || "event");
  const message = String(data.message || JSON.stringify(data));

  if (kind === "human_gate_requested") {
    setStatus("blocked");
    transitionRuntimeState("awaiting_approval", "runtime.ws.human_gate_requested");
  } else if (kind === "human_gate_approved") {
    setStatus("running");
    transitionRuntimeState("running", "runtime.ws.human_gate_approved");
  } else if (kind === "mission_completed") {
    setStatus("completed");
    transitionRuntimeState("completed", "runtime.ws.mission_completed");
  } else if (kind === "mission_failed") {
    setStatus("blocked");
    transitionRuntimeState("failed", "runtime.ws.mission_failed");
  } else if (kind === "mission_cancelled") {
    setStatus("blocked");
    transitionRuntimeState("cancelled", "runtime.ws.mission_cancelled");
  }

  if (SNAPSHOT_REFRESH_EVENTS.has(kind) || isApprovalRefreshEvent(kind)) {
    setRuntimeRefreshNonce((prev) => prev + 1);
  }
  if (kind.includes("retry")) transitionRuntimeState("retrying", "runtime.ws.retry");

  applyRuntimeNodeState(nodes, setNodeExecutionState, kind, data, message);
  setMessages((prev) => appendUniqueChatRows(prev, [runtimeEventChatRow(runId, kind, data, message)]));
}

export function appendRuntimeWebSocketOpenRow(
  runId: string,
  setMessages: Dispatch<SetStateAction<ChatRow[]>>
): void {
  setMessages((prev) =>
    appendUniqueChatRows(prev, [
      {
        id: `sys-open-${runId}`,
        type: "system",
        content: "🚀 실행 워크플로우 런타임을 시작합니다!",
        timestamp: new Date(),
        source: "stream"
      }
    ])
  );
}

function isApprovalRefreshEvent(kind: string): boolean {
  return (
    kind === "human_gate_requested" ||
    kind === "human_gate_approved" ||
    kind.startsWith("approval_notification")
  );
}
