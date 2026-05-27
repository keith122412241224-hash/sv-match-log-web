import Link from "next/link";
import { BarChart3, ListPlus } from "lucide-react";

const inputItems = [
  ["使用デッキ", "対戦で使用したデッキをプルダウンから選択してください。"],
  ["相手デッキ", "クラスを選択後、相手デッキを選択してください。"],
  ["先攻/後攻", "先攻か後攻を選択してください。"],
  ["対戦日時", "自動で入力されます。"],
  ["メモ", "自由に入力できます。"]
];

export function OnboardingPanel() {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <div className="grid gap-5 md:grid-cols-[1.5fr_auto] md:items-start">
        <div>
          <p className="text-sm font-semibold text-muted">はじめての方へ</p>
          <h2 className="mt-1 text-xl font-bold leading-8 text-ink">戦績を入れると、分析画面と相性表に自動で反映されます</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            まずは<strong className="font-bold text-ink">戦績入力画面</strong>から対戦結果を入力してください。
          </p>

          <div className="mt-4 rounded-md bg-slate-50 p-3">
            <h3 className="text-sm font-bold text-ink">入力項目</h3>
            <dl className="mt-3 grid gap-2 text-sm">
              {inputItems.map(([label, description]) => (
                <div className="grid gap-1 sm:grid-cols-[120px_1fr]" key={label}>
                  <dt className="font-bold text-ink">{label}</dt>
                  <dd className="text-muted">{description}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="mt-3 text-sm leading-6 text-muted">
            入力が完了したら<strong className="font-bold text-ink">保存ボタン</strong>を押してください。分析画面や相性表で戦績を確認できます。
          </p>
        </div>

        <div className="grid min-w-52 gap-2">
          <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white" href="/matches">
            <ListPlus size={18} aria-hidden="true" />
            戦績を入力する
          </Link>
          <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink" href="/analysis">
            <BarChart3 size={18} aria-hidden="true" />
            分析画面を開く
          </Link>
        </div>
      </div>
    </section>
  );
}
