# 分析ブロックのPNG保存

## 分離した作業場所と本番基点

- ブランチ: `feature/analysis-png`
- 作業場所: `build/analysis-png`（独立したGit worktree）
- 基点: `a15e6b0663efe93067ae2b567d668f2a26de7e8f`
- 2026-09-11にGitHub Deployments APIで最新のProduction成功履歴を確認。上記SHAの成功日時は2026-09-10 06:00:25 UTC。リモートmainも同じSHA。
- 元の`master`は`09c1612`で、ランク・Masterグループ・GrandMasterレート帯の未コミット変更が混在していたため、元のファイルを変更せず本番コミットから分離した。
- 今回の差分にDB定義、マイグレーション、ランクUI、ランク条件、集計ロジックの変更はない。元の未コミット・未追跡ファイルは保持した。

## 使い方と仕様

分析画面の各見出し横にある「PNG保存」で、そのブロックを個別保存する。

| 対象 | ファイル名のブロック部分 |
| --- | --- |
| 使用デッキ別サマリー | usage-summary |
| 使用デッキ別の勝率 | deck-winrate |
| 相手デッキ別の勝率 | opponent-winrate |
| 先攻/後攻別の勝率 | turn-order-winrate |
| 対面別勝率 | matchup-winrate |

1枚の場合のファイル名は`analysis-ブロック名-YYYYMMDD-HHmmss.png`。保存日時は利用端末のローカル時刻。
複数枚の場合は同名の`.zip`を1回で保存し、中に`-part-001-of-022.png`など連番付きPNGを収録する。利用時はZIPを展開する。

表示中のDOMを複製して保存するため、現在適用されている期間・デッキ・先後・勝敗・集計モードの結果をそのまま含む。フォーム変更後、まだ「表示」を押していない条件は含まれない。

- タイトル、数値、表、カード内の参考値や直近結果を含む。ボタンとエラー案内は含めない。
- 白背景、通常2倍解像度。カードは現在の画面幅のレイアウトを維持。
- 横スクロール表は保存する複製だけを全幅に広げ、右端まで保存。元の画面幅やスクロール位置は変えない。
- フォントと画像の読み込みを待つ。Next/Imageのクエリ文字列を含めて画像を識別し、クラスアイコンの取り違えを防止。
- 既存の`html-to-image`を動的読み込みして利用。複数枚のZIP作成用に`fflate`を追加し、必要な場合だけ動的読み込みする。PNGは圧縮済みなのでZIP内では再圧縮せず保存する。
- 保存中は連打を防止。失敗時は再試行できる案内を表示し、一時DOMを必ず除去。
- 大きなブロックは高さ1600 CSS pxまたは32項目を目安に、表の行・カードのグリッド行の区切りで分割する。各ページにタイトル、ページ番号、表の列見出しを付け、列幅を固定する。巨大な全体canvasは作らず、ページごとに画像化する。一辺4096px・800万画素以内に解像度を調整する。
- 保存中はページ単位の進捗を表示。全ページの生成完了後にだけZIPを保存するため、途中で失敗しても不完全なZIPはダウンロードされない。

## 変更ファイル

1. `src/app/analysis/page.tsx`: 5ブロックへの共通保存コンポーネント適用。
2. `src/components/analysis/DeckAnalysisCards.tsx`: 分析画面の見出し重複を避ける任意プロパティ追加。他の利用箇所の既定表示は維持。
3. `src/components/analysis/ExportableAnalysisBlock.tsx`: ブロックごとのref、見出し、ボタン、保存状態・エラー。
4. `src/lib/analysis-png.ts`: DOM複製、横幅調整、描画待ち、PNG生成・ダウンロード。
5. `tests/analysis-png.browser.cjs`: 実際の分析画面をローカルのテストデータで確認するブラウザーテスト。
6. `docs/analysis-png-release.md`: この手順書。
7. `package.json`: ZIP作成ライブラリの追加。
8. `package-lock.json`: 追加ライブラリのバージョン固定。

## 動作確認

2026-09-11、WindowsのChromiumで確認。本番用ビルドをローカル起動し、Supabaseはローカルの読み取り専用スタブに接続。本番データや認証情報は使用していない。

- PC幅1440px / スマートフォン幅390pxで5ブロックを保存（10件）。
- デッキと期間のフォームを実際に適用して保存（1件）。
- PNGエンコード失敗を再現し、保存中の無効化・エラー表示・一時DOM除去・再試行成功を確認（1件）。
- データ0件で5ブロックを保存（5件）。
- 計17件でPNG形式、命名、解像度、不透明背景、文字画素、画面との文字内容一致、右端の欠けがないこと、クラスアイコンの区別、元の画面幅・横スクロール位置の維持を確認。
- 保存PNGの日本語とアイコンを目視確認。テストデータで約23～156KB/画像。
- ブラウザー例外0件、DB書き込み0件。
- `npm run lint`、`npm run typecheck`、`npm run build`: 成功。
- 既存の`data-and-pages.test.cjs`と`perspectives.test.cjs`: 15件成功。
- Safari / Firefox / 実機スマートフォンでの確認は未実施。

### 大量データ対応の追加確認（2026-09-11）

本番のPNG機能コミット`3b7332e`を基点に追加修正。上記17件のPNG確認と既存15テストを再実行し成功。

- 576行・高さ31,243pxの対面表を、PC幅・スマートフォン幅の両方で22枚ずつのPNGを収録したZIPとして保存できた。
- 24デッキのサマリーをPC幅で2枚、スマートフォン幅で6枚に分割できた。
- 計4つのZIP・52枚のPNGについて、ZIPの展開、全行・全カードが元の順序で重複なく一度ずつ含まれること、タイトル・列見出し・ページ番号、ページごとのサイズ上限、横方向の欠けがないことを確認。
- 2ページ目の画像エンコード失敗を再現し、不完全なZIPを保存しないこと、一時DOMの除去、再試行での全件出力を確認。
- 先頭・最終ページを保存し目視確認。結果は`build/browser-proof/pagination-results.json`に保存。

テスト用ビルドの再現（専用worktreeで実行。実際の`.env.local`をコピーしない）:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54330'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-key'
npm.cmd run build
node --require ./tests/register.cjs --test tests/data-and-pages.test.cjs tests/perspectives.test.cjs
# PlaywrightとChromiumを用意し、必要ならローカルのインストール先を指定する。
# $env:PLAYWRIGHT_MODULE = 'Playwrightのモジュール絶対パス'
# $env:CHROME_EXECUTABLE = 'Chromiumの実行ファイル絶対パス'
node tests/analysis-png.browser.cjs
```

実際に保存したPNG、画面スクリーンショット、`results.json`は専用worktree内の`build/browser-proof/`に保存（Git対象外）。ビルド時の複数lockfile警告は、依存関係を共有する入れ子worktreeによるもの。

## 本番反映

初版`3b7332e`は2026-09-11 09:46 JSTに本番デプロイ成功を確認済み。大量データ対応もPNG専用ブランチで検証し、以下の手順で本番へ反映する。

1. 反映直前に本番SHAとリモートmainを再確認する。
2. クリーンなmain用worktreeで、`feature/analysis-png`のPNG機能コミットだけを取り込む。mainが基点のままならfast-forward可能。mainが進んでいた場合は今回のコミットだけをcherry-pickし、差分を確認する。
3. PNG保存関連ファイルとZIP用依存の追加だけが今回の変更であることを確認する。ランク変更のある元の`master`をマージ・push・デプロイしない。
4. 通常のmain経由の本番デプロイを行い、認証後の分析画面で保存を確認する。Vercelの既存の本番環境変数で再ビルドする。ローカルのスタブ向け`.next`は本番にアップロードしない。
5. DBマイグレーションや環境変数追加は不要。戻す場合もPNG機能コミットだけをrevertする。
