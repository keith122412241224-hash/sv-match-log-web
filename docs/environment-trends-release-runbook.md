# 推移分析・本番適用手順（2026-11-15準備完了、未実行）

> **実行状態の更新：2026年11月15日に明示承認を受け、対象2migrationとVercel公開を完了。** [本番適用結果](environment-trends-production-result.md)。本書の未実行・未承認は準備時点の記録であり、適用コマンドを再実行しない。今後の復旧では実状態と履歴を確認する。

> 最新判定：**条件付きGO**。利用者の最新方針に従い、戦績を保持したアプリ／RPC／index単位の復旧を基本に[変更リスクを再評価](environment-trends-risk-reassessment.md)。全DB復元権限・正確な復旧点の未確認は災害復旧課題として残すが、それだけでは自動NO-GOにしない。今回の切戻し権限・担当、直前の履歴／稼働確認、明示承認は必須。まだ本番適用・デプロイは行わない。

**判定：条件付きで本番適用可能。** ローカル履歴の不足と通常index作成による書込みロックの課題を修正し、新しい適用順序・失敗時・復旧SQLをローカルで確認した。実行当日のバックアップ／復旧担当・許容損失の確認と、利用者の明示承認を残す。本書は [直前確認報告](environment-trends-release-preflight.md) の未解決事項と適用案を更新する。

本番にはSELECTによるmigration・schema・indexの確認だけを行った。本番DDL/DML、migration repair、履歴登録、バックアップ復元、index/RPC追加、Vercel公開は実行していない。ステージングは使用しない。

## 変更内容と履歴

| ファイル | 内容・本番状態 |
| --- | --- |
| `supabase/migrations/20261026111607_phase2a_minimize_database_privileges.sql` | 本番既適用分を復元。本番へ再実行しない |
| `supabase/migrations/20261114104651_environment_trends.sql` | 本番未適用の元ファイルをindex専用へ変更。transaction=false、CONCURRENTLY、重複検出、正常性検証、タイムアウト |
| `supabase/migrations/20261114212352_environment_trends_rpc.sql` | CLI `migration new environment_trends_rpc` で生成。正常indexを前提にRPC/ACLだけをBEGIN〜COMMITで適用 |
| `supabase/operations/environment-trends/check-index.sql` | カタログのみを読む正常性ゲート。不在・INVALID・別定義を拒否 |
| `supabase/operations/environment-trends/disable-rpc.sql` | 障害時に新public/private RPC両方のauthenticated向けEXECUTEを停止 |
| `supabase/operations/environment-trends/drop-invalid-index.sql` | 期待した列構成の無効な新indexだけを並行削除。有効indexや想定外の定義は拒否 |
| `scripts/prepare-environment-trends-release.cjs` | 適用段階別workdirとハッシュmanifestを作る。CLI・ネットワーク・DB操作は一切行わない |

Git履歴に元のmigration名のファイルは見つからなかった。commit `50dcc9d` の `docs/security/2026-10-26-hardening-proposal.sql` と、本番 `schema_migrations` に保存されたSQLが改行正規化後に一致することを確認し、保存されたversion/nameで復元した。過去の「提案のみ」というコメントも原文照合のため保持するが、**本番では既適用**である。

本番22件の履歴はすべてローカルに揃った。ローカル24件との差は新index `20261114104651` と新RPC `20261114212352` の2件だけ。本番の履歴修正・SQL再適用は不要。今後別の差が見つかった場合も、無断repairや `--include-all` で押し通さない。

業務schema（public/private/suggestion_private）の比較で、17テーブルのRLS・所有者・会員の基本権限、119列、36ポリシー、36既存関数の定義・所有者・client実行権限、70制約が本番とローカルで一致した。新RPCは比較から除外。既存7indexの定義も確認し、新しい環境ID/日時indexとの同一構成はない。Auth/Storage等の管理schema全体や本番稼働設定を完全再現したという意味ではない。

RPC関数定義とGRANT/REVOKE部分は分離前とバイト単位（LF正規化）で同一。集計ロジック・RLS・アプリコード・依存関係は変更していない。

## CLIとトランザクション方式

固定CLIは `build/stable-operations-creator-backup-tools/supabase.exe` **2.118.0**。ヘルプとローカル実行で確認し、v3への更新はしていない。

- indexファイル先頭は `-- pg-delta: transaction=false`。ファイル内にBEGIN/COMMITを置かず、CLIからCREATE INDEX CONCURRENTLYを単独実行する。
- CLI 2.118.0の `db push --local --skip-vault` で成功と履歴登録を確認した。途中タイムアウトでは先に作られたINVALID indexが残り、そのmigration履歴は記録されなかった。
- RPCファイルはBEGIN/COMMITで関数と権限をまとめる。COMMIT直前に故意のエラーを入れたローカル試験で、両関数が残らずロールバックされることを確認した。
- 公式の現行説明でもtransaction=falseの非transaction実行を案内しているが、GitHub integrationはこの指示を尊重しない。本手順では**実測したCLIと段階別workdir**を使い、DBのGitHub自動適用・SQL一括pipeline・`psql -1`・Management APIでの一括migration適用に置き換えない。[CLIワークフロー](https://supabase.com/docs/guides/local-development/cli-workflows#cleaning-up-generated-migrations)。

index工程のlock_timeoutは2秒、statement_timeoutは30秒。RPC工程はそれぞれ2秒・5秒、idle-in-transactionは3秒。indexの設定は同一セッション内でresetされ、RPC設定はSET LOCAL。永続設定は変更しない。失敗した接続は閉じる。ロック待ちの上限はindex作成全体の無影響保証ではない。

並行作成中も通常のINSERT/UPDATE/DELETEを許容するが、古いtransaction待ち・複数走査・CPU/I/O負荷は残る。作成時間は本番未測定。後段RPCファイルには通常CREATE INDEXもIF NOT EXISTSも残していない。[PostgreSQL CREATE INDEX](https://www.postgresql.org/docs/17/sql-createindex.html)。

## ローカル検証結果

専用の未リンクproject `svml-trends-release-20261115`、API `127.0.0.1:16521`、DB `127.0.0.1:16522`。新規DBに復元した権限強化を含む過去22件を適用し、index→RPCの順で24件にした。既存ローカルDBをresetしていない。

| 確認 | 結果 |
| --- | --- |
| index不在でRPCを適用 | ゲートで拒否。関数の部分公開なし |
| 実書込みtransactionと並行index | 待機中に別会員HTTP INSERT成功、観測8ms（1件の参考値） |
| lock_timeoutによる作成失敗 | INVALID/ready=falseを確認。index migration履歴なし |
| INVALID状態で再実行／RPC追加 | 両方拒否。存在だけで成功扱いしない |
| 無効indexを片付けて再実行 | 並行作成成功、valid/ready/liveと列構成を確認、履歴1件 |
| RPC工程の途中失敗 | 両関数・権限をロールバック |
| 正常なRPC工程 | 会員Auth→PostgREST→RPC成功、匿名Auth・未ログイン・service_roleは42501 |
| 集計と既存機能 | ミラーを含む両視点・件数がサマリーv4と一致。index前・作成中・RPC後に実会員の戦績INSERT成功 |
| 既存schemaへの影響 | 新RPCを除いた関数定義・ACL・テーブル権限・RLS/policy不変 |
| 復旧SQL | 両RPCの権限停止中もサマリー・入力成功。有効index削除は拒否、無効indexのみ削除成功。最後にローカルindex/権限を復元 |
| 最終CLI dry-run | pendingなし。過去22＋新2が各1件記録 |
| 関連テスト | migration構成・変更範囲2テスト成功、全migration ACL/RLSの対象1テスト成功 |
| Lint | 今回変更したJS/CJSファイルは成功 |

PGliteは単一セッションのため、既存の2つのテストloaderではCONCURRENTLYを通常CREATE INDEXへ置換する。**並行性・transaction・実Authの証拠は上記のネイティブ試験**。RPC全文を読む性能スクリプトも新RPCファイルへ参照を更新した。既存の全単体テスト・全DBテスト・9,120件オラクル・性能試験・画面・ビルドは再実行していない。

証跡：`build/environment-trends-release-local/report.json`、`recovery-report.json`、`schema-diff.json`、`index-expected-timeout.log`、`index-success.log`、`rpc-success.log`、`final-dry-run.log`。本番データ・本番資格情報は含まない。

## 実行前の承認とファイル準備

**以下は将来の本番実行用で、今回は未実行。** 利用者の明示承認には対象project・適用する2ファイルのハッシュ・復旧SQL・作業枠を含める。DB適用とVercel公開は別々に承認を確認する。承認記録がなければ変更コマンドへ進まない。index/RPCを一度に適用せず、各確認ゲートで停止する。

ファイル準備だけは次で実行できる（今回生成済み。既存packageがあれば上書きせず停止する）。

```powershell
node scripts/prepare-environment-trends-release.cjs
```

`build/environment-trends-release-package/index/` は過去22＋index、`rpc/` は過去22＋index＋RPCを含む。`manifest.json` にCLI版・本番ref・各ファイルのLF正規化SHA-256がある。生成後にSQLを編集した場合は旧packageを使用しない。原本とのハッシュを再照合する。ローカルで旧一体版migrationを適用済みのDBは、本番用履歴をrepairせず、新しい専用ローカルDBで再現する。

## 本番実行の8段階

### 1. バックアップ・稼働状況

読み取りで最新COMPLETEDバックアップID・登録日時・PITR無効・復元可能な時点を記録。確認方法はDashboardのDatabase > Backups、または固定CLI：

```powershell
& build/stable-operations-creator-backup-tools/supabase.exe backups list --project-ref xbwxapwaadsrtckxewvx --output-format json
```

直近の確認は11月15日06:16 JST、ID `2265589326`、同日01:57 JST登録、COMPLETED。当日の実行直前にも再確認する。`inserted_at` を正確な復旧点として扱わない。matchesのロック・5秒超のtransaction・他のindex作成・CPU/I/O・接続数・既存入力のエラーを確認する。

**停止条件：** 正常バックアップなし、今回必要な旧アプリ切戻し・新RPC停止・index後処理の担当/権限なし、既存障害・長時間transaction・並行DDLあり。まだ変更しない。許容データ損失はゼロで確定済み。全DBの復元権限・正確な復旧点・RTOの未確認は記録するが、それだけで今回の追加変更を自動NO-GOにはしない。

復元には、対象projectのバックアップRestore操作を許可されたプラットフォームアカウントが必要。DBのpostgresログイン・アプリ管理者・バックアップ一覧読取権限とは別。Owner/Admin等のロール名だけで推測せず、担当者の対象projectでのRestore権限とDashboardの復元可否を確認する。**実担当者の復元権限・正確な復旧点・復旧所要時間は未確認**。[アクセス制御](https://supabase.com/docs/guides/platform/access-control)、[復元仕様](https://supabase.com/docs/guides/platform/backups)。

### 2. migration履歴差の解消確認

本番履歴に `20261026111607` があり、index/RPCの2versionが未適用であることを確認する。phase1でdry-runする（`--skip-vault` を付け、roles/seedを含めない）。

```powershell
& build/stable-operations-creator-backup-tools/supabase.exe db push --project-ref xbwxapwaadsrtckxewvx --skip-vault --dry-run --workdir build/environment-trends-release-package/index
```

**停止条件：** pendingが `20261114104651_environment_trends.sql` の1件以外、同名/同等indexの存在、履歴の不一致。`--include-all`、`migration repair`、履歴への手動INSERTを行わない。SQL適用済みだが履歴だけ欠落した場合も、状態を保存して別途承認された照合作業へ回す。

### 3. インデックスの並行作成

**DB適用の明示承認後のみ**、監視用接続を用意し、phase1のdry-runと同じ対象を適用する。`--yes` による無条件確認省略はしない。

```powershell
& build/stable-operations-creator-backup-tools/supabase.exe db push --project-ref xbwxapwaadsrtckxewvx --skip-vault --workdir build/environment-trends-release-package/index
```

**停止条件：** タイムアウト・新たな入力失敗・ロック待ち・予期しないDDL。自分の作業PIDを確認して承認済み手順で中止。他の利用者のtransactionを強制終了しない。失敗時に自動でtimeoutを延長・再実行しない。

**復旧：** INVALIDなら下記の無効index手順。有効indexで履歴も成功なら残して旧アプリを維持できる。接続切断等で結果が不明なら、履歴と実indexを再確認するまで先へ進まない。

### 4. インデックスの正常性確認

`check-index.sql` をSQL Editorまたは承認済み読取接続で実行する。例の `service=svml-production` は安全に設定済みのlibpq接続サービス名であり、今回は作成・利用していない。認証情報をコマンドや報告へ埋め込まない。

```powershell
psql 'service=svml-production' -X -v ON_ERROR_STOP=1 -f supabase/operations/environment-trends/check-index.sql
```

valid/ready/live、非UNIQUEのbtree、列順、条件・式・INCLUDEなしを確認する。加えてphase1の履歴が1件であること、待機中DDLが残らないことを確認。

**停止条件：** ゲート失敗、履歴未登録、既存入力劣化。RPCを追加しない。有効indexは原則残す。INVALIDは別途承認の復旧手順で処理する。

### 5. RPC追加

phase2でdry-runし、pendingが `20261114212352_environment_trends_rpc.sql` だけと確認。DB適用の承認がこの工程も含むことを確認して適用する。

```powershell
& build/stable-operations-creator-backup-tools/supabase.exe db push --project-ref xbwxapwaadsrtckxewvx --skip-vault --dry-run --workdir build/environment-trends-release-package/rpc
# 明示承認・phase1正常性・pending確認後のみ
& build/stable-operations-creator-backup-tools/supabase.exe db push --project-ref xbwxapwaadsrtckxewvx --skip-vault --workdir build/environment-trends-release-package/rpc
```

**停止条件：** 予期しないpending、関数名の衝突、タイムアウト、SQLエラー。COMMIT前のエラーはrollbackを確認する。先行indexは別transactionなので残る。COMMIT後や接続断時は関数・ACL・履歴を照合するまで再実行しない。

### 6. RPC権限と実データ

public/private署名、所有者postgres、INVOKER/DEFINER、空search_path、authenticatedのみのclient EXECUTE、旧関数/RLS不変を確認する。COMMIT直後から会員に直接RPCが公開されるため、UI公開前も監視する。

既存の承認済み会員セッションでPostgRESTへ7日/1デッキを1回、次に30日/数デッキ、全期間/実カタログを逐次・少数回で確認する。匿名・未ログインの拒否、不正引数、両視点・ミラー・JST・同一dataThroughの参照集計一致を確認する。JWT・ユーザー戦績をログに残さず、本番に試験戦績を作らない。既存サマリー・分析の応答と通常入力のエラー状況も確認する。

**停止条件：** 認可漏れ・個人情報返却・値の不一致・既存入力失敗は即停止。schema cacheで新RPC未解決なら公開を待ち、再CREATEしない。8秒timeoutや503反復、同条件で4秒超の反復は条件拡大を止める初期基準。

**復旧：** 新RPCを止め、旧アプリを継続。新関数を消す前にEXECUTE停止で影響を封じる。DB全体を巻き戻さない。

### 7. Vercelデプロイ

**Vercel公開の明示承認後のみ**。DB確認が完了する前に、自動公開されるmain pushをしない。レビューしたcommitとProduction環境変数で新規ビルドする。ローカルURL/JWT/`.next`は流用しない。直前の正常deployment ID・alias・復旧担当の操作権限を保存。

現在確認済みの正常版は `dpl_AGJiH8dB5BmNGxwD2TF4qssHC3PZ`、commit `b318f771a272a04bbfb8eef196401bcf21d7e21b`。実行直前にも更新有無を調べる。

**停止条件：** ビルド失敗、対象project/commit/設定違い。旧aliasの維持を確認し、追加DBを無理に戻さない。公開済みの障害ならVercel DashboardのInstant Rollbackで保存した正常版へ切り戻す。DBは別途判断する。

### 8. 公開後の画面・性能

会員ログイン、戦績入力、分析、環境サマリーを先に確認し、推移のデッキ複数選択・指標/期間/ランク切替・PC/スマートフォン・取得エラーを確認する。本番に試験データを書き込まず、本人の通常利用で入力を確認する。

直後15〜30分と翌日の通常利用で、既存機能の遅延/失敗、新API 503、SQL42501/42883/57014、CPU/I/O・接続数・temp・ロックを監視する。本番へ負荷試験を持ち込まない。

**停止・復旧：** 既存入力失敗・認可漏れ・集計不一致は旧版切戻しと必要な新RPC停止。タイムアウト・継続的な性能悪化も公開継続しない。少数サンプルからp95を断定しない。

## 障害別の復旧操作（別途承認後のみ）

### アプリ／RPC単位の復旧を原則とする

Vercelの旧版切戻しを行い、alias・ログイン・入力・分析・サマリーの回復を確認する。Instant RollbackはDBを戻さない。切戻し後は本番ドメインの自動割当が無効になるため、再公開は明示的なpromote等で行う。[Vercel復旧仕様](https://vercel.com/docs/instant-rollback)。

直接RPC呼出しまで止める場合は、承認済み接続で `disable-rpc.sql` を実行する。これはpublic/private両方のEXECUTEを取り消す。既存RPC・RLS・戦績は変更しない。実行中クエリの停止は別途確認する。復旧のために全会員をログアウトする必要はない。

```powershell
psql 'service=svml-production' -X -v ON_ERROR_STOP=1 -f supabase/operations/environment-trends/disable-rpc.sql
```

### 無効index

作業を直列化し、作成プロセスが終了していることを確認。名前・列構成・INVALID・migration履歴を記録してから、削除を明示承認する。

```powershell
# transactionで包まない。-1 / --single-transaction を付けない
psql 'service=svml-production' -X -v ON_ERROR_STOP=1 -f supabase/operations/environment-trends/drop-invalid-index.sql
```

不在・有効・別定義ならスクリプトは止まる。削除後はindex不在を確認し、履歴も未記録なら原因解消と再承認後にphase1からやり直せる。履歴が記録済みなら、本書の単純な再実行対象ではない。手動repairや無条件削除をせず、実状態と履歴を揃える別の修復案をレビューする。有効indexの書込み負荷が問題の場合も、この無効index用ファイルを流用しない。

### 全DB復元

戦績破損などアプリ／RPC単位では回復不能で、復元が不可欠と判断した場合だけ。書込み停止、復旧点以降のデータ保全、失われる戦績範囲・停止時間の合意、明示承認を先に行う。PITR無効のため任意時刻へ戻れるとは扱わない。復元後はAuth・ACL/RLS・戦績・Storage整合・履歴を確認する。今回の追加index/RPCだけの失敗では通常不要。

## 残存リスクと最終判定

解消済み：ローカルの既適用履歴不足、通常index作成の書込みロック、無効indexの見逃し、RPC工程の前提不足。適用ファイル・段階別package・復旧SQL・ローカル証跡を用意した。

未確認：当日の復元操作権限・正確な復旧点・RTO、並行作成の本番時間、実データの偏り・CPU/I/O・接続プール、本番Auth/PostgREST/Vercel経由の新機能。前回確認の本番work_memは2,184kB（ローカル4,096kB）、parallel gatherは1（ローカル2）、Vercel現行iad1→DB東京であり、ローカル時間を本番へ換算しない。

**準備は完了、最新判定は「条件付きGO」。** 実行当日のバックアップ状態・今回必要なアプリ／RPC／index単位の切戻し権限・担当・稼働状況を確認し、各変更への明示承認を得た後に、本書のゲートを順番に通過する。全DB災害復旧の未確認事項は別に追跡する。今の時点で本番への変更は許可・実行されていない。
