# SV Match Log Web

Shadowverse: Worlds Beyond 向けの戦績管理Webアプリです。  
戦績を入力すると、勝率、先攻/後攻勝率、デッキ別勝率、対面勝率、相性表に自動で反映されます。

## 技術構成

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase PostgreSQL
- Supabase RLS
- Vercel デプロイ前提
- `html-to-image` による相性表PNG保存

## ローカル起動

```bash
npm install
cp .env.example .env.local
npm run dev
```

Windowsで `npm` が見つからない場合:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
& "C:\Program Files\nodejs\npm.cmd" run dev
```

`.env.local` には Supabase の値を設定します。

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`service_role` key はクライアント側・Vercel環境変数に入れないでください。

## Supabase 新規構築

新しいSupabaseプロジェクトを作る場合は、以下の順でSQL Editorから実行します。

1. `supabase/schema_production.sql`
2. `supabase/seeds/admin_user.example.sql`
3. `supabase/seeds/environments.sql`
4. `supabase/seeds/deck_archetypes.sql`

注意:

- `admin_user.example.sql` と `environments.sql` の `ADMIN_AUTH_USER_ID` は、実際の `auth.users.id` に置き換えてください。
- 管理者ユーザーは先にSupabase Authで新規登録しておく必要があります。
- 標準デッキは管理画面 `/admin` から追加しても構いません。
- `schema_production.sql` は新規構築用です。既存DBには直接流さないでください。

## Supabase 既存DB更新

既に運用中または検証中のDBを更新する場合は、新規構築用SQLではなく `supabase/migrations/` を使います。

実行順:

1. `supabase/migrations/001_admin_archetypes.sql`
2. `supabase/migrations/002_admin_environments.sql`
3. `supabase/migrations/003_guest_public_read.sql`
4. `supabase/seeds/admin_user.example.sql`
5. `supabase/seeds/environments.sql`
6. `supabase/seeds/deck_archetypes.sql`
7. `supabase/migrations/004_backfill_match_archetype_ids.sql`

注意:

- `DROP TABLE`, `TRUNCATE`, ユーザーデータ削除は含めていません。
- `drop policy if exists` はRLSポリシー差し替え目的だけで使用しています。
- `004_backfill_match_archetype_ids.sql` は標準デッキ登録後に実行してください。
- 既存の `matches` は削除されません。標準デッキIDが未設定の戦績だけ補完します。

## Supabase Auth設定

Authentication > Providers:

- Email provider を有効化
- メールアドレス + パスワードログインを利用
- Magic LinkログインはアプリUIでは使用しません

Authentication > URL Configuration:

ローカル:

- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/**`

本番:

- Site URL: `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/**`

メールテンプレートを日本語化する場合は、Authentication > Emails から以下を編集します。

- Confirm signup
- Reset password
- Change email address

テンプレート内の `{{ .ConfirmationURL }}` などの変数は削除しないでください。

## Vercel デプロイ

1. GitHubなどへリポジトリをpush
2. VercelでNext.jsプロジェクトとしてImport
3. Environment Variablesに以下を設定
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL`
   - `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`（Google Search Console登録時のみ）
4. Supabase AuthenticationのSite URL / Redirect URLsにVercel URLを設定
5. Deploy

## Google Search Console登録

Google検索に登録する場合は、Search ConsoleでURLプレフィックスを使います。

1. Google Search Consoleを開く
2. プロパティタイプで「URLプレフィックス」を選ぶ
3. URLに本番URLを入力

```text
https://sv-match-log-web.vercel.app/
```

4. 所有権の確認方法で「HTMLタグ」を選ぶ
5. 表示されたmetaタグから `content` の値だけをコピーする

例:

```html
<meta name="google-site-verification" content="abc123..." />
```

この場合、コピーする値は `abc123...` です。

6. VercelのEnvironment Variablesに追加

```env
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=abc123...
```

7. Vercelで再デプロイ
8. Search Consoleで「確認」を押す
9. Search Consoleの「サイトマップ」に以下を送信

```text
sitemap.xml
```

10. 「URL検査」でトップページを検査し、「インデックス登録をリクエスト」を押す

補足:

- `/robots.txt` は公開ページを許可し、`/admin`, `/matches`, `/profile`, `/settings`, `/api` などはクロール対象外にしています。
- `/sitemap.xml` には公開ページだけを入れています。
- ログイン後の個人データページはsitemapに入れません。

## 主要画面

- `/login`: ログイン、新規登録、パスワード再設定
- `/guest`: 未ログイン体験。入力データはリロードで消えます
- `/`: ホーム
- `/matches`: 戦績入力
- `/decks`: 標準デッキ一覧、デッキ候補申請
- `/analysis`: 分析
- `/matrix`: 相性表
- `/admin`: 管理画面

## DBテーブル

- `profiles`: ユーザープロフィール
- `admin_users`: 管理者判定
- `environments`: 管理者が作る公開環境マスター
- `deck_archetypes`: 管理者が作る公開標準デッキマスター
- `deck_aliases`: 互換用。現在UIでは未使用
- `user_decks`: 将来のマイデッキ拡張用
- `deck_suggestions`: ユーザーからのデッキ候補申請
- `decks`: 既存互換用のユーザー別デッキ
- `matches`: ユーザー別戦績

## RLS方針

- `matches`, `decks`, `user_decks`, `profiles`: 本人のみアクセス
- `deck_suggestions`: 本人と管理者のみ参照、本人が申請、管理者が更新
- `deck_archetypes`, `environments`: ゲスト含め公開読み取り可能
- `deck_archetypes`, `environments`: 作成・更新・削除は管理者のみ
- `admin_users`: 本人または管理者のみ参照

## 本番公開前チェック

- Supabase SQLを順番通り実行したか
- 管理者ユーザーを `admin_users` に登録したか
- 環境が1件以上あるか
- 標準デッキが登録されているか
- 戦績入力で環境が必須になっているか
- 入力した戦績が分析・相性表に反映されるか
- ゲストモードで実デッキ/環境が表示されるか
- RLSで他ユーザーの `matches` が見えないか
- Authメールテンプレートが日本語化されているか
- Vercel環境変数とSupabase Redirect URLsが本番URLになっているか
