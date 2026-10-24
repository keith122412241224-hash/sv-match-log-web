SV Match Log 保存ステータス修正・ローカル検証報告（2026-10-24 JST）

判定：**A（ローカル検証上、本番反映可能）**。commit・push・デプロイは未実施。実環境への接続やデータ変更も行っていません。

原因は、送信前にsessionStorageへ保存する復旧用データを、`PendingMatchRecovery`が即座に未確認保存として表示していたことです。通常送信と再試行が共通のbusyフラグだったため、正常な送信中にも黄色いエリアと「保存状態を確認中...」が表示されていました。処理時間に関係なく発生する表示上の問題です。

変更した製品コードは次の3ファイルです。

| ファイル | 変更内容 |
| --- | --- |
| `src/lib/match-submission.ts` | 実行中の状態を初回送信` saving `と再確認` checking `に分離。永続化する入力・UUIDの形式は変更なし。通信例外の文言を「保存結果を確認できませんでした」に変更。 |
| `src/components/matches/PendingMatchRecovery.tsx` | 初回送信中は復旧エリアを表示しない。未確認データが残った場合は明示的な警告と再試行ボタンを表示。再確認中は既存の確認中表示、成功確認後は緑色の「保存しました」を表示。 |
| `src/components/matches/QuickMatchForm.tsx` | 外部の復旧操作開始時に古いエラー表示を解除。例外時は入力画面の具体的なエラーと復旧案内を残し、「保存に失敗しました」と断定する汎用Toastは出さない。通常成功時のToastと保存中の二重送信防止は維持。 |

保存処理への影響：サーバーAction、API、SQL、DB、RLS、依存関係には変更がありません。送信回数・順序、request_idの生成・照合、成功確認後のみ未確認データを消す条件は維持しています。入力内容とUUIDを送信前にsessionStorageへ保持するため、送信中に再読み込みしても復旧可能です。実行中の状態はメモリだけで管理し、再読み込み後に残るデータは未確認として扱います。警告を時間経過で消す処理は追加していません。

検証結果は以下のとおりです。

| 要件 | 結果・確認内容 |
| --- | --- |
| 1. 通常保存中に警告なし | 成功応答を意図的に保留し、DOMの変更を監視。警告の一瞬の表示もなし。保存ボタンは「保存中...」。pageshowイベント時も非表示。 |
| 2. 成功表示 | サーバーの成功応答受信後に「戦績を保存しました」。復旧成功後も緑色の「保存しました」。 |
| 3. 連続クリック | 連続クリックとrequestSubmitを重ねても送信1回・登録1件。 |
| 4. 通信エラー時の入力保持 | サーバー到達前の通信遮断、DB応答消失、Server Action成功応答の破棄で、入力・UUIDを保持。 |
| 5. 結果不明時の警告 | 「保存結果を確認できませんでした」と再試行ボタンを表示。未確認中に成功表示なし。 |
| 6. 再試行の冪等性 | 元のrequest_idを再使用。未登録なら1件保存、登録済みならDB行が完全一致し件数増加なし。再確認中は再試行ボタンを無効化。 |
| 7. 再読み込み後の復旧 | 失敗後・応答消失後・初回送信の応答待ち中に再読み込みしても同じ入力とUUIDで復旧。 |
| 8. 他の利用形態 | 会員・ゲスト・編集、予約期間の開始/終了、端末時計のずれ、環境の入力停止後の復旧、ホーム遷移・履歴、複数タブの既存回帰を確認。 |
| 9. ブラウザ | Chromiumの既存回帰と最終通知修正の集中検証、Edgeの最終コードでの全回帰が成功。想定して注入した通信エラーを除き、コンソールエラー・警告・pageerrorなし。 |
| 10. Unit・ビルド | 最終コードでUnit 509/509成功、build成功、typecheck成功。lintはエラー0件、未変更の`tests/dependency-security.test.cjs`の既存警告2件。 |

ブラウザ検証は実際のNext.jsビルドとServer Actionsを使い、接続先をlocalhostのHTTPアダプターに限定しています。データ検証には使い捨てのPGlite上で既存migration・RLS・RPCを実行しています。認証はテスト用セッションであり、実Supabase Auth/PostgRESTや本番ネットワークの検証ではありません。

初回Edge実行には、既存の端末時計回帰中に`page.goto`のnetworkidle待ちが30秒でタイムアウトした試行があります。サーバーログにエラーはなく、待機時間や検証条件を変更せずに再実行し、最終コードで全回帰が成功しました。このタイムアウトを保存処理の遅延とは断定していません。

処理時間は表示問題と別に計測しました。遅延注入なしのローカルクリック→成功表示は、最終検証のChromiumで113/129/161ms、Edgeで70/61/61ms（各3回）。本番の速度を示す数値ではありません。今回の変更は表示の分離であり、高速化・待機時間追加は行っていません。本番の保存時間は未計測です。

追加したテストは、初回送信/再確認の状態遷移、送信中の再読み込み、警告の瞬間的表示の監視、通信遮断、成功確認前の表示、再試行後のDB行比較です。過去のソース固定比較には今回の3ファイルの正確なハッシュを検証する層を追加し、無関係な変更を許可する除外にはしていません。

ローカル証跡（`build/`はGit対象外）：

- `build/match-save-status-unit-verified.log`
- `build/match-save-status-build-final.log`
- `build/match-save-status-typecheck-final.log`
- `build/match-save-status-lint-verified.log`
- `build/match-save-status/chromium/browser.json`（既存回帰）
- `build/match-save-status/chromium-final/browser.json`（最終通知修正を含む集中検証）
- `build/match-save-status/edge-final/browser.json`（最終コードの全回帰）
- 各ブラウザの`save-status-saving.png`、`save-status-success.png`、`save-status-unknown.png`、`save-status-checking.png`

基本チェックは`npm.cmd test`、`npm.cmd run build`、`npm.cmd run typecheck`、`npm.cmd run lint`で実行します。ブラウザは`tests/match-mutations.browser.cjs`を実行し、`PLAYWRIGHT_MODULE`・`CHROME_EXECUTABLE`・`PGLITE_MODULE`でローカルの検証ツールを指定します。ビルド時と起動時の`NEXT_PUBLIC_SUPABASE_URL`をテスト専用loopback URLに揃え、`MATCH_API_PORT`を同じポートに設定します。`NEXT_PUBLIC_SUPABASE_ANON_KEY`はダミー値を使用します。今回の接続先は`http://127.0.0.1:54339`です。`MATCH_SAVE_STATUS_ONLY=1`なら今回追加した集中検証のみ実行できます。
