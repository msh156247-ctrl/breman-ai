import { CheckCircle2 } from "lucide-react";
import type { RefObject } from "react";
import type { ChatRow, RoomStatus, RuntimeDataMode } from "./chat-runtime-model";
import type { OperationEventCounts } from "./chat-main-panel-model";

type ChatRunEventStreamProps = {
  messages: ChatRow[];
  status: RoomStatus;
  isApproving: boolean;
  handleApprove: () => void;
  operationEventCounts: OperationEventCounts;
  runtimeHealthLabel: string;
  displayRuntimeModeLabel: string;
  displayRuntimeDataMode: RuntimeDataMode;
  bottomRef: RefObject<HTMLDivElement>;
};

export function ChatRunEventStream({
  messages,
  status,
  isApproving,
  handleApprove,
  operationEventCounts,
  runtimeHealthLabel,
  displayRuntimeModeLabel,
  displayRuntimeDataMode,
  bottomRef
}: ChatRunEventStreamProps) {
  return (
    <>
      <div className="panel-shell mb-1 bg-[#0d1117] px-3 py-2 text-xs text-gray-400">
        <div className="flex flex-wrap items-center gap-2">
          <span>이벤트 스트림 · {messages.length}건 · {runtimeHealthLabel} · {displayRuntimeModeLabel}</span>
          <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-100">
            route {operationEventCounts.routes}
          </span>
          <span className="rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-100">
            loop {operationEventCounts.loops}
          </span>
          <span className="rounded border border-yellow-500/20 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] text-yellow-100">
            approval {operationEventCounts.approvals}
          </span>
          <span className="rounded border border-slate-500/20 bg-slate-500/10 px-1.5 py-0.5 text-[10px] text-slate-100">
            condition {operationEventCounts.conditions}
          </span>
        </div>
      </div>
      {messages.map((msg) => (
        <ChatEventRow
          key={msg.id}
          msg={msg}
          status={status}
          isApproving={isApproving}
          handleApprove={handleApprove}
        />
      ))}
      {messages.length === 0 && (
        <div className="text-sm text-gray-600">
          {displayRuntimeDataMode === "loading" ? "런타임 스냅샷을 불러오는 중..." : "실시간 이벤트 대기 중..."}
        </div>
      )}
      <div ref={bottomRef} />
    </>
  );
}

function ChatEventRow({
  msg,
  status,
  isApproving,
  handleApprove
}: {
  msg: ChatRow;
  status: RoomStatus;
  isApproving: boolean;
  handleApprove: () => void;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-800">
        {msg.type === "system" ? "🤖" : msg.type === "agent" ? "⚙️" : "⚠️"}
      </div>
      <div className="min-w-0 max-w-2xl flex-1">
        {msg.role && <div className="mb-1 text-xs font-bold uppercase text-gray-500">{msg.role}</div>}
        <div
          className={`whitespace-pre-wrap rounded-2xl p-4 text-sm ${
            msg.type === "human_gate"
              ? "border border-yellow-500/30 bg-yellow-500/10 text-yellow-100"
              : "border border-white/10 bg-[#111111] text-gray-200"
          }`}
        >
          {msg.content}
          {msg.type === "human_gate" && status === "blocked" && (
            <div className="mt-4 flex space-x-2">
              <button
                onClick={handleApprove}
                disabled={isApproving}
                className="inline-flex min-h-10 items-center rounded-lg bg-yellow-500 px-4 py-2 font-bold text-black transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                {isApproving ? "승인 중..." : "승인하고 계속 진행"}
              </button>
            </div>
          )}
        </div>
        <div className="mt-1 text-xs text-gray-600">{msg.timestamp.toLocaleTimeString()}</div>
      </div>
    </div>
  );
}
