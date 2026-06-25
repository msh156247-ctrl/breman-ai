import type { Edge, Node } from "reactflow";
import type { LoopRegion } from "../stores/app.store";

type WorkflowGraphNode = {
  id: string;
  type?: string;
  position: Node["position"];
  data: Record<string, unknown>;
};

type WorkflowGraphEdge = {
  id: string;
  source: string;
  target: string;
  type?: string;
  animated?: boolean;
  label?: string;
  data?: Record<string, unknown>;
  condition?: string;
};

type WorkflowGraphLoopExitAction = "finish" | "goto_node";

export type WorkflowGraphLoopSemantics = {
  version: "loop_region_v1";
  first_pass: "normal_dag_execution";
  repeat_pass: "rerun_region_tasks_in_step_order";
  exit_check: "after_exit_condition_node_each_iteration";
  condition_satisfied: WorkflowGraphLoopExitAction;
  condition_not_satisfied: "repeat_from_start_until_max_iterations";
  repeat_start_node_id: string;
  repeat_end_node_id: string;
  exit_condition_node_id: string;
  exit_node_id: string;
  max_iterations: number;
};

type WorkflowGraphLoopRegion = LoopRegion & {
  semantics_version: "loop_region_v1";
  valid: true;
  node_ids: string[];
  entryNodeId: string;
  entry_node_id: string;
  start_node_id: string;
  end_node_id: string;
  repeatStartNodeId: string;
  repeat_start_node_id: string;
  repeatEndNodeId: string;
  repeat_end_node_id: string;
  exit_node_id: string;
  exit_action: WorkflowGraphLoopExitAction;
  exit_condition_node_id?: string;
  repeat_count: number;
  maxIterations: number;
  max_iterations: number;
  exit_condition: string;
  created_at: string;
  internal_edge_ids: string[];
  incoming_edge_ids: string[];
  outgoing_edge_ids: string[];
  runtime_semantics: WorkflowGraphLoopSemantics;
  semantic_warnings: string[];
};

export type ConditionDslCheck =
  | { kind: "always"; expression: "true" }
  | { kind: "time"; rule: string; timezone: string }
  | { kind: "data"; path: string; operator: string; value: unknown }
  | { kind: "expression"; expression: string }
  | { kind: "branches"; branches: ConditionDslBranch[] };

export type ConditionDslBranch = {
  id: string;
  label: string;
  expression: string;
  action: "node" | "end" | "notify";
  target_node_id?: string;
  notify_message?: string;
};

export type ConditionDslContract = {
  engine: "condition_dsl_v1";
  mode: string;
  checks: ConditionDslCheck[];
  on_true: "run" | "approval_gate";
  on_false: "skip";
  approval_gate_stage?: string;
  approval_channels?: string[];
  approval_target?: string;
};

export type WorkflowGraphPayload = {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  loop_regions: WorkflowGraphLoopRegion[];
};

function text(value: unknown, fallback = ""): string {
  const next = String(value ?? "").trim();
  return next || fallback;
}

function conditionMode(data: Record<string, unknown>): string {
  const explicitMode = text(data.condition_mode || data.mode);
  if (explicitMode) return explicitMode;
  return text(data.condition_expression || data.expression) ? "condition" : "always";
}

function conditionBranches(value: unknown): ConditionDslBranch[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const branch = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const rawAction = text(branch.action, "node");
    const action = rawAction === "end" || rawAction === "notify" || rawAction === "node" ? rawAction : "node";
    const targetNodeId = text(branch.targetNodeId || branch.target_node_id);
    const notifyMessage = text(branch.notifyMessage || branch.notify_message);
    return {
      id: text(branch.id, `branch-${index + 1}`),
      label: text(branch.label, `분기 ${index + 1}`),
      expression: text(branch.expression || branch.condition_expression, index === 0 ? "true" : "else"),
      action,
      ...(targetNodeId ? { target_node_id: targetNodeId } : {}),
      ...(notifyMessage ? { notify_message: notifyMessage } : {})
    };
  });
}

export function buildConditionDslContract(data: Record<string, unknown>): ConditionDslContract {
  const mode = conditionMode(data);
  const checks: ConditionDslCheck[] = [];
  const timeRule = text(data.condition_time_rule || data.time_rule);
  const dataPath = text(data.condition_data_path || data.data_path);
  const expression = text(data.condition_expression || data.expression);
  const branches = conditionBranches(data.condition_branches);

  if (mode === "always" && branches.length === 0) {
    checks.push({ kind: "always", expression: "true" });
  }
  if ((mode === "time" || mode === "composite") && timeRule) {
    checks.push({ kind: "time", rule: timeRule, timezone: text(data.condition_timezone, "Asia/Seoul") });
  }
  if ((mode === "data" || mode === "composite") && dataPath) {
    checks.push({
      kind: "data",
      path: dataPath,
      operator: text(data.condition_operator || data.operator, "=="),
      value: data.condition_value ?? data.value ?? ""
    });
  }
  if ((mode === "condition" || mode === "composite" || mode === "else") && expression) {
    checks.push({ kind: "expression", expression });
  }
  if (branches.length > 0) {
    checks.push({ kind: "branches", branches });
  }
  if (checks.length === 0) {
    checks.push({ kind: "always", expression: "true" });
  }

  const approvalChannels = Array.isArray(data.approval_channels)
    ? data.approval_channels.map((channel) => text(channel)).filter(Boolean)
    : [];
  const onTrue = data.execution_mode === "confirm" ? "approval_gate" : "run";

  return {
    engine: "condition_dsl_v1",
    mode,
    checks,
    on_true: onTrue,
    on_false: "skip",
    ...(onTrue === "approval_gate" ? { approval_gate_stage: text(data.approval_gate_stage, "after_result") } : {}),
    ...(onTrue === "approval_gate" ? { approval_channels: approvalChannels.length > 0 ? approvalChannels : ["admin_queue"] } : {}),
    ...(onTrue === "approval_gate" && text(data.approval_target)
      ? { approval_target: text(data.approval_target) }
      : {})
  };
}

function nodeData(node: Node): Record<string, unknown> {
  const data = node.data && typeof node.data === "object" ? { ...(node.data as Record<string, unknown>) } : {};
  return {
    ...data,
    condition_dsl: buildConditionDslContract(data)
  };
}

function validNodeId(value: unknown, validIds: Set<string>, fallback: string): string {
  const id = String(value || "").trim();
  return id && validIds.has(id) ? id : fallback;
}

function normalizeLoopRegion(region: LoopRegion, nodeOrder: Map<string, number>, edges: Edge[]): WorkflowGraphLoopRegion | null {
  const validIds = new Set(nodeOrder.keys());
  const nodeIds = Array.from(new Set(region.nodeIds || []))
    .map((nodeId) => String(nodeId || "").trim())
    .filter((nodeId) => validIds.has(nodeId))
    .sort((a, b) => (nodeOrder.get(a) || 0) - (nodeOrder.get(b) || 0));

  if (nodeIds.length === 0) return null;

  const regionIdSet = new Set(nodeIds);
  const startNodeId = validNodeId(region.startNodeId, regionIdSet, nodeIds[0]);
  const endNodeId = validNodeId(region.endNodeId, regionIdSet, nodeIds[nodeIds.length - 1]);
  const exitConditionNodeId = validNodeId(region.exitConditionNodeId || region.endNodeId, regionIdSet, endNodeId);
  const rawExitNodeId = String(region.exitNodeId || "__finish__").trim();
  const finishSentinels = new Set(["", "__finish__", "__end__", "finish", "end"]);
  const exitNodeId = finishSentinels.has(rawExitNodeId.toLowerCase())
    ? "__finish__"
    : validIds.has(rawExitNodeId) && !regionIdSet.has(rawExitNodeId)
      ? rawExitNodeId
      : "__finish__";
  const exitAction: WorkflowGraphLoopExitAction = exitNodeId === "__finish__" ? "finish" : "goto_node";
  const repeatCount = Math.max(1, Number(region.repeatCount) || 1);
  const exitCondition = String(region.exitCondition || "").trim();
  const internalEdgeIds: string[] = [];
  const incomingEdgeIds: string[] = [];
  const outgoingEdgeIds: string[] = [];

  for (const edge of edges) {
    const source = String(edge.source || "");
    const target = String(edge.target || "");
    if (!source || !target) continue;

    const edgeId = String(edge.id || `${source}->${target}`);
    if (regionIdSet.has(source) && regionIdSet.has(target)) {
      internalEdgeIds.push(edgeId);
    } else if (!regionIdSet.has(source) && regionIdSet.has(target)) {
      incomingEdgeIds.push(edgeId);
    } else if (regionIdSet.has(source) && !regionIdSet.has(target)) {
      outgoingEdgeIds.push(edgeId);
    }
  }

  const runtimeSemantics: WorkflowGraphLoopSemantics = {
    version: "loop_region_v1",
    first_pass: "normal_dag_execution",
    repeat_pass: "rerun_region_tasks_in_step_order",
    exit_check: "after_exit_condition_node_each_iteration",
    condition_satisfied: exitAction,
    condition_not_satisfied: "repeat_from_start_until_max_iterations",
    repeat_start_node_id: startNodeId,
    repeat_end_node_id: endNodeId,
    exit_condition_node_id: exitConditionNodeId,
    exit_node_id: exitNodeId,
    max_iterations: repeatCount
  };

  return {
    ...region,
    semantics_version: "loop_region_v1",
    valid: true,
    nodeIds,
    node_ids: nodeIds,
    entryNodeId: startNodeId,
    entry_node_id: startNodeId,
    startNodeId,
    start_node_id: startNodeId,
    endNodeId,
    end_node_id: endNodeId,
    repeatStartNodeId: startNodeId,
    repeat_start_node_id: startNodeId,
    repeatEndNodeId: endNodeId,
    repeat_end_node_id: endNodeId,
    exitNodeId,
    exit_node_id: exitNodeId,
    exit_action: exitAction,
    exitConditionNodeId,
    exit_condition_node_id: exitConditionNodeId,
    repeatCount,
    repeat_count: repeatCount,
    maxIterations: repeatCount,
    max_iterations: repeatCount,
    exitCondition,
    exit_condition: exitCondition,
    created_at: region.createdAt,
    internal_edge_ids: internalEdgeIds,
    incoming_edge_ids: incomingEdgeIds,
    outgoing_edge_ids: outgoingEdgeIds,
    runtime_semantics: runtimeSemantics,
    semantic_warnings: []
  };
}

export function buildWorkflowGraphPayload(
  nodes: Node[],
  edges: Edge[],
  loopRegions: LoopRegion[] = []
): WorkflowGraphPayload {
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index + 1]));
  const validNodeIds = new Set(nodeOrder.keys());

  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: nodeData(node)
    })),
    edges: edges
      .filter((edge) => validNodeIds.has(edge.source) && validNodeIds.has(edge.target))
      .map((edge) => {
        const data = edge.data && typeof edge.data === "object" ? { ...(edge.data as Record<string, unknown>) } : undefined;
        const condition = typeof data?.condition === "string" ? data.condition : undefined;
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          animated: edge.animated,
          label: typeof edge.label === "string" ? edge.label : undefined,
          data,
          condition
        };
      }),
    loop_regions: loopRegions
      .map((region) => normalizeLoopRegion(region, nodeOrder, edges))
      .filter((region): region is WorkflowGraphLoopRegion => Boolean(region))
  };
}
