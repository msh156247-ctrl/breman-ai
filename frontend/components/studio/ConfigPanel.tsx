"use client";

import { AlignLeft, CheckCircle, Settings, Zap } from "lucide-react";
import { useAppStore } from "../../stores/app.store";

export default function ConfigPanel() {
  const { nodes, selectedNodeId, updateNodeData, nodeExecutionStates } = useAppStore();
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedExecutionState = selectedNode ? nodeExecutionStates[selectedNode.id] || "idle" : "idle";
  const selectedData = (selectedNode?.data as any) || {};
  const isRouterNode =
    String(selectedData.agent_id || "").toLowerCase() === "router" ||
    String(selectedData.category || "").toLowerCase().includes("router");
  const routerPresets = [
    {
      label: "고위험 보안 라우팅",
      rule: '{\n  "if": "risk_score > 0.8",\n  "then": "security_team",\n  "else": "deploy_team"\n}'
    },
    {
      label: "스키마 변경 분기",
      rule: '{\n  "if": "db_schema_changed == true",\n  "then": "db_reviewer",\n  "else": "qa_team"\n}'
    },
    {
      label: "코드 변경 감지",
      rule: '{\n  "if": "code_changed == true",\n  "then": "qa_team",\n  "else": "doc_team"\n}'
    }
  ];
  const routerMode = String(selectedData.router_mode || "rule");
  const routerRuleText = String(
    selectedData.router_rule ||
      '{\n  "if": "risk_score > 0.8",\n  "then": "security_team",\n  "else": "deploy_team"\n}'
  );
  let routerRuleError = "";
  if (isRouterNode && routerMode === "rule") {
    try {
      const parsed = JSON.parse(routerRuleText);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("if" in parsed) ||
        !("then" in parsed) ||
        !("else" in parsed)
      ) {
        routerRuleError = '필수 키("if", "then", "else")가 모두 필요합니다.';
      }
    } catch (err) {
      routerRuleError = err instanceof Error ? err.message : "유효하지 않은 JSON입니다.";
    }
  }

  if (!selectedNode) {
    return (
      <div className="flex w-80 flex-col items-center justify-center border-l border-white/5 bg-[#0A0A0A] p-6 text-center text-gray-600">
        <Settings className="mb-4 h-12 w-12 opacity-20" />
        <h3 className="mb-2 font-semibold">Role Node 설정</h3>
        <p className="text-sm leading-relaxed text-gray-700">
          캔버스에서 팀원/유틸리티 노드를 선택하면
          <br />
          세부 설정을 변경할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-80 flex-col border-l border-white/5 bg-[#0A0A0A]">
      <div className="flex items-center space-x-3 border-b border-white/5 p-5">
        <div className="text-2xl">{String((selectedNode.data as any).avatar || "🤖")}</div>
        <div>
          <h2 className="font-bold text-white">{String((selectedNode.data as any).label || "AI")}</h2>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
            <span>실행 유닛 설정</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                selectedExecutionState === "completed"
                  ? "border border-emerald-500/40 bg-emerald-900/40 text-emerald-200"
                  : selectedExecutionState === "failed"
                    ? "border border-rose-500/40 bg-rose-900/40 text-rose-200"
                    : selectedExecutionState === "running" || selectedExecutionState === "streaming"
                      ? "border border-blue-500/40 bg-blue-900/40 text-blue-200"
                      : selectedExecutionState === "waiting_input"
                        ? "border border-yellow-500/40 bg-yellow-900/40 text-yellow-200"
                        : "border border-gray-600/50 bg-gray-900/50 text-gray-300"
              }`}
            >
              {selectedExecutionState}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        <div>
          <label className="mb-2 block text-xs font-semibold text-gray-400">역할 이름 (별칭)</label>
          <input
            type="text"
            value={String((selectedNode.data as any).label || "")}
            onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-[#111111] px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-500/50"
          />
        </div>

        <div>
          <label className="mb-3 block text-xs font-semibold text-gray-400">실행 모드</label>
          <div className="space-y-2">
            <button
              onClick={() => updateNodeData(selectedNode.id, { execution_mode: "auto" })}
              className={`w-full rounded-xl border p-3 transition-all ${
                (selectedNode.data as any).execution_mode === "auto"
                  ? "border-green-500/30 bg-green-500/10 text-green-400"
                  : "border-white/10 bg-[#111111] text-gray-400 hover:border-white/20"
              }`}
            >
              <div className="flex items-center space-x-3">
                <Zap className="h-4 w-4" />
                <div className="text-left">
                  <div className="text-sm font-medium">자동 실행</div>
                  <div className="text-xs opacity-70">승인 없이 바로 실행</div>
                </div>
              </div>
            </button>
            <button
              onClick={() => updateNodeData(selectedNode.id, { execution_mode: "confirm" })}
              className={`w-full rounded-xl border p-3 transition-all ${
                (selectedNode.data as any).execution_mode === "confirm"
                  ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                  : "border-white/10 bg-[#111111] text-gray-400 hover:border-white/20"
              }`}
            >
              <div className="flex items-center space-x-3">
                <CheckCircle className="h-4 w-4" />
                <div className="text-left">
                  <div className="text-sm font-medium">승인 후 실행</div>
                  <div className="text-xs opacity-70">결과 확인 후 다음 단계</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div>
          <label className="mb-3 flex items-center text-xs font-semibold text-gray-400">
            <AlignLeft className="mr-2 h-3.5 w-3.5" />
            시스템 프롬프트 (지시사항)
          </label>
          <textarea
            value={String((selectedNode.data as any).system_prompt || "")}
            onChange={(e) => updateNodeData(selectedNode.id, { system_prompt: e.target.value })}
            rows={6}
            placeholder="이 실행 유닛이 수행할 역할/책임/지시사항을 적어주세요..."
            className="w-full resize-none rounded-xl border border-white/10 bg-[#111111] px-3 py-2.5 text-sm outline-none placeholder:text-gray-700 focus:border-blue-500/50"
          />
          <div className="mt-2 text-xs text-gray-600">💡 구체적인 지시사항을 작성하면 더 정확한 결과를 얻을 수 있어요</div>
        </div>

        {isRouterNode && (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-900/10 p-3">
            <div className="mb-2 text-xs font-semibold text-cyan-300">Router 조건식</div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-gray-400">Routing Mode</label>
              <select
                value={routerMode}
                onChange={(e) => updateNodeData(selectedNode.id, { router_mode: e.target.value })}
                className="w-full rounded border border-white/10 bg-[#111111] px-2 py-2 text-xs text-gray-200"
              >
                <option value="rule">Rule (JSON)</option>
                <option value="classifier">LLM Classifier</option>
              </select>
            </div>
            <textarea
              rows={5}
              value={routerRuleText}
              onChange={(e) => updateNodeData(selectedNode.id, { router_rule: e.target.value })}
              className={`w-full resize-none rounded-lg border bg-[#111111] px-2 py-2 font-mono text-xs text-gray-200 outline-none ${
                routerRuleError ? "border-red-500/60 focus:border-red-400" : "border-white/10 focus:border-cyan-500/50"
              }`}
            />
            {routerRuleError ? (
              <div className="mt-1 text-[11px] text-red-300">JSON 파싱 오류: {routerRuleError}</div>
            ) : (
              <div className="mt-1 text-[11px] text-green-300">JSON 유효성 검증 통과</div>
            )}
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                <span>Confidence Threshold</span>
                <span>{Number((selectedNode.data as any).confidence_threshold ?? 0.75).toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={Number((selectedNode.data as any).confidence_threshold ?? 0.75)}
                onChange={(e) => updateNodeData(selectedNode.id, { confidence_threshold: Number(e.target.value) })}
                className="w-full accent-cyan-400"
              />
            </div>
            {String((selectedNode.data as any).router_mode || "rule") === "classifier" && (
              <div className="mt-3 space-y-2">
                <div className="text-xs text-gray-400">Classifier Prompt</div>
                <textarea
                  rows={4}
                  value={String(
                    (selectedNode.data as any).classifier_prompt ||
                      "Classify task risk and route to security_team or deploy_team."
                  )}
                  onChange={(e) => updateNodeData(selectedNode.id, { classifier_prompt: e.target.value })}
                  className="w-full resize-none rounded border border-white/10 bg-[#111111] px-2 py-2 text-xs text-gray-200"
                />
                <div className="text-xs text-gray-400">Fallback Route</div>
                <input
                  value={String((selectedNode.data as any).fallback_route || "qa_team")}
                  onChange={(e) => updateNodeData(selectedNode.id, { fallback_route: e.target.value })}
                  className="w-full rounded border border-white/10 bg-[#111111] px-2 py-2 text-xs text-gray-200"
                />
              </div>
            )}
            <div className="mt-3 space-y-1">
              <div className="text-xs text-gray-400">Rule Presets</div>
              {routerPresets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => updateNodeData(selectedNode.id, { router_rule: preset.rule })}
                  className="w-full rounded bg-black/30 px-2 py-1 text-left text-xs text-gray-300 hover:bg-black/50"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
