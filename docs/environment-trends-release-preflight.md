# 推移分析・本番適用直前確認（2026-11-15 JST）

> 更新：本書は修正前の確認記録。ここで検出した履歴差・index工程は、その後の準備作業で解消・ローカル検証済み。現在の判定と実行手順は [本番適用手順](environment-trends-release-runbook.md) を参照。本番は引き続き未適用。

**判定：条件付きで可能。現在のSQLをそのまま適用する判断は保留。** 集計・認可の新たな不整合は見つからなかったが、通常のインデックス作成が戦績書込みを待たせる点と、本番だけに存在する既適用マイグレーションを解消する必要がある。バックアップの存在は確認できたが、復旧操作権限・正確な復旧点・許容データ損失の確認も適用条件に残る。

今回は本番のメタデータ・設定・バックアップ一覧・Vercelの現行デプロイを**読み取りのみ**で確認した。本番DDL/DML、バックアップ作成・復元、設定変更、migration適用、Vercelデプロイはしていない。ステージングは使用していない。アプリ・SQL・テストコードは変更せず、成功済みテストも再実行していない。

本書は [実装・ローカル検証報告](environment-trends.md) の「本番未確認」と従来の適用案を更新する。特に、通常CREATE INDEXを含む現行migrationに30秒のstatement_timeoutを設定するだけでは、入力への影響を十分に抑えられない。

## 1. 確認対象・結果

| 項目 | 状態 | 結果 |
| --- | --- | --- |
| 最新バックアップの存在 | 確認済み | 11月15日06:16 JSTに再取得。最新は01:57 JST登録、COMPLETED。PITR無効 |
| 本番の復旧実行可能性 | 未確認 | 復元操作権限、正確な復旧点、所要時間、許容損失の合意は未確認 |
| SQLの認可・集計定義 | 確認済み | 既存共有集計方針との整合、限定した引数、固定search_path、明示EXECUTEを再確認 |
| インデックス作成方法 | 問題あり | 通常CREATE INDEXは戦績のINSERT/UPDATE/DELETEと競合する。並行作成への工程分離を推奨 |
| migration履歴 | 問題あり | 本番の既適用 `20261026111607` が手元にない。履歴を揃える前の一括適用を行わない |
| 現時点の競合 | 確認済み（瞬間値） | 11月14日21:25/21:28、15日06:17 JSTの観測ではmatchesのrelation lock・5秒超の他トランザクションなし |
| 本番実行時間・実通信 | 未確認 | 新RPC・indexとも未適用。本番での作成時間・RPC負荷測定は行っていない |
| Vercel復旧先 | 確認済み | 現行Production READYのID・commit・aliasを保存。復旧操作そのものは未実施 |

Supabase対象は `SV Match Log Project` / `xbwxapwaadsrtckxewvx` / 東京 `ap-northeast-1`。Vercelは `sv-match-log-web` / `prj_u05Rd6SiqYBd5DXX0mPISO0TKNld`。

## 2. 最新バックアップと復旧の限界

2026-11-15 **06:16:42 JST**、既存CLI 2.118.0の読み取り専用 `backups list` で確認した。接続済みプラグインにバックアップ一覧機能がないためCLIを使用した。

- 最新ID：`2265589326`
- status：`COMPLETED`、物理バックアップ、WAL-G有効
- `inserted_at`：`2026-11-14T16:57:20.779Z`（**11月15日01:57:20.779 JST**）
- 一覧にCOMPLETEDが8件。保持世代数の設定や将来の保持を8世代と断定しない。
- PITR：**無効**
- 確認時点のレコード経過時間：約4時間19分。`inserted_at` は完了時刻・正確な復旧可能時刻ではなく、一覧に `completed_at` や正確な復旧点は返っていない。

11月14日の前回結果（最新ID `2255578751`）より新しいバックアップを確認できた。ただし「バックアップ一覧を取得できた」ことは「実行担当が復元できる」ことの証明にはならない。Dashboardで対象バックアップの復元可否と担当者の権限を確認し、許容RPO（失ってよいデータの範囲）／RTO（復旧まで待てる時間）を決める。条件を満たさなければ適用を停止する。必要な追加バックアップは保管場所・アクセス制限・復元方法を定め、別途承認後に取得する。

前回は合成ローカルDBのバックアップを別ローカルDBへ復元し、戦績・関数・所有者・ACL・RLSを照合済み。本番バックアップの復元試験や本番規模での復旧所要時間の測定ではない。全DB復元では復旧点以降の戦績を失い、停止も伴い得る。Storage実ファイルはDBバックアップと別管理となる。[Supabaseのバックアップ仕様](https://supabase.com/docs/guides/platform/backups)。

今回の変更は追加のRPC・indexのみなので、通常の復旧は旧アプリへの切戻しと新RPCの停止で行う。全DB復元を第一選択にしない。

## 3. マイグレーションSQLの最終確認

対象：`supabase/migrations/20261114104651_environment_trends.sql`

SHA-256：`7d51a85484fcf49071a0515a2ade73b997be7b52458025079477722ce09f09d9`。今回の確認前後で変更なし。

確認済み事項：

- 追加するのは `(environment_id, played_at)` の非UNIQUE indexとpublic/privateの新RPC。既存データの更新・削除、既存RPC・RLSの変更はない。
- private関数はpostgres所有のSECURITY DEFINER。所有者権限による共有集計であり、利用者の行別RLSをそのまま適用する方式ではない。既存サマリーv4と同じ会員向け集計方針として、`auth.uid()` とJWTのJSON boolean `is_anonymous=false` を検査する。
- public関数はSECURITY INVOKER。両関数とも `search_path=''`。PUBLIC・anon・authenticated・service_roleから一旦権限を取り消し、authenticatedにのみEXECUTEを付与する。所有者postgresの権限は残る。
- 本番のpublic関数のデフォルトACLは広いが、上記REVOKEにより新関数にそのまま残らない。作成から権限制限まで同一トランザクションで公開することが必須。
- 期間・17区分ランク・1〜1,000件の有効デッキ・選択環境の所属を検証。動的SQLなし。会員の個別戦績・ユーザーID・管理者専用情報は返さない。
- 両視点勝率、ミラー、分母、環境開始日／集計終了日時、JST、7暦日移動集計、欠損値とサンプル基準は既存報告どおり。入力予約日時は集計境界に使わない。

**履歴の差：** 本番には `20261026111607_phase2a_minimize_database_privileges` が既適用だが、ローカルmigrationディレクトリにない。本番履歴に保存されたSQLは `docs/security/2026-10-26-hardening-proposal.sql` と改行等を正規化した比較で一致した。実カタログでもhandle_new_userの一般実行禁止、set_updated_atの空search_path、会員のmatches TRUNCATE不可を確認した。提案書内の「未適用」を示す古いコメントを現状判断に使わない。

適用前に本番記録と同一の過去migrationをローカルの履歴管理へ復元してレビューする（**本番に再適用しない**）。本番履歴をrepairで書き換えて合わせたり、古いSQLを再送したりしない。前回ローカル検証にはこの権限強化が含まれなかったため、履歴復元後はこの差に関係する会員Auth/RPCの確認に限って追加検証する。今回その変更・再試験は行っていない。

## 4. インデックス作成時の影響と推奨方法

### 本番の規模・観測

11月15日06:17 JSTの統計：推定生存戦績 **10,462件**、テーブル **2,031,616 bytes（約1.94MiB）**、既存index合計 **2,670,592 bytes（約2.55MiB）**。件数は統計値で、COUNTによる確定値ではない。新index・新RPCはともに存在しない。

11月14日に確認した既存7indexはすべてvalid/ready。環境IDを先頭にするindexはない。11月14日21:25から15日06:17に累積INSERT統計は10,467→10,523と増加しており、稼働中の書込みがある。今回の観測時にはmatchesの競合ロック・index作成進行・他の5秒超トランザクションはなかったが、適用時の無競合は保証しない。

### 現行SQLをそのまま使うリスク

通常のCREATE INDEXは `SHARE` lockを取得し、INSERT/UPDATE/DELETEの `ROW EXCLUSIVE` と競合する。現行ファイルはBEGINからCOMMITまでindexとRPC作成をまとめているため、書込み待ちはindex完成まででなくトランザクション終了まで続き得る。通常のSELECTはこのSHARE lockと競合しないが、CPU・I/O負荷や他DDLの待ち行列による遅延は残る。[PostgreSQLのロック仕様](https://www.postgresql.org/docs/17/explicit-locking.html)。

本番の確認セッションは `lock_timeout=0`、`statement_timeout=120s`、`idle_in_transaction_session_timeout=0`。現行ファイルにはタイムアウト設定がない。API側は8秒のstatement_timeoutが設定されているため、DDLが長引くと入力APIの失敗につながり得る。`lock_timeout=2s` はロック取得待ちだけを制限し、取得後の保持時間を制限しない。statement_timeoutも各文の制限であり、複数文全体の上限ではない。

前回ローカル100万件の通常index作成〜rollbackは477msだったが、競合書込みなし・異なるCPU/ストレージの結果。本番約1万件が何msで終わるかは未測定であり、「入力を止めない」とは判定できない。

### 推奨：並行index作成とRPC適用を分ける（提案・未変更）

1. 本番未適用のmigrationを、**単独・autocommitのindex工程**と**RPC/ACLのみのトランザクション工程**に分ける。履歴記録と適用ツールのトランザクション動作も含め、実行ファイルを事前レビューする。
2. index工程は `CREATE INDEX CONCURRENTLY matches_environment_played_at_idx ON public.matches (environment_id, played_at)` を使う。BEGINや暗黙の一括トランザクションに包む実行方法では使えない。
3. 通常の戦績書込みを許容したまま作成できる一方、複数回の走査・古いトランザクションの終了待ち・CPU/I/O負荷は残る。失敗するとINVALID indexが残る場合がある。[CREATE INDEX仕様](https://www.postgresql.org/docs/17/sql-createindex.html)。
4. `indisvalid`・`indisready`・`indislive`、列順・btree・非UNIQUE・条件なしを確認し、期待どおりの場合だけRPC工程へ進む。名前の存在だけでは成功扱いしない。
5. 後段から元の通常 `CREATE INDEX IF NOT EXISTS` を除く必要がある。並行作成を先に済ませても、この文を残すとSHARE lockを取得する。PostgreSQL 17の実装は存在判定前にテーブルをロックするため、IF NOT EXISTSを無競合の保証に使えない。[PostgreSQL実装](https://raw.githubusercontent.com/postgres/postgres/REL_17_STABLE/src/backend/commands/indexcmds.c)。
6. index工程の初期運用案は同一専用セッションのlock_timeout=2秒、statement_timeout=30秒。RPC工程はlock_timeout=2秒、statement_timeout=5秒、idle_in_transaction_session_timeout=3秒を初期案とし、実行ツールの文送信方法と総時間監視をローカルで確認して確定する。永続的なDB設定は変えない。超過時に自動延長・連続再試行しない。

工程分離を行う場合、SQLハッシュが変わるので、変更部分の適用・失敗時残存・権限公開・並行書込みのローカル確認が必要。既存の集計テスト全部を繰り返す必要はない。今回は利用者の「原則コード変更なし」に従い、**分離版の作成・適用・テストは未実施**。一括transactionでしか適用できないツールに無理にCONCURRENTLYを渡さない。履歴は実際に完了した工程と一致させる。

現行ファイルを維持する代案は、短い入力待ちのリスクを明示的に受け入れた低負荷の作業枠で、ロック保持全体を監視して実行する方法。ただし無停止を要件とする場合には推奨しない。

## 5. 本番とローカルの差

設定は11月14日21:25〜21:28 JSTの本番カタログと前回のローカル実測を比較した。

| 項目 | 本番 | ローカル実検証 | 含意 |
| --- | --- | --- | --- |
| PostgreSQL | 17.6 / ARM64、platform 17.6.1.127 | 17.6 / x86_64、image 17.6.1.171 | 同じメジャーだが実装環境・管理パッチが異なる |
| work_mem | 2,184kB | 4,096kB | 本番は一時ファイルが増える可能性 |
| shared_buffers | 224MiB | 128MiB | 単純な性能換算はできない |
| max_connections | 60 | 100 | 接続余裕が小さい。APIプール実効値は未確認 |
| parallel workers / gather | 1 | 2 | 全期間走査の並列性が異なる |
| authenticated / authenticator statement_timeout | 8秒 / 8秒 | 8秒 / 8秒 | ロール設定は同じ。実接続での上書きは適用後に確認 |
| authenticator lock_timeout | 8秒 | 8秒 | 入力遅延の余裕として使わない |
| private USAGE | authenticatedのみ（比較したclient3ロール中） | 同じ方針 | 新RPCでschema権限の追加不要 |
| 既存サマリー所有者・EXECUTE | postgres所有、postgres/authenticated | 同じ方針 | 新RPCの既存公開範囲と整合 |
| migration | 既存21＋権限強化1 | 既存21＋推移1 | 件数22が同じでも内容が違う |
| 通信 | Vercel現行 `iad1` → Supabase東京 | loopback | 実HTTP時間は本番で別途確認 |

本番のRLSはmatchesで有効。public/private schemaのCREATE権限はanon・authenticated・service_roleにはない。権限強化migrationの差は新RPCの想定権限を広げるものではないが、ローカル再現性の差として残る。

本番Auth/PostgRESTの稼働バージョン、API公開schema設定、JWT/OAuth/CAPTCHA、実接続プール、Vercel Production環境変数の値とFunction実効制限、復元操作権限は未確認。秘密値の一括取得は行っていない。既存会員セッションでの新RPC呼出しと本番設定によるビルドを公開ゲートにする。ローカル用URL/JWT/ビルド成果物を本番へ持ち込まない。

既存のローカル性能結果は100万件・60デッキ・全ランク・全期間365日で中央値1,856ms、8会員24要求でp95 2,501ms／最大2,584ms／エラー0。30日は中央値147ms。これを本番の所要時間・容量保証とはしない。今回、本番にEXPLAIN ANALYZEや負荷試験は実行していない。

## 6. DB適用からアプリ公開までの順序（未実行）

| 順序 | 実施内容 | 次へ進む条件 |
| --- | --- | --- |
| 1 | 本書の条件を解消：欠けた既適用履歴をローカルへ復元、index/RPC工程を確定、変更箇所だけローカル確認 | 適用ファイル・ハッシュ・履歴処理・復旧SQLをレビュー済み |
| 2 | DB適用・Vercel公開・必要時の切戻しについて利用者の明示許可を得る。実行者・監視担当・作業枠を確定 | DBだけの許可ならVercelは進めない |
| 3 | 最新バックアップID/復旧点/担当権限/RPO/RTO、対象project、規模、ロック、履歴、同名object、現行deploymentを直前再確認 | 不明・予期しない差があれば停止 |
| 4 | リリースcommitを固定し、適用対象一覧をdry-run等で確認 | 今回の追加工程だけ。権限強化の再適用や他pending migrationなし。DB確認完了前に自動公開されるmain pushをしない |
| 5 | 監視用の別接続を用意し、並行index工程を単独実行 | 成功・有効性・定義・履歴を確認。INVALIDや競合があればRPCへ進めない |
| 6 | index文を含まないRPC/ACL工程をトランザクションで適用 | 関数・所有者・ACL・search_path・履歴を確認。途中公開なし |
| 7 | 下記のDB適用後ゲートを実施。現行アプリは維持 | 認可・値・実性能・旧機能に問題なし |
| 8 | 明示許可のある固定commitをProduction設定で新規ビルド・デプロイ | ローカル成果物を流用しない。ビルド失敗時は公開先aliasが旧版のままか確認 |
| 9 | 公開直後に旧機能と推移画面を確認。15〜30分と翌日の通常利用を監視 | 異常時は下記停止基準に従い切戻し |

新RPCが認証会員から直接呼べるのはDBのCOMMIT直後からであり、UI公開前も認可・負荷の責任が生じる。DB工程を成功させただけで無監視のまま長時間放置しない。

### DB適用後・アプリ公開前の必須ゲート

- public/private新関数の署名・定義・所有者postgres・空search_path・INVOKER/DEFINERを照合。EXECUTEは所有者とauthenticatedのみ。RLS・既存関数・ACLに想定外の変更なし。
- indexのvalid/ready/live・列順・条件・非UNIQUE、migration履歴、残ったロック/idle transactionを確認。PostgRESTから新RPCが解決できるまで公開を待つ。schema cache反映遅延を理由に再CREATEしない。
- **実会員JWT → 本番PostgREST**で7日/1デッキを逐次1回から確認。未ログイン・匿名Auth・不正引数の拒否も、利用可能な既存セッションの範囲で確認する。本番に試験ユーザーや合成戦績を作らない。JWT・個人データを証跡に保存しない。
- 30日/数デッキ→全期間/有効カタログの順に少数・逐次確認。日付境界、件数、両視点・ミラー、欠損、低サンプル、応答量・時間を記録する。同じdataThrough・JSTの窓に揃えた参照集計と照合し、サマリー168時間と推移7暦日を直接比較しない。
- 既存の環境サマリー・分析・戦績入力経路のエラー/待機を確認。戦績の新規書込み確認が必要なら、本人による実際の通常入力で確認し、試験用の本番更新・削除で代用しない。
- 本番の新API経由の画面はアプリ公開後に確認する。公開前のRPC成功だけで、VercelのCookie/SSR/API連携まで確認済みと扱わない。

## 7. 停止判断と復旧

以下は適用・復旧の許可を得る際に確定する運用基準。今回は実行していない。

| 発生状況 | 停止・復旧方針 |
| --- | --- |
| バックアップ利用可否・復元担当・許容損失が不明／履歴差／想定外のSQL | 適用開始しない。履歴repairや無関係な設定変更で回避しない |
| indexがタイムアウト／INVALID／DDL待機、既存入力に失敗や新たなロック待ち | 後続を止める。自分の作業PIDを確認して承認済み手順で中止。他ユーザーのセッションを自動terminateしない |
| 認可漏れ・個人情報返却・集計不一致 | アプリ公開を止める。公開済みなら旧版へ切戻し、新public/private RPCを両方停止 |
| 既存入力の失敗、既存サマリー・分析の継続的な悪化 | 即座に確認範囲を拡大せず切戻し判断。新RPC直接呼出しの負荷も確認 |
| 新RPCで8秒タイムアウト、503反復 | 公開/確認拡大を停止。SQL57014、42501、42883、PostgRESTのschema解決エラーを区別 |
| 同条件の新RPCが繰り返し4秒超 | 8秒制限の半分を初期警戒値とする。高負荷条件へ進まず調査。少数要求からp95を算出しない |
| Vercelビルド失敗 | aliasが旧版のままなら旧版を維持。追加DBは残せる。DB全復元不要 |
| 公開後のUI/API障害 | 保存した直前Productionへ切戻し、alias・会員ログイン・入力・分析・サマリーの回復を確認 |

### Vercel切戻し先

11月15日06:17 JSTに現行Production READYを再確認：

- deployment：`dpl_AGJiH8dB5BmNGxwD2TF4qssHC3PZ`
- commit：`b318f771a272a04bbfb8eef196401bcf21d7e21b` / `main`
- URL：`sv-match-log-9yvlmm26c-svmatchlog.vercel.app`
- 現行alias：`sv-match-log-web.vercel.app`、`sv-match-log-web-svmatchlog.vercel.app`、`sv-match-log-web-git-main-svmatchlog.vercel.app`

適用直前に更新がないか再確認し、その時点の正常版を保存する。VercelのInstant Rollbackはアプリの公開先を戻す操作で、DBは戻らない。切戻し後は本番ドメインの自動割当が無効になるため、復旧後の再公開には明示的なpromote等が必要。担当者の操作権限・対象deploymentの利用可能性も実行前に確認する。[Vercelの復旧仕様](https://vercel.com/docs/instant-rollback)。

### DBの復旧範囲

1. **RPC工程のCOMMIT前失敗：** rollback／接続終了を確認し、関数・権限・履歴の残存を読む。先行して完了したCONCURRENTLY indexは別トランザクションなので残る。COMMIT後にROLLBACKを送っても元には戻らない。
2. **新RPCの停止：** 承認済み復旧migrationでpublic/private両方の `get_environment_trend_aggregates_v1(uuid,text,text[],uuid[])` のauthenticated向けEXECUTEを取り消す。既存RPC/RLSは変更しない。直接RPC呼出しも止める目的であり、実行中クエリの終了は別途確認する。既存JWTの無効化や全会員のログアウトは不要。
3. **indexの失敗・残存：** INVALIDをIF NOT EXISTSで正常扱いしない。有効な追加indexは旧アプリと共存できるので通常は残す。書込み負荷が問題、またはINVALID残存なら依存関係を調べ、承認済み手順で新indexだけを `DROP INDEX CONCURRENTLY` 等により処理する。これもトランザクション外で行い、履歴と実状態を整合させる。自動再作成・履歴だけのreverted操作はしない。
4. **全DB復元：** 戦績破損等で不可欠と判断した場合だけ別途明示承認する。書込み停止、復旧点以降のデータ保全、データ損失と停止時間の合意を経てSupabaseの対応手順を使う。復元後はAuth・ACL/RLS・戦績・Storage整合・migration履歴を確認。ローカルsupabase_adminによる復元コマンドを本番へ転用しない。

## 8. 今回の変更・証跡・最終条件

変更は本書と `docs/environment-trends.md` の追記のみ。アプリ・SQLの修正、新しいmigration、テストの再実行はない。前回の型チェック/ビルド成功、63DBテスト成功、9,120件一致、216境界、単体473成功/49既存失敗、Lint既存警告2件、実ローカルAuth/PostgREST・画面確認の結果を引き継ぐ。

読み取り証跡はGit対象外の `build/environment-trends-release-preflight/` に保存：`backups.json`、`production-catalog.json`、`production-followup.json`、`production-refresh.json`、`history-comparison.json`、`vercel-current.json`。バックアップ内容や秘密値、個別ユーザー戦績は取得していない。

**実行前に残る条件：** (1) index作成工程の確定・必要箇所のローカル検証、(2) 本番既適用履歴のローカル復元と差分確認、(3) 復旧操作権限・復旧点・RPO/RTO確認、(4) 対象commitと本番設定の確認、(5) 利用者の明示許可。これらを満たした後も、本番の実負荷・実通信はDB適用後／アプリ公開後の段階的な確認と監視で判断する。条件未充足のまま本番反映しない。
