# QA2-009 Phase 2 候補承認の移行と復旧

Stage Cで `20261014005220_atomic_suggestion_approval.sql` はProductionへ適用済み。Stage DはRPC対応アプリを**停止モードのまま**反映する。migrationはGitへ収録するだけで再適用しない。承認再開・本番承認実行はStage Eとして別途承認が必要。

Stage Aの停止互換版 `dpl_33Ej99zJNJodkNcBH97M4D3g7n8K`（SHA `f804a3c46473eafcb710f85868353482800c228e`）を保持する。この版は環境変数によらず無条件に停止し、Stage D以降の正式なrollback先とする。

## Stage Dの停止とStage Eの切替

既存の `ADMIN_SUGGESTION_WRITES` を再利用する。Stage DのProduction設定は未設定で、UIと両Server Actionが停止する。`false` も停止値であり、厳密に `rpc` のときだけ有効。フォームから送られた同名フィールドやクライアントのpaused値でサーバー側の判定は変わらない。停止時は新RPCも業務テーブル書き込みも行わない。Stage Aの安全性をこの既定停止制御へ統合し、直接送信で検証する。

Stage Eは別途承認後に以下を行う。

1. Stage DのSHA/READY、migration履歴17件、RPC契約・権限・cache、データ整合性、バックアップ、重大回帰なし、Stage A rollback先を再確認する。
2. 本番書き込みの許可範囲と監視・停止条件を合意する。既存7件を検証のために再承認しない。
3. 対象Vercelプロジェクトの **Production** 環境で `ADMIN_SUGGESTION_WRITES=rpc` を設定し、検証済みRPC対応コミットから新しいProduction Deploymentを作成する。設定変更だけでは既存Deploymentに反映されないため、再デプロイが必要。Preview・Developmentへは設定しない。
4. 新DeploymentのSHA/READY・設定・実管理者画面を確認後、許可された検証だけを行う。停止版Deploymentは有効化されず、そのまま保持する。
5. 異常時はStage A停止版へrollbackし、次のdeployで誤って再開しないようProductionの設定も未設定またはpausedへ戻す。旧2段階承認版へ戻さない。設定を戻すだけでは既存の有効Deploymentは止まらない点にも注意する。

環境変数の反映範囲：[Vercel Environment variables](https://vercel.com/docs/environment-variables)。アプリ停止フラグは管理者による直接RPC/SQLを禁止するDBスイッチではないため、停止期間中は直接承認操作も行わない。

## 互換版とRPC対応版

同じコードを、サーバー環境変数 `ADMIN_SUGGESTION_WRITES` で切り替える。

| 値 | 承認・却下 | DB要件 |
| --- | --- | --- |
| 未設定、`paused`、その他 | 画面で停止を案内し、両Server Actionも書き込み前に停止 | 旧DB、新DBとも利用可能 |
| `rpc` | 管理者確認後、`decide_deck_suggestion`だけを実行 | 新migration必須 |

既定は停止。クライアント入力でモードを変更できない。RPC未導入、権限エラー、応答不明時に旧INSERT→UPDATE処理へfallbackしない。候補の登録、環境管理、標準デッキの通常追加／更新、Phase 1の一括更新は停止しない。

管理者向け表示は「候補の採用・却下は移行作業のため一時停止中です。入力を控え、再開の案内をお待ちください。」。採用と却下の競合を避けるため両方を停止する。画面のdisabledだけでなく、サーバー側でも停止する。

## DB設計

追加migration：`supabase/migrations/20261014005220_atomic_suggestion_approval.sql`。

- 非公開schema `suggestion_private` の `approvals` に、候補ID（主キー）、承認先ID（UNIQUE／FK）、承認時クラス・名称、legacy区分、記録日時を保持する。
- 既存approved行については候補IDとlegacy区分のみ記録する。承認先はNULLのまま。既存候補・標準デッキのUPDATE／DELETEや名称による推測は行わない。
- 候補のユーザー削除で履歴まで失われないよう、記録から候補へのFKは設けない。候補IDを再利用したINSERTはtriggerが拒否する。参照先デッキのDELETEはFK RESTRICT。標準デッキの通常更新・無効化は従来どおり。
- 公開RPCはSECURITY INVOKER。非公開の処理関数は所有者postgresのSECURITY DEFINERで、`auth.uid()`、匿名フラグ、`is_admin()`を関数内部で検証する。引数に管理者フラグはない。
- 非公開テーブルはRLSを有効にし、アプリ用ロールへの直接テーブル権限をすべて剥奪する。関数は固定の空search_pathと完全修飾名を使用。PUBLIC／anon／service_roleへEXECUTEを付与せず、authenticatedの実行は内部の管理者判定で制限する。
- 候補をFOR UPDATEでロックし、デッキINSERT・承認記録INSERT・候補UPDATEを1回のRPCトランザクションで完了する。候補UPDATEの0行も例外にする。SQL例外を部分成功として握りつぶさない。
- 同じ候補・同じ承認入力は元のデッキIDを返し、異なる入力は競合。同じデッキの後日改名と承認時の入力を混同しない。
- 既存の `(class_name, name, COALESCE(environment_name, ''))` UNIQUEは維持。別候補の同一名は従来どおり制約違反で全体rollbackし、既存デッキへ自動関連付けしない。
- 新規候補はpendingのみ。approvedへの直接INSERT／未関連UPDATE、終端状態approved/rejectedからの戻しをtriggerで拒否する。承認前に却下が勝てば承認は競合、承認が勝てば却下は競合になる。

過去7件はlegacyとして再承認しない。「承認先未確定」と通知する。手動補正や再オープン機能は今回追加しない。

## Productionの必須事前条件

1. 対象Project ref、組織、local／remote／Production SHA、working tree、反映対象を再監査する。実在する成功済みバックアップ・復旧権限・取得日時を確認する。
2. schema／関数名の衝突、pending migrationが今回だけであること、候補・標準デッキの件数と対象項目ハッシュ、RLS／GRANTを記録する。今回のローカル確認時はapproved 7、rejected 5、pending 0、標準デッキ44件。将来も同じ件数とは仮定しない。
3. 今回のコードを `ADMIN_SUGGESTION_WRITES=paused` または未設定で反映し、停止版のDeployment ID・SHA・環境設定を記録する。これを新しいrollback先とする。
4. 停止版で管理者認証、候補一覧、他の管理機能、停止通知を確認する。採用・却下の古いフォーム送信も、停止版のServer Actionへ到達した場合は書き込みをしないことを確認する。
5. **旧承認コードを実行する全経路を止める。** Production aliasだけでなく、旧Deployment URL、Preview、別alias、Skew Protection等による旧版への振り分け、直接アクセスを列挙する。旧版へ管理者リクエストを到達させない制限・停止を別途承認されたリリース操作で実施し、到達不可を検証する。
6. **既に走っている旧承認を完了・終了させる。** サーバー側停止版は旧インスタンス内の実行中リクエストをキャンセルしない。設定済みの最大実行時間や実行ログで終了を確認し、対応するDB書き込みの残存も確認する。単に数秒待つ、ブラウザのボタンをdisabledにする、現時点でpendingが0件という理由だけでは進めない。

旧Deploymentのアクセス遮断、旧処理の終了、停止版への到達を確認できなければmigration前に停止する。アプリの停止モードはDB管理者による直接RPC実行まで停止する仕組みではない。メンテナンス中は管理者による直接RPC／SQL操作も行わない。

## 反映順序

1. 上記条件を満たした停止版を継続稼働させる。
2. migrationは**1トランザクション**で適用する。ファイル内の `SET LOCAL lock_timeout='3s'`、`statement_timeout='30s'` を有効にするため、トランザクション外でSQLを分割実行しない。migration履歴への記録も適用成功と整合させる。既存migrationは書き換えない。
3. 失敗時はROLLBACKと実DB・履歴を確認する。失敗したままアプリをRPCモードにしない。無期限待機や強制再試行をしない。新規schema、承認記録、trigger、関数の有無を確認してから再実行可否を判断する。
4. 候補・デッキのハッシュ不変、legacy記録、PK／UNIQUE／FK、関数所有者、固定search_path、EXECUTE、既存RLS／GRANT、migration履歴を確認する。
5. `NOTIFY pgrst, 'reload schema'` 後、Hosted PostgRESTのschema cache認識を確認する。Windows隔離検証ではLISTENを無効にし、そのローカルPostgRESTだけを再起動しているため、HostedでのNOTIFY受信は未実証。
6. 実管理者・通常ユーザー・未ログインで認証・取得・権限を検証する。本番の書き込み試験はそのリリース依頼の許可範囲に従う。ローカル成功だけでHostedの実書き込みを検証済みとしない。
7. 安全性を確認できたら `ADMIN_SUGGESTION_WRITES=rpc` の新Deploymentへ切り替える。停止版のDeploymentを保持する。UI案内・処理中排他・結果表示・標準デッキ一覧・ログを確認して再開を案内する。

再開条件は、停止版準備、旧経路遮断・drain、バックアップ、migration成功、Hosted認可・cache確認、SHA整合、重大回帰なしをすべて満たすこと。設定値を誤記すると停止状態を維持する。

## 障害時の復旧

| 障害時点 | 対応 |
| --- | --- |
| 停止版反映前 | DB変更せず停止。新RPC保証はまだ有効でない |
| 停止版稼働・旧DB | 候補操作を停止したまま調査。既存データを変更しない |
| migration途中失敗 | 全体ROLLBACKを確認し、停止版を維持。履歴・実状態を確認するまで再適用しない |
| migration成功・RPC版未反映 | 停止版を維持。DBの新規オブジェクトを独断でDROPしない |
| RPC版の重大回帰 | 記録した**停止版Deployment**へrollback。環境設定もpausedであること、古いフォームからの送信が書き込まないことを確認 |
| 応答消失・タイムアウト | 同じ候補・同じ承認内容で再試行。既に確定した承認は元のIDを返す。入力を変更して別デッキとして再送しない |
| legacy／対応不明 | 再登録せず停止して人が調査。名前から補正しない |

**81ceee4等、元の2段階承認を持つ版はmigration後のrollback先にしない。** 実コードを隔離DBで実行すると、先行INSERTだけが確定し、候補UPDATEが新triggerに拒否されて部分成功になることを確認している。DB復元・追加オブジェクトのDROP・履歴補正は別途判断する。

## ローカル検証の再実行

- `npm run typecheck`、`npm run lint`、`npm run build`（本番環境変数をコピーしない隔離workspaceを使用）
- `npm test`：旧415件に6件の振る舞いテスト・1件の変更範囲テストを追加
- `node tests/run-integration.cjs`：旧38件にSQL統合4件を追加
- `tests/suggestion-approval.native.cjs`：実PG／PostgREST fixtureを引数に受ける検証本体。今回の既存ローカルツール用runnerは `build/qa2-009-phase2-approval/run-native.cjs`
- `build/qa2-009-phase2-approval/browser.cjs`：承認フロー、応答消失、停止版rollback、Chromium／Edge・4画面幅
- `build/qa2-009-phase2-approval/phase1-browser.cjs`：新migration適用後のPhase 1回帰

native fixtureは127.0.0.1のみ、使い捨てdata directoryを照合し、子プロセスへOS変数と合成認証情報だけを渡す。Hosted接続文字列・本番トークンを渡さない。既存のローカルPostgreSQL／PostgREST／Playwrightツールを再利用し、依存パッケージは変更していない。

未保存入力は現在のページ内に保持される。離脱・reload後の復元は保証しない。通信断で結果不明の場合は入力を固定し、同じ内容での再試行ボタンを使う。Phase 1の保存・再試行方式は変更していない。

設計根拠：[Supabase Database functions](https://supabase.com/docs/guides/database/functions)、[関数EXECUTEの制限](https://supabase.com/docs/guides/troubleshooting/how-can-i-revoke-execution-of-a-postgresql-function-2GYb0A)。
