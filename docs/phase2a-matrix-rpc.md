# Phase 2-A: 相性表の集計RPC

基準コミット: `35f6ae23051a1c50ef80e4fd180b9eba0b5b0e96`。
この変更は本番基準の専用コピー `.vercel/phase2a-work` に実装したものです。
元の作業ツリーの未コミット変更は取り込んでいません。
本番DBへの適用・push・Productionデプロイは実施していません。

## 固定した本番仕様

根拠は基準コミットの `src/app/matrix/page.tsx`、`src/lib/data.ts` の
`getMatches/getDecks/getActiveArchetypes/getIsAdmin`、`src/lib/analytics.ts` の
`buildWinRateMatrix/calculateWinRate/matrixBand/calculateEnvironmentIndex` です。
これらのうち既存の共通データ取得・集計関数は一切変更していません。

| 項目 | 本番の相性表仕様／今回の維持方法 |
| --- | --- |
| 対象 | RLSで閲覧可能な戦績。日時・先後・勝敗・ランクの追加条件なし |
| 個人／全体 | 通常ユーザーは本人のみ。管理者も通常は本人のみ。管理者がscope=allを指定した場合のみ全体 |
| 権限確認 | ページの管理者確認を維持し、RPCでもauth.uid()と既存is_admin()を評価する |
| 環境 | URLの環境が一覧にあれば選択。無効・未指定ならcreated_atが最も新しい環境。一覧が空でIDが空なら環境条件なし |
| 集計方向 | 登録者側のみ。A→BとB→Aを区別し、勝敗・先後を反転しない |
| ID | my_archetype_id ?? my_deck_id、opponent_archetype_id ?? opponent_deck_id。SQLでは同じ順のCOALESCE |
| 件数・勝数・敗数 | 各登録行を1回加算。result=winだけ勝数に加算。敗数はtotal-wins。両者登録も重複排除しない |
| ミラー | A→Aセルへ登録1件として加算。50%への補正や除外はしない |
| null | 標準IDのnullは旧IDへフォールバック。旧IDもnullの行は本番スキーマのNOT NULL制約で作成不可。防御テストでは両方nullでも集計総数から除外しないことを確認 |
| 非アクティブ／不明 | マスタJOINで戦績を削らない。集計グループには保持し、表示デッキ一覧にないIDのセルは従来どおり表示しない |
| 同名・別ID | ID別のまま保持。表示名でGROUP BYしない |
| 表示デッキ | 有効な標準デッキが1件でもあればその一覧。なければ従来のgetDecks()の一覧 |
| 除外名 | getActiveArchetypes()の「その他」各クラス7名称の除外を維持 |
| 表示順 | 標準デッキはclass_name、sort_order、name順。旧デッキはsort_order、created_at順。取得済みの一覧順を変更せず行・列を生成 |
| セル数 | 表示する使用側デッキ数×相手側デッキ数。未対戦セルも生成 |
| 勝率 | wins / total * 100。0件はnull。表示は従来のMath.round(value*10)/10 |
| 色・少数サンプル | 勝率60/50/45/40%境界。1～4件は参考値。0件は未対戦 |
| 環境指数 | Math.round((winRate-50)*Math.min(1,total/20)*10)/10。0件はnull |

## 変更ファイル

- `src/app/matrix/page.tsx`: 生戦績取得と旧集計の呼び出しだけをRPC経由へ交換。
- `src/lib/matchup-data.ts`: 認証済みユーザーについてRPCを1回呼ぶ専用ローダー。
- `src/lib/matchup-aggregates.ts`: 応答検証と既存ヘルパーを使うセル生成。
- `supabase/migrations/012_matchup_aggregates_v1.sql`: 相性表だけの関数とEXECUTE権限。
- `tests/matchup-aggregates.test.cjs`: セル互換性、ページ接続、エラー検証。
- `tests/matchup-rpc.integration.cjs`: 実PostgreSQLエンジンで旧取得処理・RPC・最終セルを比較。
- `tests/matchup-rpc.browser.cjs`: ローカルHTTP経由の相性表・表示切替・PNG・エラー確認。
- この文書。

分析・レポート・ホーム・ゲスト・戦績登録・AI・Tier・ランク・PNG実装・Phase 1・依存関係は変更していません。
`getMatches()`と`buildWinRateMatrix()`は残しているため旧処理との比較が可能です。

## RPC契約

`public.get_matchup_aggregates_v1(p_environment_id uuid = null, p_include_all_users boolean = false)`

戻り値は1個のJSONBオブジェクトです。

```json
{
  "version": 1,
  "totalMatches": 10000,
  "groups": [
    { "myDeckId": "UUID", "opponentDeckId": "UUID", "total": 10000, "wins": 6666 }
  ]
}
```

IDはnullも表現可能です。`totalMatches`は非表示グループを含む登録件数です。
グループ順序は契約に含めません。画面の行・列は従来のマスタ順で生成します。
勝率、表示名、個人情報、戦績ID、日時、生戦績配列は返しません。
`count(*)`はbigintのまま集計し、32ビットintegerへの縮小はしません。
Next.js側で安全な整数・非負・wins<=total・重複グループなし・グループ総数とtotalMatchesの一致を検証します。
失敗、null応答、欠落・不正な応答を0件へ変換しません。

SQLは本人条件または管理者全体条件と任意のenvironment条件で絞り、COALESCEしたIDペアでGROUP BYします。
INNER JOIN、DISTINCTによる戦績排除、反転、並べ替え、勝率計算はありません。
単一JSONなので対面グループが1,000件を超えても行集合のページングを必要としません。
応答サイズ・DBメモリ・実行時間には別途上限があるため、無制限という意味ではありません。

`SECURITY INVOKER`、`STABLE`、空のsearch_path、スキーマ修飾した参照を使います。
PUBLIC/anonの関数権限を取り消し、authenticatedにEXECUTEを付与します。
任意user_id引数はありません。通常ユーザーのall要求は本人範囲に留まります。
既存RLSが管理者にも本人限定なら、RPCがそれを迂回することはありません。

## 互換性検証

`npm test`: 本番由来64件＋追加6件、計70件成功。
元ワークスペースも既存94件成功（変更は未取り込み）。
TypeScriptチェック・lint・production buildは成功。
既存ブラウザスモークテストと相性表専用ブラウザテストも成功しました。
相性表の初期表示はRPC 1回・生matches取得0回で、表示切替・PNG保存による再取得はありません。
RPCエラー時は既存のNext.jsエラー経路となり、正常な0件表示と区別されます。
元ワークスペース157ファイルのSHA-256とGit状態が作業開始時と一致することを確認しています。

独立したPGlite 0.5.8 / PostgreSQL 18.3 WASMで、実migrationを実行します。
PGliteはアプリのpackage.json/lockfileに追加していません。
本番スキーマと009管理者SELECTポリシーをローカルに再現しています。
Supabase固有auth.users/auth.uid()は検証用に定義し、使用しないpgcrypto拡張のインストールのみ省略しています。
UUID生成はPostgreSQLの組み込みgen_random_uuid()を使用します。

実SQLテスト7件は、各件内で以下を比較します。

- 0、1、999、1,000、1,001、10,000、100,000件。
- 全勝・全敗・混在、A→B・B→A・A→A、同一日時、両者登録。
- 標準ID優先、標準IDnull・旧IDフォールバック、非アクティブ・除外名・表示上不明のID、同名別ID。
- 通常本人・他の本人・管理者本人・管理者全体・通常のall要求・権限剥奪後・異なる環境・全環境・存在しない環境。
- 匿名のEXECUTE拒否、任意user_id引数拒否、既存RLSがより厳しい場合も迂回しないこと。
- 1,600グループを1個のJSONで完全取得。
- migration再実行前後で既存Index・RLS・テーブル列に差分なし。

対象登録件数、非表示も含む全グループのID・件数・勝数、敗数、画面へ渡す全セルオブジェクトを比較します。
最終セルの比較には勝率・順序・セル数・色区分・参考値フラグ・環境指数が含まれます。
旧本番の`getMatches()`をページング付きで実行し、同じ固定DBのRPC結果と比較します。
テストアダプターはSupabase通信をローカルSQLへ置き換えるだけで、SQLの集計をJavaScriptで模倣しません。

旧IDまでnullの行は本番では作成不可であることを先に検証します。
防御ケースだけローカルのトランザクション内でNOT NULLを一時解除し、テスト後にロールバックします。
本番スキーマやmigrationにこの制約変更は含まれません。

実行例（作業コピーをカレントディレクトリにする）:

```powershell
npm.cmd test
$env:PGLITE_MODULE = '<独立した検証ツールの絶対パス>/node_modules/@electric-sql/pglite'
node --require ./tests/register.cjs --test tests/matchup-rpc.integration.cjs
npm.cmd run typecheck -- --incremental false
npm.cmd run lint -- --ignore-pattern 'build/**'
```

ビルドとブラウザはローカルURL・ダミーキーを使用します。`.env`を本番からコピーしません。

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54329'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-key'
$env:NEXT_PUBLIC_SITE_URL = 'http://localhost:3217'
$env:OPENAI_API_KEY = ''
$env:NEXT_TELEMETRY_DISABLED = '1'
npm.cmd run build
$env:PLAYWRIGHT_MODULE = '<ローカルPlaywrightモジュールの絶対パス>'
node tests/browser-smoke.cjs
node tests/matchup-rpc.browser.cjs
```

両ブラウザテストは同じ検証APIポートを使用するため順に実行します。

## API・転送量・メモリ

以下は合成データをJSON化したサイズです。HTTPヘッダー・圧縮・通信時間は含みません。

| 固定データ | 旧API回数 | RPC回数 | 旧転送行数 | グループ数 | 旧JSONバイト | RPC JSONバイト |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000件、同一対面 | 11 | 1 | 10,000 | 1 | 5,193,335 | 179 |
| 100,000件、同一対面 | 101 | 1 | 100,000 | 1 | 51,933,335 | 182 |
| 1,600件、全対面別 | 2 | 1 | 1,600 | 1,600 | 830,401 | 203,244 |

認証・管理者確認・マスタ取得は上記回数に含めません。
0件も旧方式は1回、RPC方式も1回です。小さなデータで必ず通信量が減るわけではありません。
生戦績N件の配列を保持せず、対面グループG件の配列とMapを保持する形に変わります。
既存UIのD×Dセルはそのままなので、メモリの目安はO(N+D²)からO(G+D²)です。
JSONサイズをJavaScriptヒープ使用量と同一視しません。実プロセスのピークRSSは未測定です。

SQL計測・完全なEXPLAIN JSONは`build/matchup-rpc-evidence.json`へ出力します。
EXPLAINは関数と同じSELECT本体に同じ引数・認証ロールを適用した診断です。
RPC呼び出しの実測時間は別に3回記録します。最終検証では10,000件が約15～16ms、100,000件が約91～130msでした。
WASM・単独ローカルDB・合成データの値であり、Supabase本番性能の予測ではありません。
全行が対象のケースはSeq Scan＋HashAggregate、明示Sortなし、1グループのHashAggregateピーク32KBでした。
これはDBプロセス全体やJSON生成のピークメモリではありません。対象行走査は残ります。

## Index

基準スキーマにはPK(id)、user_id/played_at、environment_id、my_deck_id、opponent_deck_id、
user_id/my_archetype_id/opponent_archetype_idのIndexがあります。変更・追加していません。
RPCのWHEREはuser_id・environment_id・管理者判定、GROUP BYは両側のCOALESCEです。
全件対象のSeq Scanだけを理由にIndex不足とは判断できません。
将来、環境＋本人で絞る実分布の計画が悪い場合に限り、(user_id, environment_id)を候補として比較できます。
期待効果は対象外行の走査削減です。全体集計や全件対象には効かず、INSERT時のIndex更新・容量は増えます。
追加判断にはステージングの実分布・実行計画・書き込み性能の確認が必要です。

## 本番反映前の残作業

1. 最新mainと基準コミットの差分を確認し、今回の8ファイルだけをレビューする。
2. 実Supabaseと同じPostgreSQL/PostgREST構成の検証環境で、JWT・EXECUTE・RLS・JSON形状・1,600以上の対面を確認する。
3. 本番RLS、is_admin()、テーブル権限、既存Indexの適用状態を読み取りで監査する。スキーマファイルだけから推測しない。
4. 通常利用・管理者全体・疎な環境・多グループ・同時アクセスで実行計画、応答時間、応答サイズを確認する。
5. 新RPCの適用を先に確認してからアプリを切り替える。RPC未適用時は取得エラーとなる。無条件の生戦績フォールバックは設けていない。
6. ロールバックは旧相性表の取得経路へ戻す。新RPCは読取専用なので、既存戦績のデータ移行・巻き戻しは不要。

012という番号は未リリースの011ランクmigrationとの衝突回避です。011を依存条件にはしていません。
元ワークスペースからmigrationディレクトリ全体を適用したり、未コミット差分全体をデプロイしてはいけません。
この工程では本番適用を実施していません。
