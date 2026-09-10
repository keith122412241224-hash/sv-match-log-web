# 対戦相手反転込みの勝率集計

## リリースの分離

本番の成功デプロイ（GitHub deployment `6262761011`）が指す `09c1612ae7c9c18db68d3783d134d8e1831d80df` を基点に、`release/reversed-win-rates` の専用worktreeで実装しました。

元の作業ツリーにある未公開ランク・Masterグループ・GrandMasterレート帯の変更はコピーせず、保持しています。このリリースには、それらのコード・UI・画像・DBマイグレーションを一切含めません。

DB変更・マイグレーション・環境変数変更・依存ライブラリ変更はありません。GitHubへ今回のコミットだけを反映して本番のVercelビルドを起動します。ローカルの混在した作業ツリーからはデプロイしません。

## 変更ファイル

- `src/lib/match-perspectives.ts`: 勝敗・先後の反転、direct/reversed/combinedの内訳、分析フィルターと初期値
- `src/lib/analytics.ts`: 集計に必要な列だけを受け取れる型へ変更（既存集計式は維持）
- `src/lib/weekly-report.ts`: 環境勝率・前期間比較・Tier・AI JSON・プロンプト
- `src/app/analysis/page.tsx`: モード切り替え、反転後の絞り込み、元登録件数
- `src/components/analysis/AnalysisFilters.tsx`: 集計方式の選択
- `src/components/analysis/DeckAnalysisCards.tsx`: 環境勝率・対象件数のラベル
- `src/components/SummaryTable.tsx`: 対象件数ラベルの指定
- `src/app/admin/weekly-report/page.tsx`: 集計定義の説明
- `src/components/admin/WeeklyReportViews.tsx`: 環境勝率と直接・反転の内訳（PNGにも反映）
- `src/components/admin/WeeklyReportAiWorkspace.tsx`: Tier調整画面の環境勝率ラベル
- `package.json`: テスト実行コマンド
- `tests/register.cjs`: TypeScriptのテスト実行用ローダー（ネットワーク禁止）
- `tests/perspectives.test.cjs`: 集計の回帰テスト
- `tests/data-and-pages.test.cjs`: ページング・権限・画面の結合テスト
- `tests/browser-smoke.cjs`: ローカル検証用データによるブラウザ操作・PNG・コピーの確認
- `docs/weekly-report.md`: 集計仕様の更新
- `docs/reversed-win-rates-release.md`: 本書

## 集計・既存機能への影響

元の1件は常に1件の登録です。デッキ別勝率の対象件数のみdirect+reversedの視点数になります。現行DBの勝敗値はwin/loseで、引き分けは存在しません。先攻/後攻も反転します。反転視点にユーザー属性をコピーしません。

同デッキ対戦は同デッキに両視点を計上し、1勝1敗になります。全体の登録件数・遭遇数は1件です。実際の対戦が双方から登録された場合は2件の独立した観測として扱います。現行スキーマには登録行ID、登録ユーザー、日時、デッキ等がありますが、双方の登録を確実に結び付ける共有対戦ID・相手ユーザーIDはありません。

分析は自分の戦績ではdirect、管理者の全ユーザー戦績ではcombinedを初期値とし、明示的な変更も可能です。リセットは範囲に応じた初期値に戻します。combinedのデッキ・勝敗・先後条件は反転後の視点へ適用します。環境・期間・権限は取得時に適用します。

レポートの勝率ランキングとTierはcombinedを使用します。前期間も同じ方式で再計算します。Tier閾値・重みは変更せず、乖離判定はdirectとreversedの実際の内訳を比較します（25ポイント以上で評価保留）。対面相性・相関図は元々双方の登録方向を統合するため、この処理には元データを一度だけ渡す既存方式を維持しました。

AI JSONの既存キーは維持し、environmentWinRateとdirect/reversed/combined（matches/wins/losses/winRate）を追加します。winRateはenvironmentWinRateと同じ値です。低サンプルデッキのJSON除外も既存どおりです。プロンプトに視点数と総登録件数の違いを明記しました。

総試合数・遭遇率・ホーム・戦績登録・ゲスト・独立した`/matrix`画面とそのCSV/PNGは従来の動作を維持します。期間レポートのPNGには環境勝率と両内訳が表示されます。Supabase取得処理・1000件ずつのページング・権限制御のコードは変更していません。

## 検証

- `npm test`: 15テスト成功。依頼された7ケース、反転後フィルター、先後、空データ、旧デッキID、同デッキ対戦、データ乖離、権限制御を確認。
- 2505件の分析・レポート取得、およびちょうど1000件の最終空ページ取得をSupabaseモックで確認。
- `npm run lint`・`npm run typecheck`・`npm run build`: 成功。
- Chromiumで実際の本番ビルドを起動し、ローカルの架空データで自動検証。集計方式変更、逆側デッキ・先後フィルター、390px/1440px表示、レポートJSON、PNGダウンロード、AIプロンプトのクリップボードコピーを確認。ページエラー・DB書き込みなし。
- 検証画像はworktree内の`build/browser-proof/`へ保存（公開コミットには含めない）。本番の管理者ログインによる実データ操作、外部AIでの有料生成は実施していません。

ブラウザ検証の再実行にはPlaywrightとChromiumが必要です。必要に応じて`PLAYWRIGHT_MODULE`と`CHROME_EXECUTABLE`にローカルインストール先を指定し、`node tests/browser-smoke.cjs`を実行します。検証はローカルの3217・54329ポートを使用します。

## 今後の改善候補

- 直接・反転それぞれのサンプル数を踏まえた乖離警告の精度改善。
- 登録量が大幅に増えた場合の、反転後条件を満たす元データ取得の効率化。
- 将来共有対戦IDが導入された場合の、双方登録の識別。
