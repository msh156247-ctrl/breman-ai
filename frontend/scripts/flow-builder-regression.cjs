const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      target: ts.ScriptTarget.ES2020
    },
    fileName: filename
  }).outputText;
  module._compile(output, filename);
};

const storage = new Map();
global.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
  clear() {
    storage.clear();
  }
};

const { useAppStore } = require(path.join(projectRoot, "stores", "app.store.ts"));
const { MOCK_AGENTS } = require(path.join(projectRoot, "lib", "mock-data.ts"));
const { buildConditionDslContract, buildWorkflowGraphPayload } = require(path.join(projectRoot, "lib", "workflow-graph.ts"));
const {
  WORKSPACE_SETTINGS_CLIENT_VERSION,
  shouldSeedRemoteWorkspaceSettings,
  workspaceSettingsPayload,
  workspaceSettingsSignature
} = require(path.join(projectRoot, "lib", "workspace-settings.ts"));

function resetFlow() {
  useAppStore.getState().clearCanvas();
  useAppStore.setState({
    loopRegions: [],
    selectedLoopRegionId: null,
    missionRunState: "queued",
    missionRunTransitionWarning: null,
    missionRunTransitionHistory: []
  });
}

function state() {
  return useAppStore.getState();
}

function test(name, run) {
  resetFlow();
  run();
  console.log(`ok - ${name}`);
}

test("adds agent nodes with stable unique ids and optional connection", () => {
  state().addNodeFromAgent(MOCK_AGENTS[0], { x: 0, y: 0 });
  const firstId = state().selectedNodeId;
  state().addNodeFromAgent(MOCK_AGENTS[1], { x: 280, y: 0 }, { connectFromId: firstId });
  const secondId = state().selectedNodeId;

  assert.equal(state().nodes.length, 2);
  assert.equal(new Set(state().nodes.map((node) => node.id)).size, 2);
  assert.equal(state().edges.length, 1);
  assert.equal(state().edges[0].source, firstId);
  assert.equal(state().edges[0].target, secondId);
  assert.equal(state().nodeExecutionStates[secondId], "idle");
});

test("connects nodes once and preserves condition metadata", () => {
  state().addNodeFromAgent(MOCK_AGENTS[0], { x: 0, y: 0 });
  const firstId = state().selectedNodeId;
  state().addNodeFromAgent(MOCK_AGENTS[1], { x: 280, y: 0 });
  const secondId = state().selectedNodeId;

  state().connectNodes(firstId, secondId, { condition: "result.quality >= 0.9" });
  state().connectNodes(firstId, secondId, { condition: "result.quality >= 0.9" });

  assert.equal(state().edges.length, 1);
  assert.equal(state().edges[0].label, "if result.quality >= 0.9");
  assert.deepEqual(state().edges[0].data, { condition: "result.quality >= 0.9" });
  assert.equal(state().selectedNodeId, secondId);
});

test("adds router and approval utility nodes with executable defaults", () => {
  state().addNodeFromAgent(MOCK_AGENTS[0], { x: 0, y: 0 });
  const firstId = state().selectedNodeId;

  state().addUtilityNode(
    { kind: "router", label: "조건 라우터", description: "조건에 따라 다음 노드를 선택합니다." },
    { x: 280, y: 0 },
    { connectFromId: firstId }
  );
  const routerNode = state().nodes.find((node) => node.id === state().selectedNodeId);

  state().addUtilityNode(
    { kind: "hitl", label: "관리자 승인", description: "결과 확인 후 다음 단계를 승인합니다." },
    { x: 560, y: 0 },
    { connectFromId: routerNode.id }
  );
  const approvalNode = state().nodes.find((node) => node.id === state().selectedNodeId);

  assert.equal(routerNode.data.agent_id, "router");
  assert.equal(routerNode.data.condition_mode, "condition");
  assert.equal(approvalNode.data.agent_id, "hitl");
  assert.equal(approvalNode.data.execution_mode, "confirm");
  assert.equal(state().edges.length, 2);
});

test("serializes router branch actions into condition dsl payload", () => {
  state().addNodeFromAgent(MOCK_AGENTS[0], { x: 0, y: 0 });
  const firstId = state().selectedNodeId;
  state().addUtilityNode(
    { kind: "router", label: "조건 노드", description: "조건에 따라 여러 경로로 분기합니다." },
    { x: 280, y: 0 },
    { connectFromId: firstId }
  );
  const routerId = state().selectedNodeId;
  state().addNodeFromAgent(MOCK_AGENTS[1], { x: 560, y: 0 }, { connectFromId: routerId });
  const reviewId = state().selectedNodeId;

  state().updateNodeData(routerId, {
    condition_branches: [
      { id: "pass", label: "통과", expression: "quality >= 0.9", action: "node", targetNodeId: reviewId },
      { id: "warn", label: "알림", expression: "cost > budget", action: "notify", targetNodeId: "", notifyMessage: "비용 초과" },
      { id: "else", label: "종료", expression: "else", action: "end", targetNodeId: "" }
    ]
  });

  const payload = buildWorkflowGraphPayload(state().nodes, state().edges, state().loopRegions);
  const routerNode = payload.nodes.find((node) => node.id === routerId);
  const branchCheck = routerNode.data.condition_dsl.checks.find((check) => check.kind === "branches");

  assert.equal(routerNode.data.condition_dsl.engine, "condition_dsl_v1");
  assert.equal(branchCheck.branches.length, 3);
  assert.equal(branchCheck.branches[0].target_node_id, reviewId);
  assert.equal(branchCheck.branches[1].notify_message, "비용 초과");
  assert.equal(branchCheck.branches[2].action, "end");
});

test("persists loop regions as explicit regions rather than repeat edges", () => {
  state().addNodeFromAgent(MOCK_AGENTS[0], { x: 0, y: 0 });
  const firstId = state().selectedNodeId;
  state().addNodeFromAgent(MOCK_AGENTS[1], { x: 280, y: 0 }, { connectFromId: firstId });
  const secondId = state().selectedNodeId;

  state().createLoopRegion({
    id: "loop-regression",
    name: "검토 반복",
    nodeIds: [firstId, secondId, secondId, "missing-node"],
    startNodeId: firstId,
    endNodeId: secondId,
    exitNodeId: "__finish__",
    exitConditionNodeId: secondId,
    repeatCount: 0,
    exitCondition: "result.done == true"
  });

  const loop = state().loopRegions[0];
  assert.equal(loop.id, "loop-regression");
  assert.deepEqual(loop.nodeIds, [firstId, secondId]);
  assert.equal(loop.repeatCount, 1);
  assert.equal(loop.exitConditionNodeId, secondId);
  assert.equal(state().selectedLoopRegionId, "loop-regression");

  state().updateLoopRegion("loop-regression", { repeatCount: 3, exitConditionNodeId: firstId });
  assert.equal(state().loopRegions[0].repeatCount, 3);
  assert.equal(state().loopRegions[0].exitConditionNodeId, firstId);

  state().removeLoopRegion("loop-regression");
  assert.equal(state().loopRegions.length, 0);
  assert.equal(state().selectedLoopRegionId, null);
});

test("manages project units through copy publish delete and agent creation", () => {
  useAppStore.setState({
    projectUnits: [],
    hiredAgents: [],
    libraryAgents: [],
    agentFolderIds: {}
  });

  const unitId = state().createProjectUnit("workflow", {
    name: "Regression Workflow Unit",
    label: "실행 흐름",
    short_label: "Flow",
    responsibility: "실행 순서를 테스트합니다.",
    capabilities: ["planning", "workflow design"],
    success_metrics: ["재사용률"],
    setup_steps: ["목표 분해"]
  });

  assert.equal(state().projectUnits.length, 1);
  state().publishProjectUnit(unitId);
  assert.equal(state().projectUnits.find((unit) => unit.id === unitId).published, true);
  assert.ok(state().projectUnits.find((unit) => unit.id === unitId).published_at);
  assert.ok(state().projectUnits.find((unit) => unit.id === unitId).versions.length >= 1);

  const copyId = state().duplicateProjectUnit(unitId);
  const copy = state().projectUnits.find((unit) => unit.id === copyId);
  assert.ok(copy);
  assert.notEqual(copy.id, unitId);
  assert.equal(copy.published, false);
  assert.equal(copy.version, "v1");
  assert.equal(copy.versions.length, 1);

  const agentId = state().createAgentFromUnit(copyId);
  const agent = state().hiredAgents.find((item) => item.id === agentId);
  assert.ok(agent);
  assert.equal(agent.source_unit_id, copyId);
  assert.equal(state().libraryAgents.some((item) => item.id === agentId), true);

  state().unpublishProjectUnit(unitId);
  assert.equal(state().projectUnits.find((unit) => unit.id === unitId).published, false);
  state().deleteProjectUnit(copyId);
  assert.equal(state().projectUnits.some((unit) => unit.id === copyId), false);

  state().applyWorkspaceSettings({
    libraryAgents: [],
    projectUnits: [],
    memberFolders: [],
    agentFolderIds: {}
  });
  assert.equal(state().projectUnits.length, 0);
});

test("creates a connected workflow from project unit setup steps", () => {
  useAppStore.setState({
    projectUnits: [],
    hiredAgents: [],
    libraryAgents: [],
    agentFolderIds: {}
  });

  const unitId = state().createProjectUnit("workflow", {
    name: "Executable Workflow Unit",
    label: "실행 흐름",
    short_label: "Flow",
    responsibility: "실행 단계를 카드로 펼칩니다.",
    data_contract: "goal, steps, edges",
    capabilities: ["planning"],
    success_metrics: ["누락 없는 실행"],
    setup_steps: ["요구사항 분해", "품질 기준 정의", "런타임 관측"],
    default_category: "기획"
  });

  const result = state().createWorkflowFromUnit(unitId);

  assert.ok(result);
  assert.equal(result.nodeIds.length, 3);
  assert.equal(state().hiredAgents.length, 1);
  assert.equal(state().libraryAgents.length, 1);
  assert.equal(state().nodes.length, 3);
  assert.equal(state().edges.length, 2);
  assert.equal(state().edges[0].source, result.nodeIds[0]);
  assert.equal(state().edges[0].target, result.nodeIds[1]);
  assert.equal(state().edges[1].source, result.nodeIds[1]);
  assert.equal(state().edges[1].target, result.nodeIds[2]);
  assert.equal(state().selectedNodeId, result.nodeIds[2]);

  const firstNode = state().nodes[0];
  assert.equal(firstNode.data.unit_id, unitId);
  assert.equal(firstNode.data.unit_version, "v1");
  assert.equal(firstNode.data.ontology_unit, "workflow");
  assert.equal(firstNode.data.condition_mode, "always");
  assert.equal(firstNode.data.execution_mode, "auto");
  assert.equal(firstNode.data.label, "1. 요구사항 분해");
  assert.match(firstNode.data.system_prompt, /데이터 계약: goal, steps, edges/);
  assert.match(firstNode.data.system_prompt, /완료 기준: 누락 없는 실행/);
});

test("stores approval channels and automatic execution conditions on a selected node", () => {
  state().addNodeFromAgent(MOCK_AGENTS[0], { x: 0, y: 0 });
  const nodeId = state().selectedNodeId;

  state().updateNodeData(nodeId, {
    execution_mode: "confirm",
    approval_channels: ["admin_queue", "email", "kakao"],
    approval_gate_stage: "after_result",
    approval_target: "ops@example.com",
    condition_mode: "composite",
    condition_time_rule: "weekday 09:00-18:00",
    condition_data_path: "result.quality",
    condition_operator: ">=",
    condition_value: "0.9",
    condition_expression: "result.done == true"
  });

  const node = state().nodes.find((item) => item.id === nodeId);
  assert.equal(node.data.execution_mode, "confirm");
  assert.deepEqual(node.data.approval_channels, ["admin_queue", "email", "kakao"]);
  assert.equal(node.data.condition_mode, "composite");
  assert.equal(node.data.condition_expression, "result.done == true");

  const conditionDsl = buildConditionDslContract(node.data);
  assert.equal(conditionDsl.engine, "condition_dsl_v1");
  assert.equal(conditionDsl.on_true, "approval_gate");
  assert.equal(conditionDsl.on_false, "skip");
  assert.equal(conditionDsl.approval_target, "ops@example.com");
  assert.deepEqual(
    conditionDsl.checks.map((check) => check.kind),
    ["time", "data", "expression"]
  );
});

test("serializes flow builder interactions into executable workflow graph payload", () => {
  state().addNodeFromAgent(MOCK_AGENTS[0], { x: 0, y: 0 });
  const firstId = state().selectedNodeId;
  state().addNodeFromAgent(MOCK_AGENTS[1], { x: 280, y: 0 });
  const secondId = state().selectedNodeId;
  state().connectNodes(firstId, secondId, { condition: "result.ready == true" });
  state().addNodeFromAgent(MOCK_AGENTS[2], { x: 560, y: 0 }, { connectFromId: secondId });
  const thirdId = state().selectedNodeId;

  state().updateNodeData(secondId, {
    execution_mode: "confirm",
    approval_channels: ["admin_queue", "email", "sms"],
    approval_gate_stage: "after_result",
    approval_target: "ops@example.com",
    condition_mode: "data",
    condition_data_path: "result.quality",
    condition_operator: ">=",
    condition_value: "0.9"
  });
  state().createLoopRegion({
    id: "loop-payload",
    name: "품질 반복",
    nodeIds: [firstId, secondId, secondId, "missing-node"],
    startNodeId: firstId,
    endNodeId: secondId,
    exitNodeId: thirdId,
    exitConditionNodeId: secondId,
    repeatCount: 2,
    exitCondition: "result.quality >= 0.9"
  });

  const payload = buildWorkflowGraphPayload(state().nodes, state().edges, state().loopRegions);
  const approvalNode = payload.nodes.find((node) => node.id === secondId);
  const conditionalEdge = payload.edges.find((edge) => edge.source === firstId && edge.target === secondId);
  const outgoingEdge = payload.edges.find((edge) => edge.source === secondId && edge.target === thirdId);
  const loop = payload.loop_regions[0];

  assert.equal(payload.nodes.length, 3);
  assert.equal(approvalNode.data.execution_mode, "confirm");
  assert.deepEqual(approvalNode.data.approval_channels, ["admin_queue", "email", "sms"]);
  assert.equal(approvalNode.data.condition_mode, "data");
  assert.equal(approvalNode.data.condition_dsl.engine, "condition_dsl_v1");
  assert.equal(approvalNode.data.condition_dsl.on_true, "approval_gate");
  assert.equal(approvalNode.data.condition_dsl.approval_gate_stage, "after_result");
  assert.deepEqual(approvalNode.data.condition_dsl.approval_channels, ["admin_queue", "email", "sms"]);
  assert.deepEqual(
    approvalNode.data.condition_dsl.checks.map((check) => check.kind),
    ["data"]
  );
  assert.ok(conditionalEdge);
  assert.ok(outgoingEdge);
  assert.equal(conditionalEdge.condition, "result.ready == true");
  assert.equal(conditionalEdge.label, "if result.ready == true");
  assert.equal(loop.semantics_version, "loop_region_v1");
  assert.equal(loop.valid, true);
  assert.deepEqual(loop.nodeIds, [firstId, secondId]);
  assert.deepEqual(loop.node_ids, [firstId, secondId]);
  assert.equal(loop.entryNodeId, firstId);
  assert.equal(loop.entry_node_id, firstId);
  assert.equal(loop.startNodeId, firstId);
  assert.equal(loop.start_node_id, firstId);
  assert.equal(loop.endNodeId, secondId);
  assert.equal(loop.end_node_id, secondId);
  assert.equal(loop.repeatStartNodeId, firstId);
  assert.equal(loop.repeat_start_node_id, firstId);
  assert.equal(loop.repeatEndNodeId, secondId);
  assert.equal(loop.repeat_end_node_id, secondId);
  assert.equal(loop.exitNodeId, thirdId);
  assert.equal(loop.exit_node_id, thirdId);
  assert.equal(loop.exit_action, "goto_node");
  assert.equal(loop.exitConditionNodeId, secondId);
  assert.equal(loop.exit_condition_node_id, secondId);
  assert.equal(loop.repeatCount, 2);
  assert.equal(loop.repeat_count, 2);
  assert.equal(loop.maxIterations, 2);
  assert.equal(loop.max_iterations, 2);
  assert.equal(loop.exitCondition, "result.quality >= 0.9");
  assert.equal(loop.exit_condition, "result.quality >= 0.9");
  assert.deepEqual(loop.internal_edge_ids, [conditionalEdge.id]);
  assert.deepEqual(loop.incoming_edge_ids, []);
  assert.deepEqual(loop.outgoing_edge_ids, [outgoingEdge.id]);
  assert.deepEqual(loop.semantic_warnings, []);
  assert.equal(loop.runtime_semantics.version, "loop_region_v1");
  assert.equal(loop.runtime_semantics.first_pass, "normal_dag_execution");
  assert.equal(loop.runtime_semantics.repeat_pass, "rerun_region_tasks_in_step_order");
  assert.equal(loop.runtime_semantics.exit_check, "after_exit_condition_node_each_iteration");
  assert.equal(loop.runtime_semantics.condition_satisfied, "goto_node");
  assert.equal(loop.runtime_semantics.condition_not_satisfied, "repeat_from_start_until_max_iterations");
  assert.equal(loop.runtime_semantics.repeat_start_node_id, firstId);
  assert.equal(loop.runtime_semantics.repeat_end_node_id, secondId);
  assert.equal(loop.runtime_semantics.exit_condition_node_id, secondId);
  assert.equal(loop.runtime_semantics.exit_node_id, thirdId);
  assert.equal(loop.runtime_semantics.max_iterations, 2);
});

test("normalizes invalid loop region boundaries before runtime submission", () => {
  state().addNodeFromAgent(MOCK_AGENTS[0], { x: 0, y: 0 });
  const firstId = state().selectedNodeId;
  state().addNodeFromAgent(MOCK_AGENTS[1], { x: 280, y: 0 }, { connectFromId: firstId });
  const secondId = state().selectedNodeId;

  const payload = buildWorkflowGraphPayload(state().nodes, state().edges, [
    {
      id: "loop-invalid",
      name: "깨진 반복 영역",
      nodeIds: ["missing", secondId, firstId],
      startNodeId: "missing-start",
      endNodeId: "missing-end",
      exitNodeId: secondId,
      exitConditionNodeId: "missing-condition",
      repeatCount: 0,
      exitCondition: " done ",
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  ]);

  const loop = payload.loop_regions[0];
  assert.equal(loop.semantics_version, "loop_region_v1");
  assert.deepEqual(loop.node_ids, [firstId, secondId]);
  assert.equal(loop.entry_node_id, firstId);
  assert.equal(loop.start_node_id, firstId);
  assert.equal(loop.end_node_id, secondId);
  assert.equal(loop.repeat_start_node_id, firstId);
  assert.equal(loop.repeat_end_node_id, secondId);
  assert.equal(loop.exit_node_id, "__finish__");
  assert.equal(loop.exit_action, "finish");
  assert.equal(loop.exit_condition_node_id, secondId);
  assert.equal(loop.repeat_count, 1);
  assert.equal(loop.max_iterations, 1);
  assert.equal(loop.exit_condition, "done");
  assert.equal(loop.created_at, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(loop.internal_edge_ids, [payload.edges[0].id]);
  assert.deepEqual(loop.incoming_edge_ids, []);
  assert.deepEqual(loop.outgoing_edge_ids, []);
  assert.equal(loop.runtime_semantics.condition_satisfied, "finish");
  assert.equal(loop.runtime_semantics.repeat_start_node_id, firstId);
  assert.equal(loop.runtime_semantics.repeat_end_node_id, secondId);
  assert.equal(loop.runtime_semantics.exit_condition_node_id, secondId);
  assert.equal(loop.runtime_semantics.exit_node_id, "__finish__");
});

test("builds workspace settings payload for server persistence", () => {
  useAppStore.setState({
    hiredAgents: [{ ...MOCK_AGENTS[0], id: "persist-agent" }],
    libraryAgents: [],
    projectUnits: [],
    memberFolders: [],
    agentFolderIds: {},
    nodes: [
      { id: "persist-node-a", type: "agentNode", position: { x: 0, y: 0 }, data: { label: "A" } },
      { id: "persist-node-b", type: "agentNode", position: { x: 200, y: 0 }, data: { label: "B" } }
    ],
    edges: [{ id: "persist-edge", source: "persist-node-a", target: "persist-node-b" }],
    nodeExecutionStates: { "persist-node-a": "completed", "persist-node-b": "idle" },
    artifactVersions: [
      {
        artifact_id: "persist.md",
        version: "v1",
        changed_by: "persist-agent",
        summary: "saved",
        timestamp: "now"
      }
    ],
    loopRegions: [
      {
        id: "persist-loop",
        name: "Persist loop",
        nodeIds: ["persist-node-a", "persist-node-b"],
        startNodeId: "persist-node-a",
        endNodeId: "persist-node-b",
        exitNodeId: "__finish__",
        repeatCount: 2,
        exitCondition: "done",
        createdAt: "now"
      }
    ]
  });

  const agent = {
    ...MOCK_AGENTS[0],
    id: "persist-agent",
    name: "Persisted Agent",
    system_prompt: "항상 안전하게 결과를 검토합니다.",
    input_type: "code",
    output_type: "text",
    model_name: "gpt-test",
    model_version: "2026-06-18",
    success_rate: 0.97,
    avg_latency_ms: 1234,
    reuse_rate: 0.62,
    avg_cost: 0.019
  };
  state().saveAgentToLibrary(agent);
  state().addMemberFolder({ id: "folder-persist", name: "저장 폴더" });
  state().moveAgentToFolder(agent.id, "folder-persist");
  const unitId = state().createProjectUnit("workflow", {
    name: "Persisted Workflow Unit",
    label: "저장 워크플로우",
    short_label: "Persist",
    description: "서버에 저장될 Unit",
    responsibility: "저장 흐름 검증",
    capabilities: ["persistence"],
    success_metrics: ["server-sync"],
    setup_steps: ["save"],
    default_category: "기획"
  });

  const payload = workspaceSettingsPayload(state());
  assert.equal(payload.client_version, WORKSPACE_SETTINGS_CLIENT_VERSION);
  assert.equal(payload.library_agents.some((item) => item.id === agent.id), true);
  assert.equal(payload.project_units.some((unit) => unit.id === unitId), true);
  assert.deepEqual(payload.member_folders.find((folder) => folder.id === "folder-persist"), {
    id: "folder-persist",
    name: "저장 폴더"
  });
  assert.equal(payload.agent_folder_ids[agent.id], "folder-persist");
  assert.equal(payload.hired_agents.some((item) => item.id === "persist-agent"), true);
  assert.equal(payload.nodes.length, 2);
  assert.equal(payload.edges[0].source, "persist-node-a");
  assert.equal(payload.node_execution_states["persist-node-a"], "completed");
  assert.equal(payload.artifact_versions[0].artifact_id, "persist.md");
  assert.equal(payload.loop_regions[0].id, "persist-loop");
});

test("seeds empty remote workspace settings from local user config", () => {
  const localPayload = workspaceSettingsPayload({
    libraryAgents: [{ ...MOCK_AGENTS[0], id: "local-agent" }],
    projectUnits: [],
    memberFolders: [{ id: "folder-local", name: "Local" }],
    agentFolderIds: { "local-agent": "folder-local" }
  });
  const emptyRemotePayload = workspaceSettingsPayload({
    libraryAgents: [],
    projectUnits: [],
    memberFolders: [],
    agentFolderIds: {}
  });
  const nonEmptyRemotePayload = workspaceSettingsPayload({
    libraryAgents: [{ ...MOCK_AGENTS[1], id: "remote-agent" }],
    projectUnits: [],
    memberFolders: [{ id: "folder-remote", name: "Remote" }],
    agentFolderIds: { "remote-agent": "folder-remote" }
  });

  assert.equal(shouldSeedRemoteWorkspaceSettings(localPayload, emptyRemotePayload), true);
  assert.equal(shouldSeedRemoteWorkspaceSettings(localPayload, nonEmptyRemotePayload), false);
  assert.equal(shouldSeedRemoteWorkspaceSettings(emptyRemotePayload, emptyRemotePayload), false);
});

test("applies remote workspace settings as source of truth for folder assignments", () => {
  useAppStore.setState({
    libraryAgents: [{ ...MOCK_AGENTS[0], id: "agent-local" }],
    projectUnits: [],
    memberFolders: [
      { id: "folder-local", name: "Local" },
      { id: "folder-remote", name: "Remote" }
    ],
    agentFolderIds: {
      "agent-local": "folder-local",
      "agent-stale": "folder-local"
    }
  });

  state().applyWorkspaceSettings({
    libraryAgents: [{ ...MOCK_AGENTS[1], id: "agent-remote" }],
    projectUnits: [],
    memberFolders: [{ id: "folder-remote", name: "Remote" }],
    agentFolderIds: { "agent-remote": "folder-remote" }
  });

  assert.deepEqual(
    Object.fromEntries(state().libraryAgents.map((agent) => [agent.id, agent.name])),
    { "agent-remote": MOCK_AGENTS[1].name }
  );
  assert.deepEqual(state().agentFolderIds, { "agent-remote": "folder-remote" });
  assert.deepEqual(state().memberFolders, [{ id: "folder-remote", name: "Remote" }]);
});

test("workspace settings signature tracks agent prompt and runtime metadata edits", () => {
  const baseAgent = {
    ...MOCK_AGENTS[0],
    id: "signature-agent",
    system_prompt: "v1 prompt",
    model_name: "model-a",
    success_rate: 0.8
  };
  const basePayload = workspaceSettingsPayload({
    libraryAgents: [baseAgent],
    projectUnits: [],
    memberFolders: [{ id: "folder-a", name: "A" }],
    agentFolderIds: { "signature-agent": "folder-a" }
  });
  const promptChanged = workspaceSettingsPayload({
    libraryAgents: [{ ...baseAgent, system_prompt: "v2 prompt" }],
    projectUnits: [],
    memberFolders: [{ id: "folder-a", name: "A" }],
    agentFolderIds: { "signature-agent": "folder-a" }
  });
  const metricChanged = workspaceSettingsPayload({
    libraryAgents: [{ ...baseAgent, success_rate: 0.91, avg_cost: 0.02 }],
    projectUnits: [],
    memberFolders: [{ id: "folder-a", name: "A" }],
    agentFolderIds: { "signature-agent": "folder-a" }
  });
  const folderChanged = workspaceSettingsPayload({
    libraryAgents: [baseAgent],
    projectUnits: [],
    memberFolders: [{ id: "folder-b", name: "B" }],
    agentFolderIds: { "signature-agent": "folder-b" }
  });

  assert.notEqual(workspaceSettingsSignature(basePayload), workspaceSettingsSignature(promptChanged));
  assert.notEqual(workspaceSettingsSignature(basePayload), workspaceSettingsSignature(metricChanged));
  assert.notEqual(workspaceSettingsSignature(basePayload), workspaceSettingsSignature(folderChanged));
});

console.log("Flow Builder regression checks passed.");
