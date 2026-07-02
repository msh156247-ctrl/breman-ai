import { TrendingUp } from "lucide-react";
import type { SettlementRecord } from "../../lib/api";

type BillingDataMode = "demo" | "loading" | "live" | "error";

type MyPageBillingPanelProps = {
  billingDataMode: BillingDataMode;
  isDemoMode: boolean;
  settlements: SettlementRecord[];
  totalRoyalty: number;
  usageCount: number;
};

export function MyPageBillingPanel({
  billingDataMode,
  isDemoMode,
  settlements,
  totalRoyalty,
  usageCount
}: MyPageBillingPanelProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-6">
        <h3 className="mb-2 flex items-center gap-2 font-bold text-yellow-200">
          <TrendingUp className="h-4 w-4" />
          크레딧 · 실행 비용
          <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-gray-400">
            {billingDataMode === "demo"
              ? "DEMO"
              : billingDataMode === "loading"
                ? "SYNCING"
                : billingDataMode === "live"
                  ? "LIVE"
                  : "UNAVAILABLE"}
          </span>
        </h3>
        <p className="text-sm text-gray-400">
          {isDemoMode
            ? "플랫폼 크레딧과 실행 비용이 한 원장으로 수렴하는 예시입니다."
            : "실제 provider 비용과 로열티 원장의 주간 집계입니다. 크레딧 충전 기능은 아직 연결되지 않았습니다."}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-black/40 p-4">
            <div className="text-xs text-gray-500">잔여 크레딧{isDemoMode ? " (샘플)" : ""}</div>
            <div className="text-2xl font-black text-yellow-300">{isDemoMode ? "12,450" : "미연동"}</div>
          </div>
          <div className="rounded-xl bg-black/40 p-4">
            <div className="text-xs text-gray-500">이번 달 누적 로열티</div>
            <div className="text-2xl font-black text-green-400">${totalRoyalty.toFixed(2)}</div>
          </div>
          <div className="rounded-xl bg-black/40 p-4">
            <div className="text-xs text-gray-500">누적 실행 횟수{isDemoMode ? " (샘플)" : ""}</div>
            <div className="text-2xl font-black text-white">{usageCount.toLocaleString()}</div>
          </div>
        </div>
        <button
          type="button"
          disabled
          className="mt-4 w-full cursor-not-allowed rounded-xl bg-white/5 py-3 text-sm font-bold text-gray-500 md:w-auto md:px-8"
        >
          크레딧 충전 (준비 중)
        </button>
      </div>

      <div className="rounded-2xl bg-[#111111] p-6">
        <h3 className="mb-4 font-bold">최근 실행 비용 내역</h3>
        <div className="space-y-3">
          {settlements.slice(0, 6).map((row, idx) => (
            <div
              key={`${row.period}-${row.receiver_team_id || row.receiver_workflow_id || "unassigned"}-${idx}`}
              className="flex items-center justify-between rounded-xl bg-white/5 p-3"
            >
              <div>
                <div className="font-semibold">
                  실행 그룹 {row.receiver_team_id || row.receiver_workflow_id || idx + 1}
                </div>
                <div className="text-xs text-gray-500">{row.period}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-green-400">${Number(row.royalty_cost || 0).toFixed(4)}</div>
                <div className="text-xs text-gray-500">{row.entries}회</div>
              </div>
            </div>
          ))}
          {settlements.length === 0 ? <div className="text-sm text-gray-500">정산 데이터가 없습니다.</div> : null}
        </div>
      </div>
    </div>
  );
}
