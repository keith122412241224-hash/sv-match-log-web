# 推移分析・Git同期準備（2026-11-16）

**準備完了、push承認待ち。** 本番DB変更・Vercel設定変更・デプロイ・GitHubへの書込みは行っていない。`git fetch --no-tags origin main` とサービス設定の読取り、ローカルの同期準備のみ実施した。

## 履歴と同期方法

- 対象は公開repository `keith122412241224-hash/sv-match-log-web`。
- 取得した最新`origin/main`は `b318f771a272a04bbfb8eef196401bcf21d7e21b`。
- 公開済みcommit `fa807d13079bbd9f7892d98c76aaa62cbd8b5244` の親がそのmainであり、リモート固有の追加commitや競合はない。
- 既存mainを祖先としてそのまま維持し、`fa807d1`＋報告書・検証コードの追加commitを通常のfast-forward pushで同期する。merge/rebase/cherry-pickやforce pushは不要。
- 承認後に再fetchする。mainが今回の確認値から動いていた場合はpushを止め、追加差分を改めて統合・報告する。履歴の書換え・force pushはしない。

公開済み`fa807d1`の14ファイル（アプリ8、SQL6）は変更していない。新2migration `20261114104651`／`20261114212352`、復元した既適用migration `20261026111607`、復旧SQL3ファイルは既に同commitに含まれる。**Git同期でこれらのSQLを再適用しない。** 復元ファイルの「proposal」コメントは元SQLとの照合のため保持しているが、本番は既適用である。

追加commitには、推移分析の実装・検証・適用手順・リスク再評価・当日確認・本番適用結果・本書、開発検証方針、配布準備スクリプト、推移分析テストと関連する既存テスト更新、レビュー済みファイルのハッシュ一覧を含める。無関係な`docs/security/`、`tests/security-phase2*`、`build/`のブラウザ・ログ・実データ検証成果物は含めない。

## 検証コードの整合性

未コミットの`member-matrix.integration.cjs`は、RPC追加前のindex migrationでRPC2関数を期待していたため、対象1テストで`0 !== 2`を再現した。RPC側version `20261114212352`へ検査時点を修正した。

また、復元済みの権限強化migrationを読み込むと、従来のスナップショットとは意図的に権限が異なる。レビュー済みSQLのハッシュを確認したうえで、`handle_new_user`のEXECUTE、`set_updated_at`のsearch_path、指定8テーブルのTRUNCATE権限だけが変わることを明示的に検証するようにした。検査を省略せず、その他の関数・テーブル権限・RLS/policy不変を引き続き比較する。

確認結果：

- 当該の全migration・既存権限維持テスト1件：成功（ネットワーク禁止のローカルPGlite）。
- 推移分析の変更範囲・migration一覧・関連単体テスト計7件：成功。
- 修正したテストファイルのLint：成功。
- 公開済みアプリ・SQL・package/lockとの差分なし。全単体テストや本番動作試験は再実行していない。

最初のテスト起動はPGliteのモジュール指定不足で実行できなかったため、既存のローカルインストールを`PGLITE_MODULE`で指定して実行した。依存関係の追加はしていない。既存49件の単体テスト失敗を解消したという意味ではない。

## シークレット確認

push予定の公開commitの変更14ファイルと、追加commit候補の本文を検査した。秘密鍵、GitHub token、Supabase secret/PAT、完成したJWT、AWS access key、認証情報付き接続URLのパターンは検出なし。追跡済みの機密ファイル名も検出なし（既存`.env.example`を除く）。これはパターン検査と対象ファイルレビューの範囲であり、あらゆる形式の未知の秘密を保証するものではない。

ローカル試験スクリプトのpassword/token変数は、実行時に作る使い捨て値やローカルCLI statusからメモリ内で読む値であり、本番資格情報のリテラルではない。ドキュメントのproject/deployment ID・バックアップIDは操作資格情報ではない。`.env.local`、`.vercel/`、検証用ブラウザprofile、セッション、`build/`はGit対象外。明示したファイルだけをaddし、`git add .`は使用しない。

## Vercelへの影響

11月16日08:27 JSTの本番project APIで以下を確認した。

| 設定 | 現在値 |
| --- | --- |
| project | `prj_u05Rd6SiqYBd5DXX0mPISO0TKNld` / `sv-match-log-web` |
| Git連携 | GitHub、上記repository、repoId `1251260261` |
| Production branch | `main` |
| `gitProviderOptions.createDeployments` | `enabled` |
| `autoAssignCustomDomains` | `true` |
| build/install/root directory | カスタム指定なし。既存packageのNext build |
| Ignored Build Step | API上の指定なし |

**mainへのpushでProductionの自動ビルド・公開が発生する想定。** 公式仕様もproduction branchへのpushによる自動公開を案内している：[Vercel Git連携](https://vercel.com/docs/git)。pushは実行していないため、このpushの配信イベントやビルド結果は未確認。

今回の配布済みアプリ・SQLと同期候補の内容は同一。ただしGit連携ビルドは前回CLIビルドと別のdeploymentであり、報告書・テストもGit checkoutに含まれる。Production環境変数・依存サービスの現在状態で新規ビルドされるため、再公開後の確認は必要。package/lock、アプリ設定、Vercel設定は変更しない。

repositoryにGitHub Actions workflow／`vercel.json`はなく、packageのbuild/installにDB migration実行処理もない。今回の手順ではDBコマンドを実行しない。外部の未確認webhook全体まで検査したとは扱わない。

本件は既存の本番公開済み実装の同期なので、**通常pushと、それに伴うProduction再公開をまとめて承認してもらう方法を推奨**する。別ブランチをGitHubへpushしてPreviewを作る必要はない。再デプロイを避ける場合は、自動デプロイの一時停止等を別途具体化して承認を受ける。勝手に設定変更やskip用commitを追加しない。

## 承認後の実行と停止条件

1. `git fetch --no-tags origin main`。remote mainの変化、push対象commit、ファイル一覧とハッシュを再確認。不一致・想定外ファイルで停止。
2. `git push origin <承認された完全commit SHA>:refs/heads/main`。通常pushのみ。non-fast-forward／保護ルールで拒否されたら停止し、forceや保護解除をしない。
3. GitHub mainが対象commitを指すことを確認。Vercelの自動deploymentを追跡し、対象project・commit・Production環境・READY・aliasを確認。手動deployを重ねない。
4. ビルド失敗なら現行aliasの維持を確認して停止。公開後はサマリー・推移分析・既存入力画面とエラーログを少数・逐次で確認。
5. 公開後障害なら、**同期直前の正常版 `dpl_CBnjgRZX9Wz1ULBYD8B11S3sJDN1`** への切戻しを優先する。DBは既に正常稼働しているため、migrationを再適用・逆適用しない。Git履歴は削除せず、必要なら通常のrevert commitを別途レビューする。

証跡（Git対象外）：`build/environment-trends-git-sync/vercel-project.json`、`candidates.json`、`member-matrix-before.log`、`member-matrix-after.log`、`scoped-tests.log`。本番公開結果は [environment-trends-production-result.md](environment-trends-production-result.md)。
