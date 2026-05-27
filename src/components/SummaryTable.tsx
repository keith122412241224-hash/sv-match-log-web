import { formatPercent } from "@/lib/utils";
import type { WinRateSummary } from "@/lib/analytics";

export function SummaryTable({ rows }: { rows: WinRateSummary[] }) {
  if (rows.length === 0) {
    return <p className="p-4 text-sm text-muted">表示できるデータがありません。</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-slate-50 text-muted">
          <tr>
            <th className="px-4 py-3">項目</th>
            <th className="px-4 py-3">試合数</th>
            <th className="px-4 py-3">勝利数</th>
            <th className="px-4 py-3">勝率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr className="border-t border-slate-100" key={`${row.label}-${row.total}-${row.wins}-${index}`}>
              <td className="px-4 py-3 font-semibold">{row.label}</td>
              <td className="px-4 py-3">{row.total}</td>
              <td className="px-4 py-3">{row.wins}</td>
              <td className="px-4 py-3">{formatPercent(row.winRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
