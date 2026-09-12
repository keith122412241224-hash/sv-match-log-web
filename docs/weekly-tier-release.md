# 期間レポートのTier評価リリース

## 分離と本番基点

- 本番基点: `1a1d5be1bc1fa613259a120bb49a9cdd9baa34e5`。
- GitHub Production成功デプロイ: `6384183809`。本番とリモートmainが同じSHAであることをAPIで確認。
- 専用ブランチ: `release/weekly-tier-unified`。
- 専用worktree: `build/tier-release`。
- 元のmasterは`09c1612`で、Tier改修と未公開のランク等の差分が混在。staged差分なし。元のmaster、`build/analysis-png`、`build/reversed-release`のファイルハッシュを記録し、変更せず保持。

本番には既に反転込みの環境勝率ランキングと分析PNG機能があります。masterのファイル全体はコピーせず、本番SHA上へTierに必要な関数・表示部分のみ移植しました。公開済みのランキング、分析、PNG機能を維持しています。

## 今回の差分

- Tier専用データを今期・前期とも非ミラーのdirect + reversedで集計。既存の`summarizeDeckPerspectives`を再利用し、共通反転関数は変更しません。
- Tierのサンプル数は統合評価対象数。ミラーのみのデッキも0戦・勝率なし・サンプル不足で保留表示。
- 乖離警告はdirect・reversedが各20戦以上、勝率差25pt以上の場合だけ。25pt境界の浮動小数点誤差を避けるため、勝利数と件数の整数積で比較。
- Tier表、手動調整、PNGに評価対象数・内訳・環境勝率・Strength Scoreを表示。スコアの表示丸めをAI JSONと統一。
- AI JSONに内訳・統合トレンド・スコアを含め、プロンプトに母集団の定義を追記。記事本文には内部スコアを積極的に掲載しない従来方針を維持。
- 期間全体の件数ラベルは「登録試合数」。元レコード数を維持。
- Tier閾値、重み、絶対評価方式を維持。

DB操作、マイグレーション、依存関係、環境変数の追加・変更はありません。ランク・Masterグループ・GrandMasterレート帯、戦績入力、認証、分析、デッキ管理の変更は含めていません。

## 変更ファイル

1. `src/lib/weekly-report.ts`
2. `src/lib/weekly-report-config.ts`
3. `src/components/admin/WeeklyReportViews.tsx`
4. `src/components/admin/WeeklyReportAiWorkspace.tsx`
5. `src/app/admin/weekly-report/page.tsx`
6. `tests/weekly-report-tier.test.cjs`
7. `tests/perspectives.test.cjs`（乖離の既存テストを20戦条件へ更新）
8. `tests/browser-smoke.cjs`（Tier表示・手動調整・PNG確認を追加）
9. `docs/weekly-report.md`
10. `docs/weekly-tier-release.md`

## 検証

- `npm.cmd test`: 30件成功。公開済み15件と今回の15件。未公開ランク機能のテストは取り込みません。
- `npm.cmd run typecheck`: 成功。
- `npm.cmd run lint`: 成功。
- `npm.cmd run build`: 成功。18ページ生成。
- 25pt境界の23/40対13/40、および逆方向も警告されることを検証。
- 本番基点の実装と50組の固定シードデータで比較し、総登録数・前期間総数・比較信頼度・品質警告・遭遇率・環境勝率ランキング・主要対面・相関図・前期間からの変化の9項目が完全一致。
- Chromiumによるローカル本番ビルド検証: 分析のscope/mode/filter、390px/1440px表示、レポートJSON、Tier件数・勝率・スコア、手動Tier変更、Tier候補PNGダウンロード、プロンプトコピーが成功。DB書き込み・ページエラー0件。
- 実際に生成したPNGを画像として確認。自動Tierと手動Tier、評価対象20戦、両側10戦、勝率60%、Strength Score 81.5が表示されることを確認。これらは架空データの検証値です。

## 反映方法と確認範囲

正式手順はGitHub mainへの通常pushでVercelのProductionビルドを起動する方式です。ローカルの架空データ向け`.next`はアップロードしません。コミット前・反映前にmainと本番SHAを再確認し、他の更新があれば先に確認します。force pushは使用しません。

本番の管理者認証済みセッションは利用できていないため、実戦績の4デッキ比較値は作成していません。本番確認では公開ページ・ログインフォーム・認証ガード・ブラウザーエラー・デプロイ状態を確認し、管理者ログイン後の実データ操作と区別して報告します。

重大な問題が確認された場合は、今回のコミットだけをrevertするか既存の本番デプロイへ戻します。元のmasterや別worktreeの未公開差分はrollback対象にしません。

Tier閾値は維持が妥当です。統合基準の実データを複数期間で確認してから調整を判断し、Tier1が0件であることだけを変更理由にしません。
