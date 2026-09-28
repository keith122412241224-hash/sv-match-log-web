# 環境の戦績入力予約

`allow_match_input` による手動許可と、`match_input_start_at` / `match_input_end_at` の予約期間を併用します。開始以上・終了未満が入力可能期間です。NULL はその側の日時制限なしで、手動許可を外すと期間中でも入力できません。

管理画面の「開始日」は従来の環境情報です。今回の「入力開始日時」「入力終了日時」とは別の項目です。日時欄はブラウザの地域設定に関係なく日本時間（Asia/Tokyo）として扱います。終了が開始と同じ、または前の設定は保存できません。

## 2026/9/29 の切替例

| 環境 | 手動許可 | 入力開始日時（JST） | 入力終了日時（JST） |
| --- | --- | --- | --- |
| 旧環境 | ON | 既存の設定または空欄 | 2026/9/29 17:00 |
| 新環境 | ON | 2026/9/29 17:00 | 空欄 |

両方の切替時刻はDBでは `2026-09-29T08:00:00.000Z` です。17:00ちょうどから旧環境へのINSERTを拒否し、新環境に入力できます。これらはテスト用の設定例で、migrationによる予約データの投入は行いません。

複数の環境を同時に手動許可できる従来の仕様を維持しています。運用時は他の入力可能環境も確認し、意図した期間だけを設定してください。

## 保存と開いたままの画面

入力候補はServerから受け取った現在時刻を基準に絞ります。前回選択した環境がまだ候補にあれば維持し、外れた場合は従来どおり作成日時が最新の候補を選びます。

次の開始・終了境界で単発タイマーにより、取得済みの予約から候補を更新します。追加queryやrouter.refresh、定期pollingは行いません。現在の候補がゼロでも将来の開始を予約します。Server時刻に単調増加時計の経過時間を加えて表示時刻を進めます。focus/visibility復帰でも境界を確認します。遅延やsleepによって表示更新が遅れても、Server ActionとDBのINSERT triggerが信頼できる現在時刻で保存を検証します。後から追加・変更された予約や手動停止の表示は画面更新で反映されます。

通常登録・連続入力は同じ保存処理です。既存の成功表示、失敗表示、ホームへの遷移を維持しています。

guestは端末内保存のため、停止中のタブで古い候補のまま保存したローカルデータまで厳格に拒否しません。DB取込時には取込時点の期間を必ず検証します。元の環境IDを維持し、新環境へ付け替えません。期間外データは端末に残ります。200件上限、一括取得、partial import、ID確認と並行編集保護は維持しています。検証とINSERTの間に期間が終了してDBがバッチを拒否した場合も、取込済みIDは返さず全件を端末に残します。

## migration と検証

正式migrationは `supabase/migrations/20260928060000_environment_match_input_schedule.sql` です。baselineとlegacyは変更していません。2列はいずれも nullable `timestamptz`、defaultなしです。既存環境のbackfillや過去戦績の変更はありません。

DB側には期間のCHECK、共通のSQL判定関数、INSERT検証triggerを追加します。triggerはsecurity invokerで、既存RLSに従って環境を読み取ります。既存Policy、Index、集計RPCは変更しません。UPDATEによる過去戦績の編集仕様は変更しません。

ローカル検証:

```text
supabase db reset --local
supabase migration list --local
npm test
npm run lint
npm run build
npm run typecheck
node tests/environment-schedule.integration.cjs
node tests/environment-schedule.browser.cjs
```

integration試験は `PG_MODULE` で指定するpgパッケージと、`127.0.0.1:54322` のローカルSupabaseを使います。データ操作はtransactionをrollbackします。browser試験は `PLAYWRIGHT_MODULE` と必要なら `CHROME_EXECUTABLE` を指定し、ローカルNext.js＋HTTP fixtureだけを使います。

管理画面の予約保存は既存の管理者認証・検証処理を呼ぶPOSTと303画面遷移を使用します。OriginとHostの一致を確認し、検証済みのアクセス元へ戻ります。これはローカル試験で確認したRSC遷移待ちに予約保存が依存しないための変更です。境界更新も取得済みデータだけで完了します。package.jsonや既存ランタイム設定は変更していません。

Production反映前には最新HEADとの再比較、バックアップ、対象projectとmigration履歴の確認、新migrationだけがpendingになることの再確認、migration先行・アプリ反映の順序、実際の旧／新環境IDと予約値の確認が必要です。今回のローカル作業ではProduction操作、commit、push、deployを行っていません。
