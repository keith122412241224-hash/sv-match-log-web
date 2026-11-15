# 環境画面の推移分析

> **最新状態：本番適用・公開完了。** 明示承認を受け2026年11月15日に2migrationとVercel公開を実施。翌16日朝までのログで停止条件に該当する障害は検出していない。[本番適用結果・実測値・残存リスク](environment-trends-production-result.md)を参照。以下の条件付きGO・未適用記述は準備時点の記録。

> 最新判定：**条件付きGO**。利用者の指示に従い、今回の追加変更と全DB災害復旧を分けて[リスクを再評価](environment-trends-risk-reassessment.md)。戦績を保持した旧アプリ切戻し・新RPC停止・index後処理を基本とする。全DB復元権限・復旧点は未確認だが、それだけで自動NO-GOにはしない。今回の切戻し担当/権限、当日の履歴・稼働確認、明示承認を条件とし、本番は未変更。

**最新判定：条件付きで本番適用可能（準備完了・未適用・未デプロイ）。** [2026-11-15の本番適用手順](environment-trends-release-runbook.md)を作成した。不足していた既適用migrationを復元し、index並行作成とRPC追加を分離。固定CLIで正常適用・失敗時・戦績入力・復旧SQLをローカル検証済み。実行当日のバックアップ／復旧条件・稼働状態確認と利用者の明示承認を残す。以下の旧適用案は最新手順で置き換える。[開発方針](development-verification-policy.md)に従い、ステージングは使用しない。

## 実装

- 環境サマリー（初期表示）／推移分析のタブ。環境・ランクは共通、期間は別々に保持。
- 推移分析の期間は7日・14日・30日（初期値）・全期間。
- 分析画面の `DeckMultiSelectDialog` を再利用。推移用の明示選択モードだけ空選択・全デッキ選択・決定時の反映を追加。既存の分析用モードは「すべて＝条件なし」、空配列はエラー、決定後も「表示」まで取得しない仕様を維持。
- クラス折りたたみ、クラス一括選択、キャンセル、選択クリア、選択済みの凡例。
- SVGの複数折れ線。選択／指標／期間／環境の変更によらず、共通カタログのID順に決めた色を維持。グラフライブラリ・アプリ依存関係の追加なし。
- ホバー・タップ・左右キー・日付入力から割合／集計件数／サンプル不足を確認。欠損区間は接続しない。
- 遭遇率／勝率は同じRPC応答を使用。指標切り替えで再取得しない。未選択時のクエリなし。古いリクエストを中止し、取得条件に一致する結果のみ表示。

## 集計定義

`get_environment_trend_aggregates_v1(uuid,text,text[],uuid[])` を追加した。既存サマリーのv4 RPCは変更していない。

1. 日付区切りは `Asia/Tokyo`。各日DのD−6日00:00〜D翌日00:00（終了を含まない）を集計。当日は集計対象時刻で切る。
2. 環境開始は `start_date` のJST 00:00。開始日未設定の場合のみ `created_at` を使う。入力予約の `match_input_start_at` は集計範囲に使わない。
3. 通常の集計対象時刻は既存サマリーと同じ30分単位。到達済みの `dashboard_end_at` があればその正確な時刻で終了する。入力予約の `match_input_end_at` は使わない。終了日時は排他的で、JST 00:00終了なら前日を最終表示日とする。開始前の環境は空系列。
4. 期間はその最終表示日から7／14／30暦日、または環境開始から全期間。移動集計用に表示開始前の最大6日を追加取得するが、環境開始より前は含めない。
5. `matches.environment_id` を必ず一致させる。ランクは既存サマリーと同じ登録者側の17区分（未登録を含む）で判定。
6. デッキIDは既存と同じ `deck_archetypes.id` と `my_archetype_id`／`opponent_archetype_id`。選択対象は有効な共通分類のうち `environment_id` が未設定（共通）または選択環境に一致するもの。自由記述の `environment_name` を識別子として使わない。
7. 遭遇率＝相手側としての遭遇件数／同じ環境・期間・ランクの全登録戦績数。分母には未分類や選択外デッキの戦績も含む。デッキ選択で分母を絞らない。
8. 勝率＝対象デッキの勝利視点数／評価視点数。自分側のwinと相手側のloseが対象デッキの勝利。ミラーは1登録から2評価・1勝、対象登録戦績数は1件。この定義はサマリーv4と同じ。
9. 観測なしはnull。遭遇0件も既存サマリーに合わせて欠損。実際に評価があって勝利0件なら勝率0%を表示。
10. `sampleLabel` を再利用し、対象登録戦績10件未満は「サンプル不足」、10〜29件は「参考」。判定にミラーで増える評価件数を使わない。

入力予約と集計期間は別扱いとし、終了時刻の決め方は既存サマリーに揃える。環境開始境界と7暦日の移動集計は推移分析の仕様であり、サマリーの既存の全期間・固定時間窓は変えない。そのため一般にサマリーの「7日」と推移の最終点は時間窓が異なる。同じ窓に合わせた場合の完全一致はDBテストで確認した。

## データと権限

- Next APIで会員認証と条件を検証し、ユーザーのセッションでRPCを呼ぶ。キャッシュは `private, no-store`。
- SQLはpublicのSECURITY INVOKERラッパーとprivateのSECURITY DEFINERを使用。既存公開集計と同じ `auth.uid()` とJSON boolean `is_anonymous=false` を要求。EXECUTEはauthenticatedだけに許可し、PUBLIC／anon／service_roleから明示的に取り消す。
- 新規テーブル、RLS変更、既存関数の上書き、個人・管理者データの返却はない。
- サーバー側で環境・時間・ランクを限定して一度読み、日別集計と7行のウィンドウ集計を行う。ブラウザへ戦績行は返さない。分母のため選択外デッキも数えるが、デッキ別集計と応答は選択分のみ。
- `(environment_id, played_at)` のインデックスを追加。APIは最大1,000デッキ、40,000文字の条件を受け付ける。全期間の応答量は日数×選択数に比例する。
- 権限の設計は [Supabase Database Functions](https://supabase.com/docs/guides/database/functions) と既存v4 RPCを参照。

## 変更ファイル

既存アプリの変更は次の3ファイルのみ。

- `src/app/environment/page.tsx`：選択用の共通デッキメタデータを取得して渡す。
- `src/components/environment/EnvironmentFilters.tsx`：タブ、共通条件、独立した期間状態。
- `src/components/DeckMultiSelectDialog.tsx`：既存モードを維持したまま推移用 `onApply` を追加。

新規アプリファイル：

- `src/components/environment/EnvironmentTrends.tsx`
- `src/components/environment/EnvironmentTrendChart.tsx`
- `src/lib/environment-trends.ts`
- `src/lib/environment-trend-data.ts`
- `src/app/api/environment/trends/route.ts`
- `supabase/migrations/20261114104651_environment_trends.sql`

検証関連：`tests/environment-trends{.test,.integration,.browser,-db,-scope,-scope.test}.cjs`、`tests/fixtures/environment-trends-source-hashes.json`。既存の履歴固定テストへの登録として `ui-copy-cleanup-scope.cjs`、`analysis-matchups-scope.cjs`、`baseline-layout.test.cjs` を更新し、DBスイートの `run-integration.cjs` に新テストを登録した。`member-matrix.integration.cjs` には新RPCの追加だけを認め、既存ポリシー・権限・関数が不変であることを検証する追加マイグレーション確認を登録した。

## 検証結果（2026-11-14）

- TypeScript：成功。
- ESLint：エラー0。既存 `tests/dependency-security.test.cjs` の警告2件のみ。
- Next本番ビルド：成功。
- 新規単体・変更範囲テスト：5件成功。旧SQL、RLS、サマリー、他画面、依存関係の内容を変更前HEADと比較。
- 新規DBテスト：独立オラクルとの日付・デッキ別9,120ケースが一致。全ランク区分、環境の分離、JST境界、開始／終了、先行6日、部分日、全期間、欠損／0%、ミラー、認証・権限・カタログ検証を確認。既存関数とACL、RLSポリシーが変わらないことも確認。
- 100,000件の合成戦績で集計成功（ローカルPGliteの1回計測83ms、選択2デッキ・14日で3,404 bytes）。インデックスが利用可能なことをEXPLAINで確認。本番の性能保証値ではない。
- 既存の環境サマリーv4統合テスト：成功（276応答比較・805母集団比較・30ローダー比較）。既存分析の複数デッキDBテスト：3件成功（100,000行を含む）。
- 全DBスイートは58件を実行し、最初の実行で56件成功。残る2件はGit所有者チェックと、相性表テストの追加RPC登録漏れだった。後者を既存方式で登録し、実行環境を整えて該当2ファイルを再実行したところ、含まれる全5テストが成功した。修正後の全58件一括再実行は省略し、影響するファイルを再検証した。
- ブラウザ：実際のビルド済みNext画面・APIからローカルのAuth/PostgREST代替を経由して実際のSQLを実行。タブと期間保持、複数線、選択／キャンセル／全選択／クリア、色固定、指標切り替え時の取得抑止、急な期間変更での古い結果排除、ランク／環境／カタログ、欠損、失敗と再試行、不正API条件・未認証拒否を確認。1440／768／390／320pxで横はみ出しなし。ホバー・キーボード・ダイアログのフォーカス制御も確認。
- 分析画面の既存ダイアログもブラウザ確認。空選択拒否、決定だけでは取得しない、「すべて」は絞り込みなし、フォーム値を維持。
- 全単体スイート：521件中472成功、49失敗。変更前HEADの隔離コピーでは516件中467成功、同じ49件が失敗し、失敗したテストファイルの集合も一致。既存のpackage-lock.json／package.json等のハッシュ期待値やlayoutの履歴固定テストが原因。今回これらのファイル・期待値は変更していない。

ブラウザの証跡は `build/environment-trends-browser/`、全体テストは `build/environment-trends-unit.log`、変更前比較は `build/environment-trends-baseline-unit.log` に保存（buildはGit対象外）。

## 本番適用手順と未確認事項

**本番DBへの適用・デプロイは行っていない。** 新RPCが未適用の環境で推移データを要求すると取得失敗メッセージになる。既存サマリーはそのまま動作する。

1. 既存の `docs/migration-baseline.md` に従って、適用先とマイグレーション履歴を照合する。既存本番へbaselineを再適用しない。
2. 未リンクのローカルSupabaseで新しいマイグレーションと実Auth/PostgREST経由の会員／匿名の呼出しを確認する。初回はDocker未起動だったが、末尾の追加検証で実サービスも確認済み。別途ステージングは使用しない。
3. 新規の `20261114104651_environment_trends.sql` だけが適用対象となることを確認する。既存のマイグレーション管理に従い、レビュー後に担当者が適用する。自動的な `db push` や履歴修復は行わない。
4. 通常のCREATE INDEXは作成中に書き込みを待たせる可能性がある。ローカル合成データで作成時間を測り、本番直前の規模・競合確認から適用時間を決める。必要なら別途CONCURRENTLYによる作成手順をレビューする。
5. マイグレーションの後にアプリをリリースし、会員でサマリー・推移・分析を確認する。実機スマートフォン、長期環境／最大カタログ、本番データ量での応答時間は追加確認対象。
6. アプリを戻す必要がある場合は以前のアプリ版に戻す。追加RPCとインデックスは既存コードから呼ばれないため、そのまま残せる。自動的な関数削除・データ削除は不要。

再実行例（ローカル専用）：

```powershell
node build/local-tools/run.cjs typecheck
node build/local-tools/run.cjs lint
node build/local-tools/run.cjs unit
$env:PGLITE_MODULE = (Resolve-Path 'build/migration-step2-baseline/tools/node_modules/@electric-sql/pglite').Path
node tests/environment-trends.integration.cjs
node tests/environment-trends.browser.cjs --build
```

ブラウザテストは `PLAYWRIGHT_MODULE` と `CHROME_EXECUTABLE` で既存の検証ツールを指定できる。既定値はbuild内の検証専用PlaywrightとWindows Edge。`--build` はlocalhostの代替API URLを使ってビルドするため、この `.next` を本番へ配布しない。本番用は通常の設定で改めてビルドする。

## 本番公開前の再検証（2026-11-14）

**この節はPGlite段階の記録（当時の判定は保留）。** 集計境界は利用者の回答に従って修正済み。当時未確認だった実Supabase経路は末尾のローカル実サービス検証で補完し、判定を更新した。本番への接続・変更・デプロイは実施していない。

### 1. セキュリティ評価 — ローカル確認済み

- 全マイグレーションを適用した使い捨てPGliteで権限を検証。publicラッパーはSECURITY INVOKER、private本体はSECURITY DEFINER、所有者はpostgres、どちらも `search_path=''`、STABLE。テーブル・関数参照はスキーマ修飾され、同名の一時テーブルや変更された呼出元search_pathで結果が変わらない。
- 両関数とも一般クライアント向けEXECUTEはauthenticatedのみ。PUBLIC、anon、service_roleは不許可。会員UIDとトップレベルのJSON boolean `is_anonymous=false` を要求し、未認証、匿名、欠落・null・文字列のclaim、user_metadataによる偽装を拒否。private本体を直接呼んでも同じチェックが働く。
- **DEFINERは既存環境サマリーと同様、会員本人のraw行RLSを越えて共有集計する設計である。** 「RLSを一切迂回しない」とは評価しない。普通の会員からraw戦績は1件、集計では他会員分を含む2件になることを確認し、既存の会員向け公開集計方針との一致を検証した。既存Policy・既存関数定義・ACLの不変も比較している。
- 返却項目は公開カタログのID・名称・クラス、日付、集計件数のみ。ユーザーID、戦績ID、メール、メモ、個人デッキ情報を返さない。管理者と普通の会員で集計内容は同じ。少数集計を隠す新しいプライバシー基準は導入していないため、既存公開集計と同じ推測可能性は残る。
- 環境UUID、4種の期間、17種のランク、1〜1,000件の有効な対象環境デッキをSQLでも検証。NULL・多次元配列・上限超過・不明／無効／他環境デッキ・SQL文字列注入を拒否。動的SQLはなく、APIは引数をバインドしたRPCを会員セッションで呼ぶ。service roleキーは使用しない。
- APIの未ログイン401、不正条件400、取得失敗503と一般的なエラー表示、`private, no-store` を確認。DB内部エラーは利用者へ返さない。実JWTの検証、PostgRESTのスキーマ公開設定・ロール切替については実サービス未確認。

### 2. 集計精度 — 算式・確定した境界仕様を確認済み

- 既存の独立オラクル9,120ケースを再実行して一致。同じ時間窓に合わせた環境サマリーv4との総件数・遭遇件数・対象登録数・評価数・勝利数も一致した。
- 遭遇率の分母は同条件の全登録戦績。デッキ選択で分母を減らさない。勝率は自分側のwinと相手側のloseを勝利として両視点を合算し、ミラーは登録1件・評価2件・勝利1件。ランクは登録者側、分類は共通archetype IDで揃っている。
- 追加で18種の境界×4期間×3DBタイムゾーン＝216通りを確認。JST午前0時の前後1µs、終了時刻ちょうどの除外、30分切替、閏日、年跨ぎ、開始前・開始後の終了、入力予約からの独立、開始日未設定時のfallbackを含む。
- 日付別の直近7日、表示前6日分の利用、他環境除外、分類NULL、無戦績日の生成、7日経過後の欠損、全期間、実際の勝率0%を追加検証。サンプル判定は既存 `sampleLabel` を使用し、対象登録10件未満は不足、10〜29件は参考。ミラーで増える評価数では判定しない。
- **修正済み：入力予約と集計境界の結合。** 利用者から「環境の開始日／集計終了日時に揃える」との回答を受け、推移RPCの開始を `start_date` のJST午前0時（未設定時は `created_at`）、終了を到来済みの `dashboard_end_at` に変更した。`match_input_start_at`／`match_input_end_at` は参照しない。例えば入力が11月5日、集計が11月8日に終了する設定でも、推移は集計終了時刻までを扱う。実戦績のあるfixtureで入力予約を未来・過去・NULLへ変更しても4期間の応答全体が不変であることと、同じ時間窓のサマリーとの件数一致を検証した。
- サマリーの過去168時間と推移の7暦日は通常一致しない。全期間は環境開始からの日付列であり、各点の値はあくまで直近7日である。

### 3. パフォーマンス — 合成データで実測済み／本番性能は未確認

測定環境：Windows、AMD Ryzen 7 5700X、Node v24.16.0、PGlite内PostgreSQL 17.5（WASM・単一プロセス）。365日・17ランク・60有効デッキ・2ユーザーの合成戦績を使用。全ランクで1／8／60デッキ（全選択）を各3回実行した中央値。実RPC呼出しからJSON受領までを測り、ネットワーク・実Auth・PostgREST・描画時間は含まない。他のテストと同時実行せず測定した。

`work_mem=4MB`、`shared_buffers=128MB`、`statement_timeout=0`。共通fixtureの `enable_seqscan=off` を明示的に `on` に戻してから測定し、インデックス強制の旧測定値は採用していない。単一プロセスの結果からPostgreSQL実サーバーの並列性能を推測しない。

| 全戦績数 | 対象環境内 | 選択デッキ数 | 30日・中央値 | 全期間365日・中央値 |
| ---: | ---: | ---: | ---: | ---: |
| 10,000 | 2,000 | 1 | 3.0ms | 10.1ms |
| 10,000 | 2,000 | 8 | 6.1ms | 34.5ms |
| 10,000 | 2,000 | 60（全て） | 23.4ms | 220.6ms |
| 100,000 | 20,000 | 1 | 5.4ms | 34.7ms |
| 100,000 | 20,000 | 8 | 7.9ms | 61.8ms |
| 100,000 | 20,000 | 60（全て） | 27.3ms | 276.3ms |
| 1,000,000 | 200,000 | 1 | 29.7ms | 308.6ms |
| 1,000,000 | 200,000 | 8 | 33.6ms | 343.2ms |
| 1,000,000 | 200,000 | 60（全て） | 60.5ms | 677.2ms |
| 1,000,000 | 1,000,000 | 60（全て） | 204.9ms | 2,309.1ms |

最後の集中条件では全期間3回が2,078.4／2,309.1／2,335.2ms。応答は30日1,800点・190,491 bytes、全期間21,900点・2,240,156 bytes（非圧縮JSON）。少量データでも日数×デッキ数に応じた応答生成費用がある。

RPC外側の `Result` ノードだけで判断せず、マイグレーションから実際の集計CTEを抽出し、同じパラメータで `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` も実行した。

- 全100万・対象20万では、30日／全期間の両方で `matches_environment_played_at_idx` のBitmap Index／Heap Scanを使用。戦績テーブルの走査はloops=1、読み取りは30日19,727行、全期間200,000行。30日の計算用に表示前6日も読む。選択数に比例して戦績を再走査しない。
- 全100万が対象環境の場合、30日は同インデックスで98,639行を読み、全期間はSeq Scanで100万行を1回読む。全行が必要な条件なのでこのSeq Scanは妥当で、除外すべき他環境を無条件に全件読む問題とは異なる。追加のランク／デッキインデックスは導入していない。
- 全選択の実行計画内時間は対象20万で30日120.214ms／全期間1,263.372ms、対象100万で472.034ms／4,752.605ms。計測付きEXPLAINの時間は通常RPCの中央値と区別する。
- 対象20万の全期間でtemp read/write各1,221 blocks（各約9.54MiB）、対象100万の30日603 blocks、全期間6,104 blocks（各約47.69MiB）。全期間ではsourceの一時領域使用が増える。WASM内の一時領域計測であり実サーバーの物理ディスクI/O性能ではない。SQL修正やwork_mem変更を正当化する本番測定はないため、安易に設定を変更していない。
- 100万件・30日・60デッキを8件投入した完了時刻は226／455／680／912／1,140／1,375／1,600／1,829ms。PGlite内部で直列化されるため、これは待ち行列の参考値に限る。**複数ユーザーの実同時アクセス、接続プール、タイムアウトは未確認。**

本番の実データ量・日付偏り・稼働中の書込み負荷は取得していない。100万件の合成試験を「本番同等」とは評価しない。最大1,000デッキや複数年、低性能スマートフォンでの大量描画も未測定。

上記は境界修正前のSQL（SHA-256 `de36909f57c257830dc14e4dbdc7eb53cbacbc04d93cb44545b315acdd3471b7`）での実測。修正前後で集計CTE本文は同一で、測定fixtureは入力予約が両方NULLのため算出境界も同じ。今回の修正は環境設定の参照部分に限るため性能測定は再実行していない。入力予約により従来除外されていた期間が集計対象に戻る実データでの負荷は、実Supabase検証時に確認する。

### 4. 実Supabase — 当時未確認（末尾でローカル確認済み）

専用の安全な検証環境は利用できないとの回答を受領。ローカルDockerエンジンも起動していない。外部設定を接続に使わず、既存のローカルランナーのloopback設定で実施した。実Supabaseへのマイグレーション適用、Auth発行JWT、PostgREST経由のロール別呼出し、アドバイザー、実通信の失敗、実DBの同時アクセスは実行していない。

代替として、全SQLマイグレーションを使い捨てPGliteへ適用し、実際のビルド済みNext画面→Next API→localhostのAuth/PostgREST代替→PGlite上の実SQLまで検証した。サービス代替は本物のAuth／PostgRESTの適合確認を置き換えない。

### 5. 検出した問題と最小修正

**修正済み：マイクロ秒を含む日時の検証。** 終了時刻が `2026-11-13T15:00:00.000001+00:00`（JST11月14日午前0時+1µs）のとき、SQLは正しく11月14日の点を返すが、JavaScriptのDate.parseはミリ秒へ切り捨て、従来parserはその日付を不正として画面に取得エラーを出していた。`src/lib/environment-trends.ts` の応答検証だけをマイクロ秒精度のBigInt比較に変更。UTC／+09:00／-05:00、ちょうど午前0時、未来時刻の拒否を回帰テストに追加した。

今回の追加・変更：

- `src/lib/environment-trends.ts`：上記の精度修正。
- `supabase/migrations/20261114104651_environment_trends.sql`：本番未適用の新RPCのみ、確定した環境開始日／集計終了日時へ変更。既存サマリー・RLS・ACL・インデックスは変更しない。
- `tests/environment-trends-db.cjs`、`tests/environment-trends.integration.cjs`：環境開始日のfixture・独立オラクル・入力終了からの独立性を更新。
- `tests/environment-trends.test.cjs`：日時精度の回帰テストを1件追加。
- `tests/environment-trends-preflight.integration.cjs`：境界、入力予約からの独立性、全マイグレーションの権限、入力検証など5テストを新設。
- `tests/environment-trends-performance.cjs`：ネットワークを使わない再現可能な合成負荷・実行計画測定を新設。
- `tests/run-integration.cjs`：新DBテストを登録。
- `tests/fixtures/environment-trends-source-hashes.json`：レビューした新規parserと新RPCのハッシュを更新。既存機能の固定値は緩和していない。
- `docs/environment-trends.md`：本節を追記。

別のRPC・インデックス・マイグレーションの追加は今回なし。本番未適用の `20261114104651_environment_trends.sql` を修正した（最終SHA-256 `7d51a85484fcf49071a0515a2ade73b997be7b52458025079477722ce09f09d9`）。入力予約の境界差は解消済み。

### 6. テスト結果

| 項目 | 状態 | 結果 |
| --- | --- | --- |
| 型チェック | 確認済み | 成功 |
| Lint | 確認済み | エラー0、既存のdependency-security.test.cjsの警告2件 |
| Next本番ビルド | 確認済み | localhost代替サービス設定で成功。境界修正はSQLとテストのみのため、同じビルドを使い修正後SQLでブラウザを再検証。配布用成果物ではない |
| 全DBスイート | 確認済み | 28ファイル・63テスト、63成功／0失敗／0skip。境界修正後の全件一括実行（約298秒） |
| 集計オラクル | 確認済み | 9,120ケース一致、サマリーとの同一時間窓比較も成功 |
| 追加境界検証 | 確認済み | 216通りとマイクロ秒単位の戦績境界・欠損・入力予約からの独立性を確認 |
| 全単体テスト | 問題あり（既存） | 522件中473成功／49失敗。新規失敗なし |
| ブラウザ | 確認済み（代替サービス） | タブ・選択・複数線・指標切替・条件変更・欠損・取得失敗／再試行・未認証拒否、古い応答の排除。1440／768／390／320pxで横はみ出しなし。既存分析ダイアログも成功 |
| 実Supabase／同時負荷 | 未確認 | 安全な検証環境なし |

49件は変更前HEADの隔離コピー（516件中467成功／49失敗）と、失敗ファイルおよびassertionメッセージを再比較して同一。package.json／package-lock.jsonの既存ハッシュ差や履歴固定テストが中心で、今回の変更による新しい失敗ではない。今回の対象に含めて期待値を書き換えたり修正したりしていない。既存画面の全操作を手動で総当たりしたわけではなく、回帰評価はテスト・変更範囲の比較・ブラウザで確認した範囲に限る。

再現用の主な証跡（buildはGit対象外）：

- `build/environment-trends-preflight/performance.json` と `plan-*.json`：全サンプル、設定、実行計画。
- `build/qa2-006-test-maintenance/db-after.log`：境界修正後の全63DBテストの最終ログ。
- `build/environment-trends-preflight/unit-comparison.json`：変更前HEADとの失敗比較。`boundary-unit-comparison.json` と `boundary-unit-run.log`：境界修正後も522件中473成功／同じ49失敗であることの確認。
- `build/environment-trends-browser/report.json`、`build.log` とスクリーンショット：ビルド・画面検証。

追加検証の再実行（新しい使い捨てPGliteのみ）：

```powershell
$env:PGLITE_MODULE = (Resolve-Path 'build/migration-step2-baseline/tools/node_modules/@electric-sql/pglite').Path
node --require ./tests/register.cjs --test tests/environment-trends-preflight.integration.cjs tests/environment-trends.test.cjs
node tests/environment-trends-performance.cjs
node build/local-tools/run.cjs db
```

### 7. 残存リスク

未確認の実認証・PostgREST・負荷・インデックス作成中の書込み待ち、全期間の応答増大／一時領域が公開前に残る。入力予約との境界差は修正済み。HTTP呼出しを中断してもDBクエリのキャンセル完了までは保証しないため、連続操作や集中アクセスの負荷は実環境で確認する。今回、既存RLS・公開集計方針・サマリー・管理画面の設定は変更していない。

### 8. 公開可否

**この段階の判定は保留。最終判定は末尾で更新。** PGliteだけでは実認証・API疎通・実サーバーの同時負荷を保証できないため、未リンクのローカルSupabaseで追加確認することとした。別途ステージングは要求しない。

### 9. 本番DB適用・Vercelデプロイの推奨手順（未実行）

1. 境界修正済みの新migration（上記の最終ハッシュ）と検証結果をレビュー対象として固定する。古い入力予約依存版を適用しない。
2. 未リンクのローカルSupabaseに[migration運用](migration-baseline.md)に沿って全migrationを適用。一般会員・管理者・匿名Auth・未ログイン・service_roleの実Auth/PostgREST経由の許可／拒否、応答、画面の取得失敗を確認する（末尾の追加検証で実施済み）。
3. 実運用に近い件数・日付偏り・最大カタログ・想定ピーク同時数で30日／全期間を測る。p95、エラー率、DB／PostgRESTのstatement timeout、接続プール、temp領域、インデックス作成時間と書込み待ちを確認し、公開基準を満たすことを記録する。通常CREATE INDEXが不適切な規模なら、トランザクション外のCONCURRENTLY作成を含む別手順をレビューする。
4. 公開条件を満たした後、別途承認された本番作業で対象project・移行履歴・バックアップ／復旧点・直前アプリ版・SQLハッシュを確認。今回の新migrationだけが適用対象であることをdry-run等で確認する。baseline再適用、legacy SQL実行、未確認の履歴repairはしない。
5. DBの追加migrationを先に適用し、新RPCのACL・実行結果を確認してから、正しい本番設定で新規ビルドしたアプリをVercelへ反映する。ローカル代替URL入りの `.next` を流用しない。
6. 会員で環境サマリー／推移／分析を確認し、RPCエラー率・応答時間・書込み遅延を監視。失敗時は次項の復旧を行う。本手順は今回の実行許可を意味しない。

### 10. ロールバック（手順のみ・未実行）

- UI／APIに問題があれば、まずVercelを保存した直前アプリ版へ戻す。旧版は追加RPCを呼ばないため、追加関数・インデックスは残せる。既存戦績の削除・復元や既存RPC変更は不要。
- 権限上の問題ならアプリ復旧だけでは直接RPC呼出しを止められない。別途承認のうえ、今回追加したpublic／private両関数のauthenticated向けEXECUTEを取り消す運用migrationを用意する。既存の環境サマリー等の権限には触れない。再開は原因を修正し検証してから。
- migrationのCOMMIT前の失敗はトランザクションのrollback対象。COMMIT済み変更は後から `ROLLBACK` しても取り消せない。CLI履歴の「reverted」もDDLの逆操作ではないため、自動実行しない。
- 追加indexを残すことで性能問題が続く場合だけ、依存・利用状況を確認して別途復旧手順をレビューする。関数・indexの削除、RLS変更、データ削除を自動の復旧処理に含めない。

## ローカル実サービスによる最終検証（2026-11-14）

利用者の「別途ステージングは使わない」「ローカルSupabaseでAuth／PostgRESTも確認する」という方針に従って、未確認項目を補完した。本番への接続・変更・デプロイは行っていない。

### 最終判定

**条件付きで本番適用可能。** 実ローカルSupabaseで必要な経路を確認し、追加のアプリ／RPC不具合は検出していない。ステージングは必要条件にしない。ただし、以下の本番直前確認を通過し、DB適用・Vercelデプロイについて利用者の明示許可を得てから実行する。検証完了は実行許可ではない。

| 項目 | 状態 | 根拠・限界 |
| --- | --- | --- |
| ローカル移行 | 確認済み | 専用ローカルSupabaseに22 migrationを適用成功 |
| 実Auth／PostgREST | 確認済み | 実ログインJWTで会員・管理者が成功、匿名Auth・未ログイン・service_roleを拒否 |
| SQL安全性・集計 | 確認済み | 前回63DBテスト・9,120一致・216境界を維持。実サービスでも両視点・ミラー・RLS・サマリー一致を確認 |
| 実画面 | 確認済み | ログイン→Cookie→Next API→PostgREST→SQL→複数線。実権限エラーと再試行も成功 |
| 同時アクセス | 確認済み（限定負荷） | 合成100万件、4／8会員、各3バースト。4／8の別DBバックエンド同時稼働を観測 |
| バックアップ復元 | 確認済み（合成ローカル） | 別ローカルDBへ復元し、戦績・関数・所有者・権限・RLSを照合 |
| 本番の最新バックアップ・復旧権限 | 未確認 | 本番未接続。適用直前の必須確認 |
| 本番固有の性能・設定・通信 | 未確認 | 適用直前確認と許可後の限定的な実データ確認・監視で扱う |

### 実行環境と安全性

project IDは `svml-environment-trends-20261114`、APIは `127.0.0.1:16321`、DBは `127.0.0.1:16322`、画面は `127.0.0.1:16330`。設定は `build/environment-trends-local/local/supabase/` に作成し、クラウドのproject-refなし。既存ローカルDBのresetはしていない。Windowsの62300台は予約範囲だったため16300台へ変更した。

CLIは固定の2.118.0、PostgreSQLは17.6（image `postgres:17.6.1.171`）、Authは `gotrue:v2.197.0`、PostgRESTは `v16.3`。バージョン更新・クラウドlinkなし。Docker起動時に過去のローカルコンテナも自動起動し、測定中も稼働していたため、専有ホスト／本番相当とは評価しない。

合成会員をローカルAuth Admin APIで作り、パスワードログインの本物のJWTで呼び出した。匿名Authも実際に作成。確認済み会員のログインが対象で、メール配送・OAuth・本番CAPTCHAは対象外。HTTPは固定loopback URL、DB操作は専用コンテナに限定。資格情報はローカルCLI statusからメモリ内で取得し、コード・報告には保存しない。

### 実サービス・画面の結果

会員のraw戦績は本人分1件、共有集計は3件という既存方針を確認。デッキAは遭遇2・登録3・評価4・勝利3、Bは遭遇1・登録2・評価2・勝利0で、両視点・ミラー・0%を含めサマリーv4と一致。入力予約を未来に設定しても過去集計は変わらない。

未ログイン・実匿名Auth・service_roleは42501、改ざんJWTはHTTP 401。不明環境・無効デッキ・空選択・不正ランク・SQL文字列風の期間は22023。privateスキーマはPostgREST非公開。応答にユーザーID・個人デッキID・メモなし。public/privateの `search_path=''` とEXECUTEも実カタログで確認。

ローカルNext開発サーバーで、Cookieの捏造やHTTP代替を使わずログインフォームから検証した。推移API 200と複数線を確認し、**専用ローカルDBだけ**でpublic新RPCのEXECUTEを一時的に外して取得失敗表示を確認。finallyで権限を戻し、再試行で200に回復した。未ログインのNext APIは401、ブラウザ実行時エラーなし。

初回は隠れたradioを直接クリックするテスト側の問題で止まったため、表示ラベルをクリックするよう修正。再実行fixtureのカタログ一意制約も環境別に分離して解消した。アプリ／SQLの変更は不要。これは実サービスへの接続を新たに確認する試験で、本番ビルドを繰り返したものではない。

### 実PostgreSQL／PostgRESTの性能

対象環境に10万→100万件、365日・全17ランク、1／60デッキの合成データ。実JWT付きHTTP呼出しからJSON受領まで各3回の中央値（Next・描画は含まない）。固定された過去の集計終了時刻を使用。最終SQLハッシュは `7d51a85484fcf49071a0515a2ade73b997be7b52458025079477722ce09f09d9`。

| 対象件数 | 選択数 | 30日 | 全期間365日 |
| ---: | ---: | ---: | ---: |
| 100,000 | 1 | 15ms | 104ms |
| 100,000 | 60 | 38ms | 492ms |
| 1,000,000 | 1 | 104ms | 1,267ms |
| 1,000,000 | 60 | 147ms | 1,856ms |

100万・60デッキの応答は30日190,198 bytes、全期間2,239,768 bytes（非圧縮）。`work_mem=4MB`、`shared_buffers=128MB`、`enable_seqscan=on`、parallel workers per gather=2。authenticated/authenticatorの `statement_timeout=8s`、authenticatorの `lock_timeout=8s` を確認。

実集計CTEのEXPLAIN ANALYZEでは30日は環境・日時indexで98,639行を1回走査し180.737ms。全期間は並列Seq Scanで平均333,333行×3 loops、合計約100万行を分担し1,358.401ms。他fixtureの6行は除外。ほぼ全データが対象なのでSeq Scanは妥当。temp read/writeは30日各603 blocks、全期間各6,104 blocksで、応答生成と一時領域使用は残る。

以下は別会員による各条件3回の同時バースト。`pg_stat_activity` で複数authenticatorバックエンドを確認しており、PGliteの直列キュー試験とは異なる。

| 同時会員 | 期間 | リクエスト数 | 中央値 | p95 | 最大 | エラー | 観測した同時DBセッション |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 4 | 30日 | 12 | 189ms | 221ms | 221ms | 0 | 4 |
| 4 | 全期間 | 12 | 1,359ms | 2,189ms | 2,189ms | 0 | 4 |
| 8 | 30日 | 24 | 245ms | 313ms | 317ms | 0 | 8 |
| 8 | 全期間 | 24 | 2,342ms | 2,501ms | 2,584ms | 0 | 8 |

同じ列の試験用indexをトランザクション内で作成しrollback。100万件で作成〜rollbackは477ms（競合書込みなし）、indexが残らないことも確認。本番のロック待ち保証ではない。継続負荷・8人超・1,000デッキ・複数年・実データの偏り・モバイル大量描画・実通信は未測定。本番へ高負荷試験を持ち込まない。

### バックアップ・復旧の確認

合成ローカルデータの `pg_dump -Fc`（644,112 bytes）を別ローカルDBへ復元。戦績6件、推移RPC定義、全public/private関数の定義・所有者・正規化ACL、publicテーブルRLS、public/storage/suggestion_privateのPolicyが一致した。100万件投入前の試験なので、本番サイズの復旧所要時間は測っていない。

初回復元は管理スキーマ `realtime.list_changes` の設定復元でpostgresロールの権限不足により停止。新しいローカル復元先を作り、**ローカル専用supabase_admin**で元の所有者／ACLを保持して成功した。クラウドで同ロールを利用できるという意味ではない。本番の全DB復元はSupabaseが対応するDashboard等の手順を使用する。ACLの配列順だけは変わり得るため、順序を正規化して比較した。

本番について確認したのは[2026-10-26の既存監査記録](security/2026-10-26-phase2a-production-result.md)に当時の正常日次バックアップ7世代・PITR無効が記載されていることまで。**現在のバックアップ・復旧可能時刻・担当者の復旧権限は未確認**。過去のinserted_atを現在の復旧点や完了時刻として扱わない。

本番直前に、最新の正常バックアップID／時刻・復元可能範囲、PITRの現在設定、復旧担当と操作権限、許容RPO/RTO、直前deployment ID、現行スキーマ／ACL・migration履歴を記録する。古い・失敗・利用不可のバックアップ、許容損失不明なら適用を止め、追加バックアップ等を別途判断する。

全DB復元には復旧点以降の戦績損失と停止が伴い得る。DBバックアップにStorage実ファイルは含まれず、必要なら別途保全する。今回の追加RPCを戻す通常手段として全DB復元を使わない。[Supabaseバックアップ仕様](https://supabase.com/docs/guides/platform/backups)。

### 本番固有の残存リスク

- 設定・履歴差：本番のPostgreSQL/Auth/PostgREST、JWT設定、スキーマ公開、過去の個別権限変更、migration履歴は今回未取得。既存の新RPC・同名indexの定義違い・予期しないpending migrationがあれば停止する。
- indexのロック：CREATE INDEXは戦績書込みと競合する。長いトランザクションや大規模テーブルではローカル477msを超える。低負荷の作業枠と実行セッションのタイムアウトで制限し、失敗時に無断で延長・再試行しない。CONCURRENTLYが必要なら別手順をレビューする。
- 実負荷・通信：CPU／IOPS、接続プール、同時数、偏り、Vercelの実行時間／転送制約、実ネットワークは異なる。ローカル8同時成功を無制限の容量保証にしない。
- 機密性：既存の会員向け共有集計と同じ公開範囲。少数集計からの推測可能性は残るが、ユーザー単位の情報は返さない。
- バックアップ：ローカル復元成功は現在の本番バックアップや復旧所要時間を保証しない。

### 適用直前・適用後の手順（未実行）

1. 本番DB適用・Vercelデプロイについて利用者の明示許可を得る。実行者・作業枠・監視／復旧担当を決め、直前deployment IDを保存。DBだけ許可された場合、アプリはデプロイしない。
2. 許可された本番読み取りで対象project、履歴、既存RPC/ACL、テーブル規模、index定義・有効性、長時間トランザクション、実タイムアウト、上記バックアップ項目を確認。想定外の差や復旧手段不備なら適用しない。
3. 最終SQLハッシュを照合。migration管理ツールのdry-run等で `20261114104651_environment_trends.sql` だけが対象と確認。baseline・他pending migrationを混ぜず、履歴repairで無理に合わせない。
4. 同じ実行セッションに `lock_timeout`（初期案2秒）、`statement_timeout`（初期案30秒）を設定・確認して既存migration管理方法で適用。永続設定は変えない。直前の規模確認で不適切なら実行前に手順を再レビュー。失敗時は状態・履歴を確認し、無制限に再試行しない。
5. DB適用後・アプリ反映前に、新関数の所有者・search_path・DEFINER/INVOKER・EXECUTE、index有効性、履歴を読む。会員JWTで7日／1デッキをまず1回取得し、匿名拒否と形式を確認。個別戦績・個人情報をログに残さない。
6. 許可されたアプリを正しい本番設定で新規ビルドしてデプロイ。ローカル `.next` は流用しない。サマリー→推移→デッキ2件→指標切替と、戦績入力・既存分析の基本動作を確認。本番に合成戦績を投入しない。
7. 実データは7日／1デッキ、30日／数デッキ、全期間／実カタログの順に**逐次・少数回**で拡大。件数・値・応答量・時間を記録し、同一時間窓のSQL集計と照合。サマリー168時間と推移7暦日の表示値をそのまま一致判定しない。遅延・エラー時は拡大を止める。
8. 直後15〜30分と翌日の通常利用で、推移API 5xx／RPC 42501・42883・57014、CPU・IO・接続数・temp・ロック、既存入力／サマリーの遅延を監視。取得できる情報だけを使い、少数サンプルからp95を断定しない。

停止基準：権限漏れ、集計不一致、既存入力の失敗は直ちに停止。推移503／タイムアウトの反復、既存機能の継続的な遅延も継続公開しない。性能の警戒値は実タイムアウトの50%超の反復（8秒なら4秒）を初期案とし、重い条件の確認を止める。これは運用案であり、公開時に担当者と確定する。

### 問題発生時の復旧

1. UI／API：Vercelを保存した直前deploymentへ戻す。追加RPC・indexは残せる。戦績を保持し、旧アプリのサマリー・入力・分析を確認する。
2. 権限漏れ・新RPC負荷：アプリ復旧だけでは直接RPCが止まらないため、新しいpublic/private両方の `get_environment_trend_aggregates_v1(uuid,text,text[],uuid[])` のauthenticated向けEXECUTEを取り消す、レビュー済みの復旧migrationを適用。既存RPC・RLSには触れない。実行中クエリまで即停止する保証はないので稼働状態も確認する。
3. migration失敗：rollback後に関数・index・履歴の残存を確認。COMMIT後は `ROLLBACK` で戻らない。履歴だけrevertedにする自動操作はしない。
4. index影響：旧アプリ復帰後も書込みへの影響が続く場合だけ、新indexの依存・利用・ロックを調べ、削除等は別の承認済み復旧手順とする。自動削除はしない。
5. 全DB復元：今回のDDLは戦績を書き換えないため通常不要。必要性を確認し、利用者の明示承認・書込み停止・復旧点以降の保全・許容損失／停止時間の再確認を経てSupabaseの対応手順を使う。ローカルsupabase_adminコマンドを本番に転用しない。復元後にAuth・ACL・RLS・戦績・Storage整合・履歴を確認する。

### 追加ファイル・証跡・再実行

今回アプリ・RPC・依存関係は変更していない。`tests/environment-trends-local-setup.cjs`（ローカル準備）、`tests/environment-trends-local.cjs`（実サービス・画面・復元）、`tests/environment-trends-local-performance.cjs`（実HTTP負荷・EXPLAIN）、`docs/development-verification-policy.md` を追加し、本書を更新した。新規3スクリプトのLintは成功。既に成功した型チェック・ビルド・全63DBテスト・集計オラクル・全単体テストの不要な再実行はしていない。既存49失敗は引き続き別件。

証跡は `build/environment-trends-local/real-stack-report.json`、`native-performance.json`、`native-plan-*.json`、`real-stack-browser.png`、`next-local.log`。合成バックアップは `synthetic-local-backup.dump`。Git対象外で本番データ・本番資格情報は含まない。

再実行はローカルopt-inと未リンク設定が必要。起動前に専用ポートを確認し、既存DBをresetしない。変更・未確認項目に応じて必要なものだけ実行する。

```powershell
$env:ENVIRONMENT_TRENDS_LOCAL = 'local-only'
node tests/environment-trends-local-setup.cjs
# CLI 2.118.0で専用workdirのローカルスタックを起動してから実行
node tests/environment-trends-local.cjs
# 復元部分だけなら --recovery-only
node tests/environment-trends-local-performance.cjs
```

## 本番適用直前の読み取り確認（2026-11-15 JST）

詳細・実行順序・停止基準・復旧方法は [本番適用直前確認報告](environment-trends-release-preflight.md) を参照。今回アプリ・SQL・テストは変更せず、成功済みテストも再実行していない。本番DB変更・migration適用・Vercelデプロイは未実行。

- **確認済み：** 11月15日06:16 JST時点の最新バックアップはID `2265589326`、同日01:57 JST登録、COMPLETED。PITR無効。登録時刻を正確な復旧点とは扱わない。
- **確認済み：** 06:17 JSTの推定戦績10,462件、テーブル約1.94MiB。観測時のmatchesのrelation lock・他の5秒超transactionなし。新index/RPCはまだない。
- **問題あり：** 通常CREATE INDEXは戦績書込みをCOMMITまで待たせ得る。CONCURRENTLYの単独工程とRPCのみのtransactionへの分離を推奨するが、今回は提案のみ。先に並行作成しても元の通常IF NOT EXISTS文を残すとSHARE lockが必要になる。
- **問題あり：** 本番既適用 `20261026111607_phase2a_minimize_database_privileges` がローカルmigrationにない。本番を変更せずローカル履歴を復元・レビューするまで一括適用しない。
- **未確認：** 本番の復元操作権限・正確な復旧点/RTO、実作成時間・新RPC実性能、Auth/PostgREST稼働設定の全差分。適用ゲートと公開後監視に残す。
- **復旧先確認済み：** 現行Vercel Productionは `dpl_AGJiH8dB5BmNGxwD2TF4qssHC3PZ`、commit `b318f771a272a04bbfb8eef196401bcf21d7e21b`。直前にも再確認する。通常の復旧は旧アプリへ戻し、新RPC停止が必要な場合はpublic/private両方のEXECUTEを取り消す。全DB復元を第一選択にしない。

**判定は「条件付きで可能」。** index工程・履歴差・復旧条件を解消し、明示許可を得るまでは実行しない。旧手順の「通常indexを含むmigrationにstatement_timeout=30秒を設定」だけでは、入力APIの8秒制限に対する安全性を保証できない。

## 本番適用準備の完了（2026-11-15 JST）

上の直前確認で判明した履歴差とindex工程を修正した。[本番適用手順・復旧手順](environment-trends-release-runbook.md)に8段階の実行順序・停止条件・承認ゲートを記載。本番への変更は未実行。

- Git commit `50dcc9d` の権限強化SQLと本番履歴を照合し、`20261026111607_phase2a_minimize_database_privileges.sql` を元のversionで復元。本番22件がすべてローカルに揃い、履歴repair・再適用は不要。
- `20261114104651_environment_trends.sql` はCONCURRENTLYによるindex専用（transaction=false）へ変更。新 `20261114212352_environment_trends_rpc.sql` にRPC/ACLを移した。関数・権限本文は分離前と同一。RPC工程は正常indexを要求し、BEGIN/COMMIT内で実行する。
- 独立した未リンクのローカルSupabaseに過去22→新24件をCLI 2.118.0で適用。並行作成待機中も実Auth/PostgRESTの会員戦績入力が成功（1件8ms）。故意のtimeoutでINVALID・履歴未登録を確認し、再実行とRPC追加を拒否。正常化後の適用と最終pendingなしを確認。
- 本番対ローカルで業務schemaの17テーブル・119列・36ポリシー・36既存関数・70制約が一致。新migration前後の既存関数/ACL/RLSも不変。新RPCの集計はミラーを含めサマリーと一致。
- `supabase/operations/environment-trends/` にindex確認・無効index削除・新RPC停止SQLを用意してローカル検証。RPC停止中も既存サマリーと入力は成功。有効indexは削除しない。
- `scripts/prepare-environment-trends-release.cjs` はファイル準備だけを行う。生成済み `build/environment-trends-release-package/` にindex/RPCの段階別workdirとハッシュmanifestを保存。本番コマンドは自動実行しない。
- 変更した構成/範囲の2テストと全migration ACL/RLSの対象1テスト、変更JS/CJSのLintが成功。アプリ・集計本文は未変更のため全テスト・ビルド・負荷試験は繰り返していない。

SQLのLF正規化SHA-256：復元した権限強化 `651faf3fb37a56d92dc21c3093295352beca4b633ef2aa189dd828685617c377`、index工程 `ba9f35bb4f3b35960163c170007fcd52aeeae2c2a490985c4dab8ee52c123d8e`、RPC工程 `c64ce5d864c80cbde7ecbbebf86675b7e66278619340efa3dd1f6a417cfc6597`。過去の一体版SQLハッシュは過去検証時点の記録である。

残存条件は実行当日の正常バックアップ／復旧権限・復旧点・許容損失／停止時間、稼働状況、明示承認。本番固有の作成時間・実RPC通信と性能は段階6および公開後の確認で評価する。復旧は旧アプリと新RPC単位を原則とし、全DB復元は通常行わない。
