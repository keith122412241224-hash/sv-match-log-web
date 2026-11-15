# 推移分析・本番適用当日確認（2026-11-15 JST）

> **実行状態の更新：リスク再評価と後続の明示承認を経て本番適用・公開完了。** [実行結果と翌朝の確認](environment-trends-production-result.md)。以下のNO-GOは当時の条件に対する記録であり、現在の公開状態ではない。

> この文書は当時指定された条件でのNO-GO記録。利用者の後続指示により、全DB災害復旧と今回の追加変更の復旧を分けて再評価した。最新判定は[条件付きGO](environment-trends-risk-reassessment.md)。以下の「復元権限・復旧点未確定なら自動NO-GO」という基準は現在の公開ゲートには適用しない。読取結果・未確認事項は記録として保持する。

**本番適用：NO-GO。** [本番適用手順](environment-trends-release-runbook.md)を基準に、06:55〜06:58 JSTに読み取り確認した。その後の利用者回答で、**許容データ損失はゼロ、復元権限は未確認**と確定した。正確な復旧可能時点と、データ損失ゼロを満たす復旧手段も未確認のため、本番適用を開始しない。

今回は本番DB・migration履歴・Vercelに変更していない。Restore操作で権限を試す行為も行っていない。成功済みテストの再実行、アプリ／SQL変更、ローカルDB起動はなし。更新は報告文書とGit対象外の読み取り証跡のみ。

## 確認済み事項

| 項目 | 結果 |
| --- | --- |
| 本番対象 | Supabase `xbwxapwaadsrtckxewvx`、ACTIVE_HEALTHY、東京。Vercel `sv-match-log-web` |
| 最新バックアップ | ID `2265589326`、COMPLETED、物理バックアップ。06:55と06:57 JSTに再取得 |
| バックアップ登録日時 | `2026-11-14T16:57:20.779Z`＝11月15日01:57:20.779 JST。登録日時から約5時間経過 |
| PITR | 無効。WAL-G有効だが、任意時刻復元可能という意味ではない |
| 本番migration | 22件すべてローカル24件に存在し、version/nameが一致。不足・余分な既適用履歴なし |
| 予定差分 | index `20261114104651`、RPC `20261114212352` の未適用2件のみ |
| 配布ファイル | index工程23ファイル＋RPC工程24ファイル、計47コピーが原本・manifestのハッシュと一致 |
| 新index/RPC | 本番にはまだ存在しない |
| DBの競合 | 06:56:13 JSTの瞬間値でmatches relation lockなし、他の5秒超transactionなし、index作成進行なし、matchesのINVALID indexなし |
| DB接続・規模 | client backend 8、max_connections 60。戦績推定10,465件、テーブル2,039,808 bytes。全接続余裕や負荷保証ではない |
| Vercel現行版 | Production READY、`dpl_AGJiH8dB5BmNGxwD2TF4qssHC3PZ`。以前保存した復旧候補から変更なし |
| 公開HTTP応答 | `/login` と `/privacy` がHTTP 200（各1回、400ms/311ms）。認証後の全機能の試験ではない |

Supabaseログは **06:26:14〜06:56:14 JST** の30分を集計した。edge 112件、Auth 34件、Postgres 8件、PostgREST 13件を取得。利用可能なstatus/severity属性ではHTTP 4xx/5xx、error/fatal/panicを検出しなかった。`POST /rest/v1/matches` が3件、エラー0件で、通常の登録実績を確認できた。個人情報・JWT・個別戦績は取得していない。

Vercelの同時間帯に近い直近30分のruntime log集計はグループなし。これはリクエストやエラーが絶対に存在しないという証明ではない。CPU・I/Oの実測、認証後の画面操作、新RPCの本番性能は未確認。

## 未確認事項・NO-GOの根拠

1. **実担当者のRestore権限。** 必要なのは対象projectのバックアップ復元を許可されたプラットフォーム権限。DBのpostgres権限、アプリ管理者、バックアップ一覧の取得成功とは別。取得したorganization情報はplan等のみで、担当者の実効Restore権限を返さなかった。
2. **正確な復旧可能時点。** バックアップ応答はid/status/inserted_at/is_physical_backupのみ、`physical_backup_data={}`。完了時刻・DBの復旧点は取得できなかった。01:57 JSTをそのまま保証された復旧時点とは扱わない。Dashboardの対象バックアップの復元詳細、必要ならSupabaseの確認で確定する。確認のためにRestoreを実行しない。
3. **データ損失ゼロを満たす復旧手段。** 利用者回答で「データ損失は許容しない」と確定した。許容範囲自体は未確定ではなくゼロである。既存の日次バックアップへの巻戻しだけでこの条件を満たせるとは確認できていない。
4. **復旧所要時間・許容停止時間。** 本番での復元実測はなく、担当者との合意も未確認。

バックアップのCOMPLETEDは管理API上の正常完了を示す。内容の完全性・当日の復元成功を実地検証したという意味ではない。PITR無効のため、任意時刻や変更直前へ戻れるとは判定しない。

## 残存リスクと復元の影響

全DB復元では選択した復旧点以降の戦績・設定等が巻き戻る。復元中はサービス停止が必要になり得る。今回確認したバックアップ登録から約5時間が経過しているが、**失われる期間・件数の確定値ではない**。Storage実ファイルはDBバックアップに含まれないため、メタデータとの整合も確認が必要。[Supabaseバックアップ仕様](https://supabase.com/docs/guides/platform/backups)。

追加index/RPCの障害では、旧アプリ切戻しと新RPC停止を第一選択にする。全DB復元を通常のロールバックとして使わない。ただしこの方針だけでは、利用者が必須とした復元権限・復旧点・許容損失の確定を省略できない。

並行indexでもCPU/I/Oや古いtransaction待ち、本番実データの偏り、接続プール、Vercel→東京DBの通信による影響は残る。現時点でロックがないことは適用時の安全保証ではない。

## 実行予定の具体的な操作（すべて未実行）

NO-GOを解消して再判定し、DB・Vercelの各変更への明示承認を得た後だけ、手順書の順序で行う。現時点では当日の本番CLI `db push --dry-run` も未実行。履歴差はSELECTとローカルファイルで照合した。

| 段階 | 操作 | 停止条件・復旧 |
| --- | --- | --- |
| 1 | 最新バックアップ・復元担当権限・復旧点・許容損失/停止時間・稼働状態を直前再確認 | 1つでも不明ならNO-GOを維持。変更しない |
| 2 | index用workdirで固定CLI 2.118.0の `db push --project-ref xbwxapwaadsrtckxewvx --skip-vault --dry-run` | pendingがindex1件以外なら停止。repair/include-allは使わない |
| 3 | `build/environment-trends-release-package/index` をworkdirに同CLIでindex migrationのみ適用 | timeout・入力失敗・予期しないDDLなら後続中止。作業PIDと実状態を確認 |
| 4 | `check-index.sql` と履歴照合でvalid/ready/live・定義・1件登録を確認 | 不在/INVALID/別定義/履歴不明ならRPCへ進まない |
| 5 | `build/environment-trends-release-package/rpc` でdry-run後、RPC1件のみtransaction適用 | 衝突・SQLエラー・timeoutで停止。COMMIT前失敗はrollback、結果不明なら再実行しない |
| 6 | 所有者・search_path・EXECUTE・RLS不変、会員/匿名認可、同条件の集計・実時間を逐次確認 | 権限漏れ・集計不一致・既存入力失敗で新RPC停止。8秒timeoutや503反復も公開停止 |
| 7 | 正常な現行deploymentを再保存し、別途承認されたcommitをProduction設定でVercel公開 | ビルド失敗は旧alias維持。公開後障害なら保存した正常版へ切戻し |
| 8 | 旧機能と推移画面、15〜30分および翌日の通常利用を確認 | 入力失敗・認可漏れ・不一致・継続的劣化なら切戻し、新RPC直接呼出しも止める |

## 停止・復旧方法

- **アプリ障害：** Vercelを当日の直前正常版へ戻す。現時点の候補は `dpl_AGJiH8dB5BmNGxwD2TF4qssHC3PZ`。alias・ログイン・入力・分析・サマリーの回復を確認。Vercel切戻しはDBを戻さず、切戻し後の自動ドメイン割当は別途復旧する。[Vercelの復旧仕様](https://vercel.com/docs/instant-rollback)。
- **新RPCの漏えい・負荷：** 別途承認された `supabase/operations/environment-trends/disable-rpc.sql` でpublic/private両方のauthenticated EXECUTEを停止。既存RPC・RLSは変更しない。実行中クエリは別途確認する。
- **index失敗：** 作成プロセスの終了を確認し、INVALIDと未記録の履歴を照合。承認後に `drop-invalid-index.sql` で対象だけを並行削除。有効indexは原則残す。履歴だけのrepairや無条件再試行をしない。
- **全DB復元：** 戦績破損等で他の方法では回復不能な場合に限定。書込み停止・復旧点以降の保全・データ損失/停止時間の合意・別途明示承認を経て実施。今回はその前提が未確定。

GO再判定に必要なのは、対象バックアップIDに対する正確な復旧時点、実行担当者の復元権限の確認結果、確定した「データ損失ゼロ」を満たす復旧手段の検証と許容停止時間の確認。そのうえで当日の稼働状態と履歴を再確認する。旧アプリ切戻し・新RPC停止は戦績を巻き戻さない通常復旧として維持するが、全DB復元が必要な障害まで損失ゼロを保証するものではない。**現時点では承認依頼・適用実行へ進まない。**

証跡：`build/environment-trends-day-check/backup-http.json`、`production-readonly.json`、`history-comparison.json`。既存テスト結果は手順書から引き継ぎ、再実行していない。
