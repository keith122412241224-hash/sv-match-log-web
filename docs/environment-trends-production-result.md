# 推移分析・本番適用結果（2026-11-15公開／11-16確認）

**本番適用・公開完了。継続運用可。** 利用者の明示承認に基づき、index→正常性確認→RPC→権限・集計確認→Vercel公開の順で実施した。停止条件に該当する本番障害は検出していない。切戻し・RPC停止・index削除・全DB復元は実行していない。以下はJST。

本番URL：https://sv-match-log-web.vercel.app/environment

## 適用結果

| 項目 | 確認済みの結果 |
| --- | --- |
| 対象DB | `xbwxapwaadsrtckxewvx`、東京。直前・翌朝ともACTIVE_HEALTHY |
| 直前バックアップ | 11月15日19:47取得。ID `2265589326`、COMPLETED、物理バックアップ。登録日時同日01:57:20.779。PITR無効 |
| 適用前履歴 | 既適用22件が一致、新2件のみ未適用。配布47コピーと復旧SQLのハッシュ照合済み |
| `20261114104651` | 11月15日19:54適用成功。固定CLI 2.118.0、index専用workdir、transaction=false、CREATE INDEX CONCURRENTLY |
| index確認 | valid/ready/liveすべてtrue。非UNIQUE btree `(environment_id, played_at)`、式・条件・INCLUDEなし。履歴1件、長時間transaction・待機ロック・残存index作成なし |
| `20261114212352` | index確認後、dry-runでこの1件だけを確認。19:55にRPC/ACLをBEGIN〜COMMITで適用成功 |
| 最終履歴 | 翌朝の本番24件とローカル24件が一致。権限強化SQLの再実行、repair、手動履歴変更なし |
| Vercel | `dpl_CBnjgRZX9Wz1ULBYD8B11S3sJDN1`、Production READY。20:01:12.858にREADY、公開alias割当成功 |
| 固定ソース | `fa807d13079bbd9f7892d98c76aaa62cbd8b5244`。レビュー済みアプリ8ファイル・SQL6ファイルをローカルcommitに記録 |
| ビルド | Production設定・Node 24系で新規ビルド成功。Nextコンパイル・型検証・Lint工程成功。依存関係変更なし |

CLI実行全体の観測時間はindex工程約2.37秒、RPC工程約2.58秒。接続・認証・履歴登録を含み、CREATE INDEX単体の時間ではない。タイムアウト延長や自動再試行は行っていない。

クリーンな配布用worktreeからVercel CLI 62.1.0でアップロードした。`.env`、ローカル`.next`、検証ブラウザ、docs/tests/DB SQLは配布対象外。245ファイルの配布一覧と、アプリ8ファイルのレビュー時SHA-256を照合した。実deploymentの`gitCommitSha`・`releaseCommit`も上記commitと一致。`gitDirty=1`は配布用worktreeだけの未追跡`.vercelignore`によるもので、アプリソース変更ではない。

**Gitリモートへのpushは未実施。** Vercelには固定commitのソースを直接公開済み。今後Git連携から再公開する前に、このcommitをリモートへ同期し、古いソースで上書きしないこと。無関係なローカル変更はcommit・配布に含めていない。

## 権限・集計・画面

| 確認 | 結果 |
| --- | --- |
| 新RPC | public/privateともpostgres所有、空search_path。public INVOKER、private DEFINER |
| client EXECUTE | authenticatedのみ。PUBLIC・anon・service_roleは不可。postgres経由の停止操作権限を確認 |
| 実PostgREST | 既存会員セッション（管理者会員）で200。未ログインは401/42501、不正periodは400/22023 |
| 既存DB | 新RPCを除く36関数の定義・所有者・client権限、36ポリシー、17テーブルのRLS/権限、119列、70制約が事前スナップショットと一致 |
| 参照集計 | 現環境・全17ランク・24デッキ・19日＝456日次点。5件数（total/encounters/registrations/evaluations/wins）の全2,280値が一致 |
| 集計の照合方法 | 同一dataThroughに固定し、JSTの各日から6日前までを直接範囲結合する別SQLと比較。環境開始境界・両視点・ミラー・欠損を含む件数が一致 |
| 環境サマリー | 初期表示・遭遇率TOP5・登録戦績を確認。タブを戻しても件数と7日期間を保持 |
| 推移分析 | 初期未選択、3デッキ選択、複数線、指標切替、固定色、件数詳細、14日への変更、独立したタブ期間、ランク変更、別環境への切替に成功 |
| PC/スマホ | 本番1440px／390pxで横はみ出しなし。グラフ・凡例・詳細を画像でも確認 |
| 既存画面 | 戦績入力・分析・相性表が正常表示。ページ例外・HTTP 5xxなし |
| 実戦績入力 | 利用者から公開後の登録成功回答あり。公開直後30分のログでもPOST `/rest/v1/matches` 1件成功、失敗0件 |

本番に架空戦績や試験ユーザーは作成していない。匿名Authユーザー・一般会員別アカウントの本番追加試験は行わず、以前のローカル検証を引き継ぐ。JWT・個別戦績は報告に含めない。

画面確認では、既存入力フォームの空・非表示の`role=alert`を検証スクリプトが誤って失敗判定した。アプリのエラーではないことを確認し、検証コードだけ修正した。アプリへの追加修正はない。

## 本番の実測応答時間

通信を含む少数・逐次の観測値。負荷試験ではなく、p95や高負荷時性能の保証ではない。

| 経路・条件 | 回数 | 応答 |
| --- | --- | --- |
| ブラウザ→PostgREST、7日・1デッキ・全ランク | 1 | 113ms |
| 同、30日・3デッキ・全ランク | 1 | 66ms |
| 同、全期間・24デッキ・全ランク | 1 | 68ms |
| 公開アプリ→Next API→DB、30日・3デッキ | 1 | 1,851ms |
| 同、14日・3デッキ | 1 | 1,123ms |
| 同、14日・ランク変更 | 1 | 1,638ms |
| 同、別環境・14日 | 1 | 1,175ms |

現環境の実期間は19日で、30日／全期間の結果も19日分。長期環境・将来の大量データ・同時アクセスは過去のローカル試験が根拠。本番負荷試験はしていない。Vercel iad1とDB東京の距離、認証・API処理を含むため直接RPCとアプリ経由の時間は異なる。

## 公開後の確認

11月16日08:18〜08:19に読み取りで追跡確認した。

- **公開直後30分（11月15日20:01:12.858〜20:31:12.858）**：戦績登録1件、新RPC11件成功。対象の失敗・HTTP 5xx・取得した各サービスのerror/fatal/panicは0件。
- **20:00〜翌08:18:18**：戦績登録84件、新RPC12件成功、各失敗0件。edge 3,289件、PostgREST 287件、Auth 1,068件、Auth audit 94件、Postgres 123件の利用可能なstatus/severity属性で5xx/errorを検出しなかった。この窓はREADYの約1分前を含む。
- Vercelの同時間窓のruntime error検索は「No runtime errors」。公開aliasは今回のdeploymentを維持し、READY。
- 翌朝のDB：新index・RPC権限正常。長時間transaction0、matches待機ロック0、index作成中0。client backend4、max_connections60（瞬間値）。

前回、Vercel metadataの追加読み取りが利用上限による自動承認レビュー失敗で実行できず中断した。11月16日に同じ操作を正常完了した。**公開直後15〜30分の連続監視ではなく、保存ログを翌朝に遡って確認した。** ログ未記録事象まで存在しなかったことを保証するものではない。

## 残存リスクと復旧

- PITR無効。バックアップはCOMPLETEDだが、Restore実効権限・正確な復旧点・復元所要時間は未確認。全DB災害時のデータ損失ゼロは保証しない。通常復旧は戦績を巻き戻さない。
- 本番の実切戻し・RPC REVOKE・index削除は不要だったため未実施。ローカル検証・DB postgres権限・Vercel対象team OWNER・旧正常deploymentの保持を確認済み。
- CPU/I/O・tempの連続測定、高負荷時性能は未確認。少数呼出しとログでは停止基準への到達なし。
- 全テストは再実行していない。既存49件の単体テスト失敗は変更前にも再現した以前の結果を引き継ぎ、今回修正していない。

障害時は後続公開を止め、旧正常版 **`dpl_AGJiH8dB5BmNGxwD2TF4qssHC3PZ`** へVercelを切り戻す。新RPCの負荷・認可・集計に問題があれば `supabase/operations/environment-trends/disable-rpc.sql` でpublic/private両方の新RPCだけを停止する。既存RPC/RLS・戦績は維持する。REVOKEは実行中クエリを中断しないため終了も確認する。

今回のindexは有効で原則残す。INVALID専用削除SQLを流用しない。履歴repairや対象外DDLを独断で行わず、必要な修復を別途判断する。全DB復元は通常の切戻し手段として使用しない。詳細は[適用・復旧手順](environment-trends-release-runbook.md)を参照。

証跡：Git対象外の `build/environment-trends-production/` 内の `deployment.json`、`rpc-check.json`、`rpc-all.json`、`reference.sql`／`reference.json`、`schema-after.json`、`security-after.json`、`ui-check.json`、`trends-1440.png`／`trends-390.png`、`first-30-minutes.json`、`followup.json`、`vercel-dry.utf8.json`。直前バックアップは `build/environment-trends-release-preflight/backups.json`。CLI適用成功出力と工程時間は本作業の実行記録にある。
