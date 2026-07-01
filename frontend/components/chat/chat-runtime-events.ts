import type { Node } from "reactflow";
import type { NodeExecutionState } from "../../types";
import {
  eventChatType,
  eventDate,
  type ChatRow
} from "./chat-runtime-model";

type RuntimeNodeExecutionSetter = (nodeId: string, state: NodeExecutionState) => void;

export function resolveNodeIdForRuntimeEvent(
  nodes: Node[],
  taskId?: string,
  roleText?: string,
  eventText?: string
): string | null {
  const normalizedTaskId = String(taskId || "").trim().toLowerCase();
  if (normalizedTaskId) {
    const exactTask = nodes.find((node) => {
      const data = node.data as Record<string, unknown>;
      return [node.id, data.task_id, data.runtime_task_id]
        .map((value) => String(value || "").trim().toLowerCase())
        .includes(normalizedTaskId);
    });
    if (exactTask) return exactTask.id;
  }

  const role = String(roleText || "").toLowerCase();
  const event = String(eventText || "").toLowerCase();
  const combined = `${role} ${event}`;
  if (!combined.trim()) return null;
  const matched = nodes.find((node) => {
    const label = String((node.data as any)?.label || "").toLowerCase();
    const agentId = String((node.data as any)?.agent_id || "").toLowerCase();
    const category = String((node.data as any)?.category || "").toLowerCase();
    return [label, agentId, category].some((token) => token && combined.includes(token));
  });
  return matched?.id || null;
}

export function applyRuntimeNodeState(
  nodes: Node[],
  setNodeExecutionState: RuntimeNodeExecutionSetter,
  kind: string,
  data: Record<string, unknown>,
  message: string
): void {
  const mappedNodeId = resolveNodeIdForRuntimeEvent(
    nodes,
    data.task_id ? String(data.task_id) : undefined,
    data.role ? String(data.role) : undefined,
    message
  );
  if (mappedNodeId) {
    if (kind === "task_started") setNodeExecutionState(mappedNodeId, "running");
    if (kind === "task_completed") setNodeExecutionState(mappedNodeId, "completed");
    if (kind === "task_failed") setNodeExecutionState(mappedNodeId, "failed");
    if (kind.includes("stream")) setNodeExecutionState(mappedNodeId, "streaming");
  }
  if (kind === "human_gate_requested") {
    setHumanApprovalNodeState(nodes, setNodeExecutionState, "waiting_input");
  } else if (kind === "human_gate_approved") {
    setHumanApprovalNodeState(nodes, setNodeExecutionState, "completed");
  }
}

export function setHumanApprovalNodeState(
  nodes: Node[],
  setNodeExecutionState: RuntimeNodeExecutionSetter,
  state: NodeExecutionState
): void {
  nodes
    .filter((node) => String((node.data as any)?.agent_id || "").toLowerCase() === "hitl")
    .forEach((node) => setNodeExecutionState(node.id, state));
}

export function runtimeEventChatRow(
  runId: string,
  kind: string,
  data: Record<string, unknown>,
  message: string
): ChatRow {
  const eventTarget = String(data.task_id || data.mission_id || runId);
  const eventStamp = String(data.timestamp || message);
  return {
    id: `event-${kind}-${eventTarget}-${eventStamp}`,
    type: eventChatType(kind),
    content: message,
    role: data.role ? String(data.role) : undefined,
    timestamp: eventDate(data.timestamp),
    source: "stream"
  };
}
