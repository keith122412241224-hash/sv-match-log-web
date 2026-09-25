# Phase 2-C ローカル実装・検証報告

基準: e430a568dedd847aa38e34b90c7a45e9a63752c8。作業先: build/phase2c-work、ブランチ phase2c-period-report。コミット・push・本番DB変更・デプロイは行っていない。

1. **変更ファイル**: 下記一覧。アプリ4ファイル、新RPC migration 1ファイル、互換試験・モック・仕様文書のみ。
2. **Production仕様**: [固定した仕様](phase2c-production-contract.md)。原本は tests/fixtures/weekly-report-e430a56.ts に保存し、Git基準ファイルと一致することも試験している。
3. **RPC**: get_period_report_aggregates_v1。入力は当期間開始／終了・前期間開始／終了の timestamptz 4引数だけ。戻り値は version/current/previous、各期間に totalMatches と方向付き対面 groups。各群は myDeckId/opponentDeckId/total/wins/firstOrdinal。raw行や個人情報は返さない。
4. **直接／反転**: SQLで方向付き対面の total/wins を数え、TypeScriptで同じ圧縮群から直接 wins と反転 total-wins を統合する。直接50%＋反転70%は20戦12勝と一致。direct/reversedを重複転送せず、生matchesや疑似matches配列を生成しない。
5. **ミラー**: 通常勝率には両視点、Tierと統合対面は除外。元登録件数と遭遇数には1件。ミラーのみのTier候補は0サンプルで保持。
6. **期間**: JST開始00:00:00.000以上、終了23:59:59.999以下。前期間は同日数だけ戻す既存関数のまま。終了+1µsは除外。日・月跨ぎ、当期／前期のみ、両端と直前直後を検証。
7. **SQL構造**: 2期間のVALUES → matchesの期間条件 → played_at DESC/id DESCでrow_number → 方向付きIDペアGROUP BY → 期間別JSON。マスターJOINなし。旧取得順のfirstOrdinalで同率時の安定順を維持。新Index/RLS/Policy/table変更なし。
8. **TypeScript維持**: 勝率、丸め、遭遇率、差分、表示順、Tier、Strength、信頼度、警告、上位選択、AI JSON、プロンプト、手動Tier、UIは既存処理。期間レポートには元から先攻／後攻集計がないため追加していない。
9. **互換比較**: 0/1/999/1000/1001/10000/100000件、各期間の空、全勝／全敗／混在、方向・ミラー、標準ID優先／旧ID／不明／非アクティブ／同名別ID、同時刻の並びを比較。旧raw集計エントリも保持。
10. **最終モデル**: SQL試験19条件で、画面へ渡す全モデルを原本とdeepEqual。AI JSONとプロンプト文字列、全配列順序も比較。ブラウザでもProduction原本のAI JSONと一致。
11. **Tier等**: Tier、Strength、major matchup、confidence、warnings/reasons、前期間差分まで完全一致。評価関数のソース不変を別途検査。手動Tier切替・評価保留・PNG・コピーは既存スモークでも成功。
12. **テスト**: 単体88件成功。独立PostgreSQL統合試験成功。ブラウザ5スイート成功（期間RPC、Phase 2-B、Phase 2-A、既存スモーク、PNG/ZIP）。PNG17件・ZIP4件成功。新期間ブラウザで1 RPC／raw matches 0／PNG再取得0／4種エラーと正常0件の区別／非管理者リダイレクトを確認。
13. **型・lint・build**: 成功。lint警告なし。buildには隔離コピーに伴う複数lockfileの警告とwebpackキャッシュ性能警告のみ。
14. **API削減**: 下表。旧方式の件数は既存1000件ページングのモデル値（端数なしでも最終空ページを含む）。新方式の1 RPCはブラウザ境界でも実測。認証・マスター呼出しは別。
15. **転送・メモリ**: 下表のJSONは合成レコード／実SQLレスポンスをシリアライズした実測サイズ。HTTPヘッダ・圧縮は含まない。Next.js保持はraw配列から群配列へ減少。プロセス単体RSS/heapの差分は測定していないため、JSON容量を実メモリ使用量とは扱わない。
16. **SQL性能**: PostgreSQL 18.3 (PGlite 0.5.8) on wasm32-unknown-emscripten, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.74 (1092ec30a3fb1d46b1782ff1b4db5094d3d06ae5), 32-bit、work_mem=4MB。3回のRPC時間と完全なEXPLAIN ANALYZE BUFFERS JSONをbuild/period-report-sql-evidence.jsonに保存。本番17.6とバージョン・環境が異なるためProduction性能の保証ではない。
17. **権限**: INVOKER、空search_path、PUBLIC/anon EXECUTEなし。authenticated管理者と管理者identity付きservice_roleのみ成功。通常ユーザー、未認証、anon、identityなしservice_roleは42501。通常ユーザーの直接SELECTも既存RLSで本人分に限定。新migration前後で既存RPC定義・RLS・Policy・Indexが不変。
18. **Index**: 追加していない。ローカルでは既存記録のPK、user_id/played_at、user_id/両archetype、各legacy deck IDのIndexを再現。本番の最新定義は未再監査。候補は matches(played_at DESC,id DESC)：全ユーザー期間検索への寄与を本番相当計画で評価する余地があるが、並べ替え／RLS評価が残るため採用は未判断。追加するとINSERTごとのB-tree更新、WAL、容量が増える。今回はDDLを作成・適用していない。
19. **Phase 2-A/B**: RPC、ロード処理、画面、共通集計関数はGit基準と一致。双方ブラウザ成功。data.tsは期間レポート部分だけ変更し、他のローダーはソース比較で不変。
20. **元workspace**: 157ファイルのSHA-256とGit状態が作業前後で一致。
21. **本番前の残確認**: PostgreSQL17.6と実データ分布での計画・8秒timeout・同時利用時性能、最新Index/RLS/関数権限の読み取り監査、実データ旧新突合、将来のRPC追加後の単体確認／アプリ切替スモーク。今回は本番へ進めない。

## 転送・性能比較（32デッキ、当期と前期に各1024方向付き群）

| 件数 | 集計API | 保持／転送単位 | JSONサイズ | ローカルRPC ms（3回） |
|---|---:|---:|---:|---:|
| 10,000＋10,000 | 22 → 1 | 20,000行 → 2,048群 | 5,308,553 → 299,388 bytes (94.36%減) | 279.7 / 325.6 / 322.4 |
| 100,000＋100,000 | 202 → 1 | 200,000行 → 2,048群 | 53,084,861 → 303,346 bytes (99.43%減) | 2292.7 / 2405.5 / 2363.6 |

JavaScriptの旧raw行走査回数（外側ループ、コードから計数）は1万＋1万で109,378、10万＋10万で1,093,752。新経路ではraw行走査0、群の走査は最大20,480回という保守的上限。評価用Map／配列の並べ替えは引き続き既存TypeScriptが行う。秒単位の性能はハードウェア、PGlite、他の検証プロセスの負荷に依存する。

## 実行計画

- size-10000: Result → WindowAgg → Sort → Nested Loop → Values Scan → Bitmap Heap Scan → Bitmap Index Scan → Aggregate → Subquery Scan → CTE Scan。HashAggregate peak 465 KiB / disk 0 KiB。Sort [{"method":"quicksort","spaceKiB":2338,"space":"Memory"},{"method":"quicksort","spaceKiB":233,"space":"Memory"}]。トップのtemp read/write 0/0 blocks（8 KiB/block）。Seq Scanなし、既存IndexのBitmap Scan。
- size-100000: Result → WindowAgg → Sort → Nested Loop → Values Scan → Bitmap Heap Scan → Bitmap Index Scan → Aggregate → Subquery Scan → CTE Scan。HashAggregate peak 449 KiB / disk 0 KiB。Sort [{"method":"external merge","spaceKiB":16360,"space":"Disk"},{"method":"quicksort","spaceKiB":233,"space":"Memory"}]。トップのtemp read/write 2045/4247 blocks（8 KiB/block）。Seq Scanなし、既存IndexのBitmap Scan。

20万件では順序維持用ソートと中間CTEが一時領域へ書き出す。4MB work_mem下のローカル結果であり、Index候補だけでこのコストが解消するとは断定しない。生行を転送しない代わりにDB側の集計・ソート負荷が生じるため、本番の実行計画と負荷評価が必要。

## 変更ファイル

- `src/lib/data.ts`
- `src/lib/weekly-report.ts`
- `tests/browser-smoke.cjs`
- `tests/data-and-pages.test.cjs`
- `docs/phase2c-production-contract.md`
- `src/lib/period-report-aggregates.ts`
- `src/lib/period-report-data.ts`
- `supabase/migrations/014_period_report_aggregates_v1.sql`
- `tests/fixtures/weekly-report-e430a56.ts`
- `tests/period-report-aggregates.test.cjs`
- `tests/period-report-data.test.cjs`
- `tests/period-report-fixture.cjs`
- `tests/period-report-rpc.browser.cjs`
- `tests/period-report-rpc.integration.cjs`
- `tests/period-report-scope.test.cjs`
- `docs/phase2c-verification.md`

## 再検証

作業コピー内で `npm test`、`npm run typecheck -- --incremental false`、`npm run lint -- --ignore-pattern 'build/**'` を実行できる。SQL試験は `PGLITE_MODULE` に独立PGliteのパスを指定し、`node --require ./tests/register.cjs --test tests/period-report-rpc.integration.cjs` を実行する。今回使ったPGliteは既存の `.vercel/phase2a-tools/node_modules/@electric-sql/pglite` で、アプリ依存関係は変更していない。

ブラウザ試験は `PLAYWRIGHT_MODULE` にPlaywrightを指定する。build時・実行時とも `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329` とダミーの `NEXT_PUBLIC_SUPABASE_ANON_KEY=test-public-key` を使い、`OPENAI_API_KEY` は空にする。先に `npm run build`、続いて各 `tests/*rpc.browser.cjs`、`tests/browser-smoke.cjs`、`tests/analysis-png.browser.cjs` を順次実行する。APIモックが同じポートを使用するため、これらを同時実行しない。
