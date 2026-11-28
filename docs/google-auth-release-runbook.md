# Googleログインの本番公開と切り戻し

## 2026年11月28日の判定

基準は `7a14e7e73a1374765bccd8a04af86a3cd15a60b2`。ブランチは `verify/local-google-oauth`。Googleログインの既定値は無効。サーバー変数 `SUPABASE_GOOGLE_AUTH_ENABLED=true` のときだけ、画面とサーバーアクションの両方で有効になる。正式なVercel Productionと下表のサイト・Supabaseの組、またはPC専用の `127.0.0.1:3100` と `127.0.0.1:55321` の組を受け付ける。Previewでは無効。プロバイダーの設定とアプリのフラグは独立している。

本番の公開Auth設定を読み取った結果、Googleは無効、メールは有効だった。Vercel Productionの環境変数一覧にGoogleログインの公開フラグはなく、配信中のログイン画面にもGoogleボタンはなかった。Google Cloudの本番用クライアント、同意画面の公開状態、実際に登録されたURIは運用者による確認が必要。

**公開判定は本番確認・承認待ち。** PCでの実装検証を完了した。Google Cloudの本番クライアント・Audience・コールバックURI、およびHosted SupabaseとVercelのログの取扱いを運用者が確認するまで、認証プロバイダーと公開フラグを無効に保つ。

### 修正後の検証記録

| 検証 | 結果 |
|---|---|
| 実Google・一般会員 | 新しいローカルDBで新規登録し、ログアウト後のGoogle再ログインで同じUUIDを確認。Googleのみの状態からローカルの受信箱でパスワードを設定し、メールで再ログインした。復旧後も同じUUID・個人データ・一般権限を確認 |
| 実Google・管理者 | テスト用メールを先に確認して管理者を付与。Googleログイン後もメールとGoogleの認証方式が同じUUIDに結び付き、既存の戦績・2種類のデッキ・プロフィール・管理者権限のスナップショットが一致。両実セッションで閲覧可能な行とブラウザーの表示テーマを確認 |
| メール・ゲスト | Google有効の開発環境と、Googleプロバイダー・フラグ両方が無効の本番ビルドで検証。メール登録・確認・再設定の全遷移で元のオリジンを維持し、Cookieを使用してホームに戻った。旧パスワードの拒否、新パスワードによるログイン、ログアウト、ゲスト導線を確認 |
| 本番設定の模擬・異常系 | 外部通信を遮断して本番の設定値と固定版SDKを使用。S256 PKCE、フラグ無効、Preview、接続先不一致を確認。取消・失敗・期限切れ・使用済みは合成のSDK応答で検証。不正な戻り先は単体試験。以前のログに含まれる値を試験に使用していない |
| ログ | 新設した有効・無効の計12コンテナで認証クエリ・Googleクライアント情報・署名付きトークンの既知形式を検査し、検出0。Kongでは認証を含むアクセスのメソッド・パス・ステータス・所要時間が残った。Next.js開発ログでは合成マーカーを除外し、通常アクセスと失敗イベントを保持 |
| 自動試験 | 標準620件、PGlite統合76件、復元・所有確認19件が合格。TypeScript、ESLint、本番ビルドを実施。正式なCodex Securityスキャンは開始APIが診断 `Python` を返し、scanId未発行。代替として認証入口、コールバック、セッション、復元・ログの差分に独立した静的レビューとセキュリティテストを実施 |

## 公開前の確認

### PR #8 の追加確認

- 本番管理画面ではGoogleプロバイダーが無効、メール認証とメール確認が有効、組織の対象プロジェクトで `Allow new users to sign up` が無効だった。リポジトリのローカル設定、運用文書、Git履歴、既存Issue・PRからは本番の新規登録を止めた理由を特定できなかった。Google無効の先行版ではこの設定を維持する。新規登録を開く判断にはメール登録への影響も含める。
- Google有効時のログイン・登録画面に、公式のGロゴ付き「Googleで続ける」、「または」、メールフォームの順で表示する。Google無効時とパスワード再設定画面はメールのみ。ボタン素材とGoogle Sansは自サイトから配信する。[Googleのブランドガイド](https://developers.google.com/identity/branding-guidelines)
- 固定版のauth-jsとSSRに合成の認証応答を渡し、コード交換、分割Cookieの復号、別リクエストでの読込、セッション更新、ログアウトを試験した。標準のSDKは応答に含まれる `provider_token` と `provider_refresh_token` も保存する。このアプリではSupabaseのトークンエンドポイントの成功応答から両項目をSDKに渡す前に除く。Supabase自身のアクセストークン・更新トークンは維持する。以前の検証版が発行済みのCookieはログアウトで消去する。今回の修正では標準622件が合格し、Lint、型チェック、本番ビルド、有効・無効のブラウザー表示を確認した。

1. VercelのProductionで `NEXT_PUBLIC_SITE_URL` を本番Site URL、`NEXT_PUBLIC_SUPABASE_URL` を本番SupabaseのHTTPSオリジンに設定する。本番Site URLには既存の既定値がある。Preview・Developmentに本番のGoogleクライアントを登録しない。
2. メール作成時と認証完了時は、同じ設定済みサイトオリジンを使用する。ホームまたは `/auth/reset-password` に戻す。既存のメールURL・OTPハッシュ・PKCEコードに対応する。ブラウザー操作でメール確認と再設定後のオリジン、セッション、ログアウトを照合する。コード交換は一回限りで有効期間は5分。[Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
3. OAuthの秘密値はSupabaseのGoogleプロバイダーに保管する。PCでは専用端末の非表示欄から入力する。Git、Next.js、Vercelの変数にコピーしない。次の表に沿って、運用者が本番のログ保存・閲覧・転送の範囲を確認してから公開を承認する。
4. 確認済みの同一メールによるリンクをSupabase Authに任せ、ユーザーUUIDで戦績・デッキ・権限を照合する。管理者認可には `admin_users.user_id` を使用する。Googleのプロフィールを権限付与の根拠にしない。管理者用テストIDでもGoogle連携前後を照合し、一般利用者での昇格がないことを確かめる。[SupabaseのID連携](https://supabase.com/docs/guides/auth/auth-identity-linking)
5. 本番用実装で有効・無効の双方を検証する。Googleのみのテスト利用者が確認済みメール経由でパスワードを設定し、同じUUIDで再ログインできることを切り戻しの予行で確認する。プライバシーポリシーとGoogle同意画面の内容を照合する。

## 公開手順（承認後）

1. **Google Cloud**。運用者が本番プロジェクトを選び、Google Auth PlatformのBranding・Audience・Data Accessでアプリ名、サポート連絡先、対象ユーザー、ホーム・プライバシーURL、必要な審査の状態を確認する。権限はログイン用の `openid`、メール、基本プロフィール。Webアプリ用本番クライアントの承認済みリダイレクトURIを下表と完全一致させる。テストユーザー限定のまま一般公開しない。[Googleの公開準備](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)・[SupabaseのGoogle設定](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
2. **GitHub・Vercel**。差分と最新mainを照合し、承認を受けてPRを作成する。マージ・Production反映には別の承認を取る。まず公開フラグを無効にしたリリースを配備し、配信SHA、メール登録・再設定・ゲスト動作を確認する。直前の正常なDeployment IDとSHAを記録する。
3. **Supabase**。本番プロジェクト `xbwxapwaadsrtckxewvx` を確認する。AuthenticationのURL ConfigurationでSite URLと既存のメール確認・パスワード再設定の許可先を確認する。ProvidersのGoogleに本番クライアント情報を設定し、承認された切替時間内に有効化する。ボタンが非表示でも、プロバイダーを有効にするとAuth APIから認証開始が可能になる。
4. **Vercel**。承認後に `SUPABASE_GOOGLE_AUTH_ENABLED=true` をProductionにだけ設定し、新しいProduction deploymentに反映する。承認されたテストアカウントで新規登録、同一メールの既存ID、再ログイン、権限、データ分離、取消からの復帰を確認する。監視・問い合わせ対応後に公開完了を記録する。[Vercelの環境変数](https://vercel.com/docs/environment-variables)

| 用途 | 本番の設定値 |
|---|---|
| GoogleからSupabaseに戻るURI | `https://xbwxapwaadsrtckxewvx.supabase.co/auth/v1/callback` |
| SupabaseのSite URL | `https://sv-match-log-web.vercel.app` |
| Supabaseからアプリに戻るURI | `https://sv-match-log-web.vercel.app/auth/confirm` |
| パスワード再設定の既存経路 | `https://sv-match-log-web.vercel.app/auth/confirm?next=/auth/reset-password` |
| プライバシーポリシー | `https://sv-match-log-web.vercel.app/privacy` |

## 認証経路のログ

| 出力元 | PCで確認すること | 本番で確認すること |
|---|---|---|
| Next.js | 開発用の受信ログでは `/auth/confirm` を除外。失敗時のアプリイベントは固定文。通常リクエスト・エラーの記録は継続する。コールバック応答は `no-store`・`no-referrer` | アプリや監視SDKに完全URL・Cookie・ヘッダー・本文を追加記録しない |
| Supabase Auth | 認証イベントは保持。専用コンテナのログを合成フローと実認証の後に値を出さずに検査する | Hosted Authのログ、アクセス権、転送・保持を運用者が確認。アプリ側から基盤の記録を上書きできない |
| Kong | 従来のcombined形式はクエリを含むリクエストを記録した。新規の復元環境はメソッド、クエリを含まないパス、HTTPステータス、所要時間を記録する。旧形式のゲートウェイは認証試験に再使用しない。過去のログ・ボリュームは保全する | Hosted Gatewayの収集項目と外部転送でクエリ・Refererが残るか確認。ローカルKongの設定は本番に伝播しない。上流障害時のNGINXエラーログはアクセスログと別に扱う |
| Vercel | PCにはVercelのエッジログがない | Request/Runtime Logs、Observability、設定済みのLog Drainsを確認する。既存プランで制御できない場合は記録範囲・保持期限・閲覧者と残存リスクを明示し、公開承認を得る |

記録の確認は項目の有無と検出件数だけを共有する。既存ログの削除・外部転送先の変更・鍵のローテーションは別途承認を得る。[Supabaseログの記録項目](https://supabase.com/docs/guides/observability/log-field-reference)・[Vercel Runtime Logs](https://vercel.com/docs/logs/runtime)

## 切り戻し（承認後）

- **導線や画面の不具合**。新規の案内を止め、公開フラグを戻して反映する。必要に応じて直前の正常なVercel deploymentへ戻す。ボタンを隠すだけではAuth APIを停止できない。Vercelを戻してもSupabaseとGoogle Cloudの設定は独立して残る。[Vercel Instant Rollback](https://vercel.com/docs/instant-rollback)
- **Googleだけで登録した利用者**。ボタンが消えるだけでも通常の再ログイン経路を失う。計画停止なら、Google経由で利用可能な間に確認済みメールへの再設定導線を案内する。メール受信、アプリでのパスワード設定、メールでの再ログイン、同じUUID・戦績への到達を確認する。メール配送障害や受信不能者には本人確認を伴う個別対応を用意する。利用者に新しいアカウントを作らせたり、メール一致だけでデータを移したりしない。
- **認証自体を緊急停止する場合**。承認を得てSupabaseのGoogleプロバイダーを無効化する。進行中の認証も失敗し得る。既存のSupabaseセッションは別管理なので、自動失効を前提にしない。秘密値流出の場合は影響範囲・セッション失効の要否を評価し、別途承認を得てGoogle側の鍵をローテーションする。ユーザー・identity・DB・戦績は保持する。
- **復帰判定**。本番の公開Auth設定、配信SHA、ログイン画面、メール確認・再設定、一般・管理者のアクセスを再確認する。Googleを再開する場合も同じ既存UUIDへの復帰を確認する。日時、承認者、値を伏せた設定差分、未回復者への対応を記録する。
