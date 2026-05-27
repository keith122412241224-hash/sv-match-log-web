# SV Match Log Web

Shadowverse: Worlds Beyond向けの戦績管理WebアプリMVPです。ブラウザから試合結果を入力し、勝率、先攻/後攻勝率、デッキ別勝率、対面勝率表を自動集計します。

## 技術構成

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth / PostgreSQL / RLS
- Vercelデプロイ前提
- `html-to-image` による相性表の画像保存

## ローカル起動手順

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local` にはSupabaseプロジェクトの値を設定してください。

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## Supabase設定手順

1. Supabaseで新規プロジェクトを作成します。
2. SQL Editorで `supabase/schema.sql` を実行します。
3. 管理画面と標準デッキ管理を使う場合は、続けて `supabase/admin_archetypes_migration.sql` を実行します。
4. Authentication > Providers > Email を有効にします。
5. Authentication > URL Configuration を設定します。
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/**`
6. Project Settings > API から `Project URL` と `anon public key` を `.env.local` に設定します。

本番ではURLをVercelのドメインに置き換えてください。

## Vercelデプロイ手順

1. GitHubなどにリポジトリをpushします。
2. VercelでNext.jsプロジェクトとしてImportします。
3. Environment Variablesに以下を設定します。
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL`
4. Supabase AuthenticationのRedirect URLsにVercelのURLを追加します。
   - 例: `https://your-app.vercel.app/**`
5. VercelでDeployします。

## 画面

- ホーム: 総試合数、勝利数、勝率、先攻勝率、後攻勝率、最近10戦
- 戦績入力: 使用デッキ、相手デッキ、先攻/後攻、勝敗、対戦日時、メモ
- デッキ管理: 一覧にないデッキの候補申請、管理者向けカスタムデッキ追加・編集
- 分析: 使用デッキ別、相手デッキ別、先攻/後攻別、対面別勝率
- 相性表: 対面勝率表、色分け、参考値、環境指数、画像保存

## 相性表の色分け

- 60%以上: 有利
- 50〜59%: 微有利
- 45〜49%: 五分
- 40〜44%: 微不利
- 39%以下: 不利

4戦以下は参考値として表示します。環境指数は `勝率 - 50` に試合数補正をかけた簡易指標です。

## データベース

SQLは `supabase/schema.sql` にあります。主なテーブルは以下です。

- `profiles`
- `environments`
- `decks`
- `matches`
- `admin_users`
- `deck_archetypes`
- `deck_aliases`
- `user_decks`
- `deck_suggestions`

全テーブルでRLSを有効化し、ログインユーザー自身のデータだけが見えるようにしています。

既存DBを「使用デッキ/相手デッキを分けない」形式へ更新する場合は、Supabase SQL Editorで `supabase/unify_decks_migration.sql` も実行してください。

## 管理画面

`/admin` は `admin_users` に登録されたユーザーだけがアクセスできます。最初の管理者はSupabase SQL Editorで追加してください。

```sql
insert into public.admin_users (user_id)
values ('あなたの auth.users.id');
```

管理画面では以下を操作できます。

- 標準デッキの追加・編集・無効化
- クラス、環境、有効/無効、表示順、メモの管理
- aliasの追加・削除
- ユーザーのデッキ候補申請の確認・採用・却下

標準デッキ管理用のSQLは `supabase/admin_archetypes_migration.sql` です。既存 `decks` と `matches` は残したまま、`matches.my_archetype_id` / `matches.opponent_archetype_id` を追加して、全体統計を標準デッキIDで集計できるようにします。

## 開発メモ

集計ロジックは `src/lib/analytics.ts` に分離しています。UIやページから独立しているため、今後グラフ表示、期間フィルタ、環境別分析を追加しやすい構成です。
