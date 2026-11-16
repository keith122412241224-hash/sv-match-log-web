# 環境全体の相性表：ローカル実装・検証

2026-11-16。実装前コミット: `bdbeafcdfabbc486eab16ecbbc151b5235df0517`。
push、デプロイ、本番DB操作、認証設定変更、依存関係変更は実施していない。
DBテストは合成データを入れたメモリ内PGliteのみを使用。

## 仕様

- 通常会員・管理者の `/matrix` は環境全体が初期表示。`scope=mine` は従来の個人用。
- 匿名・未ログインの認可は維持。不正scopeは従来同様に個人範囲。会員用RPC失敗時に個人集計へ切り替えない。
- 環境全体は既存 `get_member_matchup_aggregates_v1` の方向別集計だけを使用し、サーバー側の新しい純粋関数で統合する。
- 件数 `N = nAB + nBA`、A勝数 `wAB + nBA - wBA`、B勝数 `N - A勝数`。重複登録の推測除外は行わない。
- デッキIDで対を識別。名前・表示順・表示デッキの選択は計算に影響しない。未表示・旧ID・nullのグループを表示デッキへ再配分しない。
- 表示勝率は常に小数1桁。ID順で片側を0.1%単位に丸め、反対側は100.0%との差分。例: 1/16 は6.3%と93.7%。BigIntの整数計算で丸め境界を確定する。
- 色は表示丸め前の勝数・件数から整数比較で判定する。60%超=有利、55%超〜60%=微有利、45〜55%=五分、40〜45%未満=微不利、40%未満=不利。55/45は双方五分、60/40は微有利/微不利。
- 環境全体のミラーは登録有無にかかわらず中立色の「—」。勝率・件数を表示しない。非ミラー0件は「データなし」。
- 1件以上は勝率と「勝数 / 登録試合数」だけを表示し、少数データ・参考値・注意バッジ・件数による色変更は追加しない。
- `totalMatches` はRPCが返す対象登録戦績件数のまま。左右セルの件数を足し直さない。表示前の件数であり、ミラーや表示されないデッキも含む。
- PNGの範囲内に環境名、集計範囲、ランク、対象登録戦績件数、重複登録とミラーの説明を含める。カスタムランクは区分数だけでなく選択した区分名を記載。
- 個人・ゲスト用の共通集計、表示勝率、色、ミラー、未対戦表示、PNG保存・共有処理を維持。

## 変更ファイル

製品コードは5ファイルのみ。

| ファイル | 内容 |
|---|---|
| `src/lib/environment-matrix.ts`（新規） | 環境専用の統合・丸め・色判定。計算量O(集計グループ数 + デッキ数²) |
| `src/app/matrix/page.tsx` | 初期モード、専用計算への分岐、表示用メタデータ |
| `src/components/MatchupMatrix.tsx` | 環境モードの表示。既定の個人・ゲスト描画は維持 |
| `src/components/matrix/MatrixFilters.tsx` | 環境全体／自分の戦績の選択肢 |
| `src/app/guide/page.tsx` | 新仕様の案内 |

追加したテスト・固定ハッシュ:

- `tests/environment-matrix.test.cjs`
- `tests/environment-matrix-scope.cjs`
- `tests/environment-matrix-scope.test.cjs`
- `tests/fixtures/environment-matrix-source-hashes.json`
- `tests/site-metadata-scope.cjs`
- `tests/site-metadata-scope.test.cjs`

更新したテスト:

- `tests/member-matrix.test.cjs`
- `tests/matchup-aggregates.test.cjs`
- `tests/matrix-multi-rank.test.cjs`
- `tests/matrix-created-date.test.cjs`
- `tests/environment-selection.test.cjs`
- `tests/matrix-multi-rank.browser.cjs`
- `tests/matrix-mobile-png-share.browser.cjs`
- `tests/analysis-matchups.test.cjs`
- `tests/environment-deck-data-scope.cjs`
- `tests/environment-trends-scope.cjs`
- `tests/environment-trends-scope.test.cjs`
- `tests/ui-copy-cleanup-scope.cjs`

本書: `docs/environment-matrix-implementation.md`。

## 既存ハッシュ不一致の原因

前回の4失敗は、セキュリティ更新後のコミット `b9fe4b1`（Vercel Web Analytics追加）を古い履歴固定テストが認識していなかったため。
`package-lock.json` の旧ハッシュ `ad6ad5a1…` は当該コミット直前のファイルと一致し、現在の `281c23c1…` との差はAnalytics依存の追加だけである。
テストでJSON構造を比較し、既存依存の変更がないことも確認する。

履歴固定テスト専用の変換で、後続のコミット済みAnalytics・AdSense・privacy変更を正確なGitオブジェクトと照合してから以前の内容を返す。
古い期待ハッシュを上書きせず、現行ファイルに追加変更があれば失敗させる。
実際の機能・ブラウザ・SQLテストは常に現在のコードを実行する。
今回の製品差分も専用の固定ハッシュと、その他すべてのsrc・supabase・依存ファイルが実装前と同一であるテストで限定する。

今回の初期表示変更に伴うテスト修正は、会員用RPCのレスポンス形式と有効な環境UUIDのfixture更新、および環境モードの期待値追加。個人用の旧計算オラクルとHTML完全一致の検証は維持・追加した。

ブラウザfixtureではPostgRESTの列指定を無視していた箇所を修正した。指定されていない所有者フィールドを合成データが返し、遷移前の環境ページのRSCに残っていた問題であり、製品コードの認可変更は行っていない。
ローカルに存在しないVercel Analytics配信エンドポイントだけは空のスクリプトで代替し、それ以外の外部通信は拒否する。

## 検証

- TypeScript型チェック: 成功。
- Lint: エラー0。既存 `tests/dependency-security.test.cjs` の未使用式に関する警告2件。
- ローカル本番ビルド: 成功。Supabase接続先はループバックのテストAPI。
- 単体・履歴固定テスト: 530/530成功。最終結果は `build/environment-matrix/unit-final.log`。
- 会員向けRPC統合テスト: 4/4成功。全ランク・複数条件・権限・不正claim・個別データ非公開・5万件・連続要求を検証。
- 実Next画面→ローカルAuth/PostgREST→メモリ内PostgreSQL→実描画: 110条件成功。集計の期待値は登録行を両視点へ展開した独立オラクル。
- 個人・ゲストのHTMLは改修前コンポーネントと完全一致。分析・入力・DB・認証の製品ファイルも完全一致。
- ブラウザ: 環境・全ランク・旧URL・不正条件・戻る/進む・匿名/未ログイン・デッキ選択・PNG・320〜1920pxの操作確認。デッキ操作とPNGによる追加RPCなし。
- PNG/モバイル共有の追加検証: 成功、PNG出力16回。`build/environment-matrix/mobile-png/report.json` に記録。画面とPNG入力のセル文字列・背景色・文字色一致、共有とダウンロード、失敗・キャンセル・再試行、サイズ上限を検証。

ローカル変換性能（合成データ、各100回、実運用負荷試験ではない）:

| デッキ数 | セル数 | 環境専用変換の中央値 | 95パーセンタイル |
|---|---:|---:|---:|
| 5 | 25 | 0.03ms | 0.07ms |
| 30 | 900 | 0.59ms | 1.04ms |
| 60 | 3600 | 3.04ms | 4.91ms |

集計RPCの回数・返却形式は不変。表示勝率フィールドの追加によりシリアライズ前のセルデータは30デッキで約18KB増加するが、登録行の転送・展開はない。
初期表示変更による全ユーザーRPCの利用頻度増加は本番負荷として別途確認が必要。

主な証跡はGit対象外の `build/environment-matrix/` に保存。`browser/` は110条件のスクリーンショット・PNG・レポート、`mobile-png/` は共有検証の出力。

## 再実行

```powershell
npm.cmd run typecheck
npm.cmd run lint
node --require ./tests/register.cjs --test --test-concurrency=4 tests/*.test.cjs
$env:PGLITE_MODULE=(Resolve-Path 'build/migration-step2-baseline/tools/node_modules/@electric-sql/pglite').Path
node --require ./tests/register.cjs --test tests/member-matrix.integration.cjs
```

ブラウザは既存ローカルPlaywrightとEdgeを使用。依存関係・ブラウザの追加インストールなし。
テスト用ビルドの環境変数を `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54339`、`NEXT_PUBLIC_SUPABASE_ANON_KEY=test-public-key` に設定してビルド後、次を実行する。

```powershell
$env:PLAYWRIGHT_MODULE=(Resolve-Path 'build/environment-trends-tools/node_modules/playwright').Path
$env:CHROME_EXECUTABLE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
$env:MEMBER_MATRIX_BROWSER_OUT='build/environment-matrix/browser'
node tests/matrix-multi-rank.browser.cjs
$env:MATRIX_MOBILE_PNG='1'
$env:MEMBER_MATRIX_BROWSER_OUT='build/environment-matrix/mobile-png'
node tests/matrix-multi-rank.browser.cjs
```

## 本番適用前

- 今回の `.next` はローカルfixture向け。成果物を流用せず、正しい環境変数で再ビルドする。
- 通常会員の実セッションで初期表示・明示的な個人用切り替えを確認する。
- 既存会員RPCの権限を維持し、利用頻度増加による応答時間・DB負荷を確認する。
- 実iOS/AndroidでOSの保存・共有を確認する。ヘッドレスブラウザのWeb Share APIは模擬実行であり、OS共有画面そのものの検証ではない。
- DBマイグレーションは不要。ロールバックは今回のアプリ差分のみを戻せばよい。
- 個別登録の重複は除去していない。登録戦績ベースの件数であり、ユニーク対戦数ではない。
