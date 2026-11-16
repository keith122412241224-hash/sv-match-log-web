# 相性表改修：本番リリース準備

確認日: 2026-11-16（JST）。判定: **リリース可能。実行時のmain再確認と、適用直後の実セッション確認・負荷監視を行うこと。**

今回は読み取りによるリリース点検と本書の追加のみ。push、コミット、デプロイ、環境変数変更、DB変更、本番へのテストデータ登録は行っていない。明確な追加不具合は見つからず、製品コードは変更していない。

## 1. Gitと変更範囲

- GitHub Compare APIで、リモートmainとローカルHEAD `bdbeafcdfabbc486eab16ecbbc151b5235df0517` は identical、ahead/behindとも0。履歴の分岐はない。
- 改修はまだ未コミット。現在のmain上に適用されており、現時点で競合はない。リリース直前に再取得して確認する。
- 製品変更は5ファイルのみ。詳細と全テスト変更の目的は [実装・検証報告](environment-matrix-implementation.md) に記載。
- scopeテストを再実行して成功。認証、戦績入力、分析、共通集計、DB/RPC/RLS/インデックス、依存関係が実装前と同一であることを検証した。
- `package-lock.json` 自体に今回の変更はない。以前のハッシュ不一致は、履歴固定テストが後続のWeb Analytics追加コミットを認識していなかったことによる。旧期待値を維持し、既知コミットの正確な内容を照合するテスト補助処理で解消している。
- 対象24ファイルを秘密鍵・GitHubトークン・AWSキー・秘密APIキー・JWTの既知形式で走査し、該当0件。製品差分も確認済み。環境変数の値、個別戦績、ユーザー情報はリリース対象に含めない。
- 作業ツリーには今回と無関係な既存のsecurity資料・テスト21ファイルがある。対象を明示して追加すること。`git add -A` は使用しない。本書を含む対象は25ファイル。
- ローカル証跡: `build/environment-matrix-release/local-audit.json`（対象ファイルの正規化SHA-256と除外一覧）。build配下はコミット対象外。

## 2. 本番設定

Vercelの接続先と現在の本番デプロイを読み取り確認した。

| 項目 | 確認結果 |
|---|---|
| GitHub | `keith122412241224-hash/sv-match-log-web` |
| Vercel team / project | `svmatchlog` / `sv-match-log-web` |
| Production branch | `main` |
| Git自動デプロイ / 本番ドメイン自動割当 | 有効 / 有効 |
| 現行Production | `dpl_2mgD5xhVrAMiwzPdBAKfGQdPbgYv`、READY |
| 現行Productionのcommit | `bdbeafcdfabbc486eab16ecbbc151b5235df0517` |
| 本番URL | `https://sv-match-log-web.vercel.app` |
| 現行デプロイURL | `https://sv-match-log-4lb12211x-svmatchlog.vercel.app` |
| framework / Node / functions region | Next.js / 24.x / iad1 |
| build / install / root directory | カスタム上書きなし |

mainへのpushは本番リリース操作になる。Git連携によるリモートビルドを使用し、CLIによる別デプロイを重ねない。ローカル `.next` はテスト用接続先でビルドした成果物なので、`--prebuilt` 等で流用しない。依存・ランタイム・リージョン・Vercel設定の変更は不要。

環境変数はProductionへの割当と名前だけを確認した。復号・値の出力・ローカルへのpullは行っていない。

| 名前 | Production | 今回への影響 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 設定あり | 必須。追加不要 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 設定あり | 必須。追加不要 |
| `ADMIN_SUGGESTION_WRITES` | 設定あり | 既存設定を維持。値・有効モードは未確認 |
| `NEXT_PUBLIC_SITE_URL` | 未設定 | 既定URLが実際の本番URLと一致 |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | 未設定 | 任意。今回の機能には不要 |
| `OPENAI_API_KEY` | 未設定 | 既存の管理者向けAI週報生成用。今回の対象機能には不要 |
| `OPENAI_WEEKLY_REPORT_MODEL` | 未設定 | 既定値あり。今回の対象機能には不要 |

相性表・個人切替・PNG・入力・分析・認証に必要な環境変数の不足は認められない。値自体の正当性・期限はこの点検では検査していない。管理者AI週報用キーの未設定は今回以前からの別事項。

## 3. RPC負荷と権限

既存の会員向け `get_member_matchup_aggregates_v1` を再利用し、返却済みの集計値だけをサーバー側で統合する。個別戦績・所有者情報を取得する新しいAPIはない。公開関数はinvoker、private側はdefiner、search_pathは空。authenticatedに実行権限がありanonにはない。匿名Authユーザーの扱いも既存の認可を維持する。

1回の環境全体表示に必要なRPC数・RPCレスポンス形式は従来の環境全体表示と同じ。ただし通常会員の初期表示を個人から環境全体へ変えるため、**全ユーザーを対象とする集計RPCの呼び出し頻度は増える**。環境・ランクの変更でも再取得する。デッキ選択とPNG保存では追加RPCを発行しない。

本番の読み取りメタデータ・実行統計から得た参考値:

- matchesの推定live行数: 10,593（統計値であり厳密な件数ではない）。
- `(environment_id, played_at)` インデックスあり。環境条件を利用できるが、対象環境内の登録増加に伴い集計量は増える。
- RPC名を含むSQLの累積統計: 10エントリ、290 calls、加重平均約26.1ms、最大約968.4ms、temp blocks written 0。統計resetは2026-05-26。RPC呼び出し以外の関連SQLを含み得る参考値であり、直近のRPCだけのp95やページ応答時間ではない。
- authenticated / authenticatorのstatement timeoutは8秒。調査時点のmatchesロック待ち0、1分超トランザクション0。
- 現行デプロイを指定した直近1時間のVercel error/fatalログは0件。過去の別デプロイに紐づくRefresh Tokenエラー集計が残っているため、実ログイン・セッション更新も適用後に確認する。
- Vercel iad1とSupabase東京間の通信遅延は既存構成のまま。上記SQL時間には通信やNext.js描画時間を含まない。

ローカルの純粋関数変換は30デッキで中央値0.59ms / p95 1.04ms、60デッキで3.04ms / 4.91ms。30デッキのシリアライズ前セルデータは約18KB増える。重大な追加CPU負荷は観測していないが、本番同時アクセスの負荷試験は実施していない。

現時点でDB変更・キャッシュ追加・リージョン変更を必須とする証拠はない。適用前に同じ環境・ランクでページ/RPCの応答時間を記録し、適用後15〜30分と翌日に頻度・p95・エラー率・DB CPU/接続数/読み取りI/Oを比較する。反復する8秒タイムアウト、通常操作の失敗、同条件の応答時間が継続して基準の2倍を超える場合は調査・ロールバックを判断する（2倍は運用上の提案値）。

## 4. 検証と適用後チェック

検証済み成果物の詳細は実装報告と `build/environment-matrix/` に保存している。

| 検証 | 結果 |
|---|---|
| TypeScript / ローカル本番build | 成功 |
| Lint | エラー0、既存テストの警告2件 |
| 単体・履歴固定テスト | 530/530成功 |
| ローカルPostgreSQL互換DBでの会員RPC統合テスト | 4/4成功（5万行、権限等） |
| 実Next画面→ローカルAPI→DB→描画 | 110条件成功 |
| PNG・共有 | 16出力、画面と文字・色一致、共有/中止/失敗/再試行成功 |
| 今回の再確認 | scopeテスト1/1、差分の空白検査成功 |

個人・ゲスト表示は改修前HTMLと完全一致するテストで確認済み。戦績入力・分析・認証の製品コードは不変。ただしローカルのAuthとWeb Shareはテスト用であり、実本番セッション・実端末のOS共有画面は別途確認する。

適用直後に以下を確認し、アカウント情報や戦績内容を公開のログ・資料へ転記しない。

1. 新デプロイのGit SHA、Production、READY、本番ドメインの参照先が今回のリリースcommitと一致する。
2. 通常会員・管理者が条件なしの `/matrix` を開くと「環境全体」。`scope=mine` / 「自分の戦績」で従来の勝率・件数・色・ミラーに戻り、往復・ブラウザの戻る/進むが動く。
3. A対BとB対Aの表示勝率合計100.0%、登録件数は双方同じ。ミラーは中立色の「—」。0件は「データなし」、1件以上は勝率と勝数/件数だけ。境界・片方向・丸めは合成データのテストで保証し、本番に確認用戦績を追加しない。
4. 環境・全ランク/複数ランク・デッキ選択が反映される。対象登録件数をセル合計で二重計上しない。
5. PCのPNGと実iOS/Androidの保存・共有。画面と数値・色・ミラーが同じで、環境名・ランク・集計範囲・対象件数が含まれる。
6. ログイン/ログアウト/セッション更新、未ログイン・匿名ユーザーの既存アクセス制限。通信内容に他人の個別戦績・ユーザー情報が含まれない。
7. 戦績入力画面の表示と通常の実利用における保存、分析画面の環境・ランク切替。入力の確認は正当な実戦績で行い、架空データを本番に登録しない。
8. RPCタイムアウト・5xx・認証エラー、DB負荷を監視。入力/認証が壊れる、非公開データが露出する、勝率が誤る場合は即時復旧を優先する。

## 5. 本番適用コマンド（未実行）

以下は本番リリース実行が指示された後の手順。PowerShellでリポジトリ直下から実行する。Git/Vercelの書き込み権限やブランチ保護ルールの通過は読み取り点検では保証していない。mainへの直接pushが保護で拒否された場合は既存のPR・レビュー手順を用い、保護設定や履歴を強制変更しない。

まず最新mainを確認し、対象25ファイルだけをステージする。

```powershell
$expectedBase = 'bdbeafcdfabbc486eab16ecbbc151b5235df0517'
git fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'fetch failed' }
if ((git branch --show-current) -ne 'main') { throw 'Unexpected branch' }
if ((git rev-parse HEAD) -ne $expectedBase) { throw 'Local HEAD changed; review again' }
if ((git rev-parse origin/main) -ne $expectedBase) { throw 'Remote main changed; review again' }
if (@(git diff --cached --name-only).Count -ne 0) { throw 'Unexpected staged files' }

$releaseFiles = @(
  'src/app/guide/page.tsx'
  'src/app/matrix/page.tsx'
  'src/components/MatchupMatrix.tsx'
  'src/components/matrix/MatrixFilters.tsx'
  'src/lib/environment-matrix.ts'
  'tests/analysis-matchups.test.cjs'
  'tests/environment-deck-data-scope.cjs'
  'tests/environment-selection.test.cjs'
  'tests/environment-trends-scope.cjs'
  'tests/environment-trends-scope.test.cjs'
  'tests/matchup-aggregates.test.cjs'
  'tests/matrix-created-date.test.cjs'
  'tests/matrix-mobile-png-share.browser.cjs'
  'tests/matrix-multi-rank.browser.cjs'
  'tests/matrix-multi-rank.test.cjs'
  'tests/member-matrix.test.cjs'
  'tests/ui-copy-cleanup-scope.cjs'
  'tests/environment-matrix-scope.cjs'
  'tests/environment-matrix-scope.test.cjs'
  'tests/environment-matrix.test.cjs'
  'tests/fixtures/environment-matrix-source-hashes.json'
  'tests/site-metadata-scope.cjs'
  'tests/site-metadata-scope.test.cjs'
  'docs/environment-matrix-implementation.md'
  'docs/environment-matrix-release-readiness.md'
)
git add -- $releaseFiles
if ($LASTEXITCODE -ne 0) { throw 'git add failed' }
$stagedFiles = @(git diff --cached --name-only)
if (@(Compare-Object $releaseFiles $stagedFiles).Count -ne 0) { throw 'Release file list differs' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Invalid staged diff' }
git diff --cached --stat
node --require ./tests/register.cjs --test tests/environment-matrix-scope.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Product scope changed; review and revalidate' }
```

差分が点検済み内容と一致することを確認してコミットする。点検後にソース・テストを変更した場合は関連検証を再実行する。

```powershell
git commit -m "Improve environment matchup matrix"
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
$releaseCommit = git rev-parse HEAD
git fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'fetch failed' }
if ((git rev-parse origin/main) -ne $expectedBase) { throw 'Remote main changed; do not push' }

# このpushがVercelの本番デプロイを開始する
git push origin HEAD:main
if ($LASTEXITCODE -ne 0) { throw 'Push failed; inspect without forcing' }
```

Vercelで新しいProductionビルドがREADYになるのを確認する。Productionの環境変数でリモートビルドされるためローカルのテスト用 `.next` は使用されない。次のCLIは今回読み取りに利用できたバージョン62.1.0の既存キャッシュ。消去されている場合はインストール済みのVercel CLIを使用する。

```powershell
$vercelCli = 'C:/Users/keith/AppData/Local/npm-cache/_npx/69f9afb961c37556/node_modules/vercel/dist/index.js'
node $vercelCli inspect 'https://sv-match-log-web.vercel.app' --scope svmatchlog
```

表示されたデプロイのcommitが `$releaseCommit` と一致するまで旧ProductionのREADYを完了と判断しない。新デプロイID・URL・時刻を記録し、前節の動作確認を行う。DBコマンド・環境変数更新コマンドは不要。

## 6. ロールバック（障害時のみ、未実行）

今回点検した旧本番は `dpl_2mgD5xhVrAMiwzPdBAKfGQdPbgYv`。適用直前にも本番がこのIDのままか確認する。間に別の本番リリースがあれば、復旧先を改めて記録する。

```powershell
$vercelCli = 'C:/Users/keith/AppData/Local/npm-cache/_npx/69f9afb961c37556/node_modules/vercel/dist/index.js'
node $vercelCli rollback 'dpl_2mgD5xhVrAMiwzPdBAKfGQdPbgYv' --scope svmatchlog --yes
if ($LASTEXITCODE -ne 0) { throw 'Rollback failed; check Vercel project status' }
node $vercelCli inspect 'https://sv-match-log-web.vercel.app' --scope svmatchlog
```

本番ドメインが旧IDへ戻り、相性表・ログイン・入力・分析が復旧したことを確認する。DB変更がないためDBの復元は不要。新たに登録された戦績は保持する。

Instant Rollback後は本番ドメインの自動割当が無効になる。Git側の修正だけで自動公開されると考えず、原因を修正または今回のリリースcommitをrevertし、復旧ビルドを確認してから明示的にpromoteする。[Vercel公式手順](https://vercel.com/docs/instant-rollback)

```powershell
# 最新mainを取り込み、作業ツリーを確認した上で実施する
$releaseCommit = Read-Host '取り消す今回のリリースcommit SHA'
git revert $releaseCommit
if ($LASTEXITCODE -ne 0) { throw 'Revert failed; resolve and review before pushing' }
git push origin HEAD:main
if ($LASTEXITCODE -ne 0) { throw 'Push failed' }
# READYになった修正済みデプロイを動作確認した後に実施する
$recoveryDeployment = Read-Host '確認済みの修正デプロイIDまたはURL'
node $vercelCli promote $recoveryDeployment --scope svmatchlog --yes
```

promoteは本番切替操作であり、確認済みの修正ビルドだけを指定する。失敗版を再度promoteしない。Hobbyでは直前のデプロイがロールバック対象となるため、不要な連続デプロイを避ける。旧本番に紐づいたビルドとその環境設定が復元される。[公式CLI rollback](https://vercel.com/docs/cli/rollback) / [promote](https://vercel.com/docs/cli/promote)

## 未完了・制約

- 今回の本番ビルドと実会員・実端末での適用後確認は未実施（リリース準備段階）。
- 本番の同時アクセス負荷試験・新仕様の実測p95は未取得。
- 環境変数の値・書き込み操作の権限は未検証。既存の任意AI機能のキー不足は今回の変更対象外。
- 製品側の未解決不具合は見つからなかった。既存Lint警告2件は残している。
