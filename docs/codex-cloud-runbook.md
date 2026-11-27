# Codex Cloud 開発・本番反映・復旧手順

スマートフォンからは「この手順書に従って最新 main を確認し、〈依頼内容〉をローカルで実施。GitHub・本番への反映は承認待ち」と依頼する。普段は §1–3 で始め、変更に応じて §4 の検証を選ぶ。Windows＋VS Code で引き継ぐ場合も同じ GitHub ブランチと SHA を照合する。

**確認範囲**　2026-11-27 の C-02 では、既存のクラウド環境のチェックアウトとコンテナを再利用し、最新 main に更新して開発環境を手動で起動した。ローカル API の応答、ゲスト・ログイン画面の表示、型チェックを確認した。この実行環境と公開済みの専用環境 `sv-match-log-web` revision 3 との対応は未確認。テスト全体の実績は §4 の PR 記録に基づく。GitHub・本番・復旧の操作は今後の承認後に使う手順であり、C-07 では文書の整合性を検証した。

## 1. 最新 main から作業を始める

Cloud の Bash で以下を一括実行する。対象は `keith122412241224-hash/sv-match-log-web` の作業開始用ブランチ `work`。既存の機能ブランチで再開するときは、その差分と upstream を確認してから続行する。

```bash
(
  set -eu
  cd /workspace/sv-match-log-web
  git rev-parse --show-toplevel
  git status --short --branch --untracked-files=all
  git rev-parse HEAD
  test "$(git branch --show-current)" = work
  origin=$(git remote get-url origin)
  case "$origin" in
    https://github.com/keith122412241224-hash/sv-match-log-web.git|https://github.com/keith122412241224-hash/sv-match-log-web|git@github.com:keith122412241224-hash/sv-match-log-web.git) ;;
    *) echo '対象 origin を確認して停止' >&2; exit 1 ;;
  esac
  changes=$(git status --porcelain --untracked-files=all)
  test -z "$changes"
  git fetch origin main
  test "$(git rev-parse FETCH_HEAD)" = "$(git rev-parse origin/main)"
  git rev-list --left-right --count HEAD...origin/main
  git merge-base --is-ancestor HEAD origin/main
  changes=$(git status --porcelain --untracked-files=all)
  test -z "$changes"
  git merge --ff-only origin/main
  test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
  git rev-parse HEAD
)
```

終了コード 0 と最後の SHA を確認してから編集する。固有コミット数は左列で、0 の場合だけ fast-forward できる。未コミット・未追跡の変更、固有コミット、別ブランチ、fetch 失敗、参照不一致のいずれかがあれば、現状と差分を報告して止める。変更の破棄、強制リセット、force push は行わない。C-02 では `origin/main` が最新でも `work` は4コミット古く、更新後に両方が `3610bcfb35e9d4e23faa8d4bd0a326c691242481` で一致した。この値は当時の記録で、次回は fetch した値を使う。

## Linux / Codex Cloud で開発・テスト環境を復元する（E-03）

§1 で対象リポジトリ・最新 main・作業ブランチを確認する。以下はリポジトリ直下で実行する。Linux、Python 3.11以降、Git の履歴、Node.js と npm、ローカルの Docker ソケット `/var/run/docker.sock` を使用する。確認環境は Node.js 24・npm 11・Docker 29。履歴比較テストには過去のコミットが必要なので shallow clone は使用しない。既存の作業や管理外の `node_modules` がある場合はそのディレクトリを保ち、空いている別パスに通常の clone を作る。

### 開発サーバー

```bash
python3 scripts/cloud_local.py check
python3 scripts/cloud_local.py serve
```

`check` はHEAD、ツール、ローカルDocker接続、空き容量を確認する。`prepare` は依存関係とCLIまで、`up` はDB起動・照合まで、`serve` はこれらを含めてNext.jsをフォアグラウンドで起動する。初回はアプリの `package-lock.json` で `npm ci` を実行する。CLIは [.supabase-cli-version](../.supabase-cli-version) と [開発ツール専用ロック](../scripts/cloud-tools/package-lock.json) を照合して専用ディレクトリに復元する。既存の npm キャッシュと Docker イメージを再利用できる。キャッシュミス時はレジストリへの接続が必要。

E-03の開発用ポートは Next.js **3100**、API **55321**、DB **55322**。いずれも `127.0.0.1`。従来の手動手順 (§2–3) の開発DBとは別プロジェクト・別ボリュームになる。起動時にマイグレーションの版と順序、Auth、REST、Storage、公開キー付きRESTの0行照会を確認する。ブラウザーでは `http://127.0.0.1:3100/guest` と `/login` を開く。開発用公開キーはNext.jsのプロセスに渡す。手動でキー一覧を取得したり dotenv をコピーしたりする必要はない。[起動スクリプト](../scripts/cloud_local.py)

Next.jsを **Ctrl+C** で終了し、`python3 scripts/cloud_local.py stop` で当該スタックを停止する。通常の停止では記録済みのコンテナIDを順に停止し、コンテナ・ネットワーク・開発ボリュームを保持する。再起動は同じコンテナIDで行う。同じチェックアウトで `up` または `serve` を再実行する。`build/cloud-restore/` の所有記録と生成設定は、そのチェックアウトのローカル資源と対になっている。転記・共有せず、ボリュームを継続利用中は削除しない。

### 標準・統合テスト

```bash
python3 scripts/cloud_tests.py prepare
python3 scripts/cloud_tests.py standard
python3 scripts/cloud_tests.py integration
```

Next.jsや開発DBを起動する必要はない。各実行が新しい履歴付きチェックアウトに現在の追跡差分と未追跡の `src/`、`tests/`、`supabase/migrations/` の入力を反映する。復元済み依存を共有し、以前の `.next`、`build`、セッション、試験DBを引き継がない。標準テストは `npm test`。統合テストは [既存ランナー](../tests/run-integration.cjs) のリストと追加のメモリ内試験・ネイティブ試験を `*.integration.cjs` の全件と照合する。追加ファイルの分類が決まるまでは停止する。[試験ランナー](../scripts/cloud_tests.py)

| 試験 | DB / APIポート | 初期マイグレーション |
|---|---|---|
| メモリ内のSQL・アプリ結合 | PGlite、ポートなし | 各試験自身のfixture |
| environment-schedule | 56322 / 56321 | 現行の全件 |
| environment-dashboard | 56322 / 56321 | `20260930040027` まで |
| multi-rank | 57322 / 57321 | `20260930071612` まで |
| environment-dashboard-v3 | 58322 / 58321 | `20261001080455` まで |

`PGLITE_MODULE` と `PG_MODULE` はスクリプトが専用ロックから復元した 0.5.8 と 8.16.3 を指定する。ネイティブ4試験は順に、それぞれ新規のローカルプロジェクトで実行する。API用の合成資格情報はそのスタックのために生成し、試験が要求する `e1-evidence/start.log`、`e12/keys.json`、`ux-evidence/keys.json` の形式を非公開の一時ディレクトリに用意する。終了時に身元を確認できた専用コンテナ・ネットワークと一時チェックアウトを片付ける。Dockerの名前付きボリュームは毎回保持し、その名前を出力する。試験ごとにDBとStorageの2個を使用するため、繰り返し実行すると容量を消費する。件数・終了コード・所要秒数は `build/cloud-restore/{standard,integration}-result.json` に保存する。型チェックは `npm run typecheck -- --incremental false`。

中断後は下記の所有確認と復旧手順に従う。原因を解消した後、一つのネイティブ試験だけ再検証するには、例えば `python3 scripts/cloud_tests.py integration --native-only multi-rank` を使う。未実行・再検証対象が複数あれば名前を続けて指定でき、結果は指定名を連結した別の `*-result.json` に残る。Docker全体のpruneや開発ボリュームの削除は行わない。

#### 所有確認と中断後の復旧

- Linuxのsubreaper・pidfd、拡張属性を保存できる作業ファイルシステム、Node.js 24のファイル別テスト結果、ローカルDockerを使用する。標準テストを含む試験コマンドは同一Dockerデーモン上の `svml-e03-tests-reservation` を予約する。開発用は別の `svml-e03-dev-reservation` を使用する。予約には `kong:2.8.1` の未起動コンテナを使う。
- 各スタックの作成前に乱数のプロジェクトIDと世代を発行する。所有記録にはデーモン、作業ディレクトリの識別情報、コンテナ・ネットワークの実体ID、ボリュームの作成日時・ドライバー・元のマウント先コンテナIDを保存する。停止時は現物・接続コンテナ・ボリューム利用者を照合する。名前付きボリュームは名前による削除しか指定できないため自動削除しない。容量を回収する場合は別途所有者の承認を得る。
- 操作端末や親プロセスを失った場合、独立した監視プロセスが実行ワーカーと孤児になった子孫の終了まで予約を維持する。端末だけが終了した場合はワーカーが継続し得る。別のチェックアウトからの実行も同じ予約で止まる。予約ファイルやPIDによる期限切れ判定は使用しない。[プロセス監視と予約](../scripts/cloud_guard.py)
- 中断後は元のチェックアウトで `docker ps -a --filter name=svml-e03-tests-reservation --format '{{.ID}} {{.Names}} {{.Status}}'` を確認する。予約が解放されてから `python3 scripts/cloud_tests.py cleanup` を実行する。cleanupは再度同じ予約を取得する。監視プロセス自体の強制終了、残存プロセスの状態不明、作成・片付けの途中での資源不一致、旧形式・欠落・破損した所有記録、世代の不一致では資源と記録を保持する。予約を手で消して再開せず、所有者がタスクの終了と資源の実体を確認できるまで保留する。古い環境から自動移行する手順はない。
- 安全性の回帰テストは `python3 -B tests/test_cloud_safety.py`。所有判定には模擬資源、プロセス監視には使い捨ての予約と合成子プロセスを使用する。標準・統合の合格には当該チェックアウトの対象ファイルすべてに個別結果が必要。終了コード0、各ファイルの1件以上の実行と全件合格、全体件数の一致を照合する。単独スクリプト形式の既存7ファイルは固有の完了出力とNodeのファイル成功イベントを両方照合する。空ファイル、スキップ・失敗・中断・TODO、結果の欠落や重複は不合格。[テスト結果の出力](../scripts/cloud-test-reporter.cjs)

#### 残存ボリュームの容量と手動整理

ネイティブ4試験を一巡すると、DBとStorageで計8個の名前付きボリュームが残る。次の読み取りでDockerの使用量とチェックアウト側の空き容量・inodeを確認する。

```bash
docker --host unix:///var/run/docker.sock system df -v
df -h /workspace
df -i /workspace
```

手動整理を検討するときは、各候補について次の条件をすべて確認する。

1. 完了した試験の記録から、元のDockerデーモン、プロジェクト、ボリューム名と作成日時を現物に結び付けられる。試験終了時にスタックの所有記録は片付けられるため、後日整理する予定なら、試験中に上記の識別情報だけを控える。合成キーを含む `owner.json` 全体を転記しない。
2. 元のタスクと同じデーモンを共有する他タスクの終了・利用状況を確認し、再起動や復旧にもそのデータを使わないことを所有者が確認する。予約の排他は同じデーモン・同じ用途のE-03コマンドに効く。手動Docker操作や別ツールによる同時利用は所有者間で確認する。
3. 下記の `volume` に照合済みの名前を設定し、作成日時とドライバーが記録どおりで、停止中を含めて参照コンテナが0件であることを確認する。整理は個々の対象について所有者の承認と他タスクが操作しない時間を確保し、直前にも照合する。作成記録がない、世代や利用状況が不明、予約が残っている場合は保持する。`RECLAIMABLE` の表示や名前の接頭辞だけで判断しない。

```bash
: "${volume:?照合対象のボリューム名を設定}"
docker --host unix:///var/run/docker.sock info --format '{{.ID}}'
docker --host unix:///var/run/docker.sock volume inspect --format '{{.Name}} {{.CreatedAt}} {{.Driver}}' "$volume"
docker --host unix:///var/run/docker.sock ps -a --no-trunc --filter "volume=$volume" --format '{{.ID}} {{.Names}} {{.Status}}'
```

**所有判定修正前の隔離復元の実績（2026-11-27、main `f82468d`）**　パッケージキャッシュとDockerイメージを利用し、空のチェックアウトで開発スタックを初回約3分で起動した。マイグレーション31件、3 API、公開キー付き0行照会、ゲスト・ログインのHTTP 200とHTML、型チェックを確認。標準618件、統合36ファイル・81件（PGlite 76件、ネイティブ5件）が合格し、失敗・スキップは0件。56321番ポートの再利用判定で一度準備を停止し、判定修正後に未実行分を再開した。初回の依存復元開始から最終試験まで約23分で、検証時間には修正・再開を含む。終了時はE-03のDocker資源が0件になり、開始時の5コンテナ・2ボリュームを保持した。

**所有判定・排他・結果判定の修正後（2026-11-27、基準 `f82468d` と未コミット差分）**　同一クラウド環境の隔離チェックアウトで安全性テスト19件が合格。開発DBは停止・再起動を経て同じコンテナとボリュームを使用し、起動時・再起動時とも履歴31件とAPI実応答が一致した。最終版で標準116ファイル・618件、統合36ファイル・81件が合格。統合は32ファイルのPGliteと4ファイルのネイティブ試験を一つのコマンドで連続実行し、両スイートの失敗・スキップ・中断・TODOは各0件。開始前からある5コンテナ・2ボリュームを保持した。現行の片付けでは検証で新設した名前付きボリュームも保持する。

### 停止条件と確認範囲

- Dockerソケットに接続できない、ポート使用中、チェックアウトの空き2 GiB未満、Docker領域の空き4 GiB未満、ENOSPC、パッケージ復元失敗、所有情報の不一致時は原因を確認する。空き容量の値はこのスクリプトの開始時の下限で、テスト中の使用量分も必要。
- dotenv（`.env.example` 以外）、リンク済みプロジェクト、継承した非ローカルDB/API宛先を検出したら停止する。開発DBの履歴・API・Dockerのloopback割当を確認できなければNext.jsやネイティブ試験へ進まない。設定やマイグレーションの異なる版では新しいチェックアウトを使う。
- E-03の復元対象はLinuxの独立チェックアウト。新規クラウドタスクへの自動割当、専用環境の公開revision、空のパッケージ・イメージキャッシュ、Windowsでの実行は別検証。
- 開始時は「運用手順書E-03に従い最新mainを確認し、ローカル開発を開始。テストは変更範囲に応じて実行してください」と依頼できる。

## 2. ツールとローカル Supabase を確認する

以降の Bash はリポジトリ直下で実行する。C-02 の実測は Node.js 24.22.3、npm 11.19.1、Supabase CLI 2.118.0、Docker Server 29.9.2。CLI の期待版は [.supabase-cli-version](../.supabase-cli-version) と照合する。

```bash
cd /workspace/sv-match-log-web
node --version
npm --version
test -x node_modules/.bin/next && test -x node_modules/.bin/tsc
export SUPABASE_HOME=/workspace/.svml-tools/cli-state
export SUPABASE_TELEMETRY_DISABLED=1
cli="/workspace/.svml-tools/supabase-$(cat .supabase-cli-version)/node_modules/.bin/supabase"
"$cli" --version
docker context show
docker version --format '{{.Server.Version}}'
docker system df
df -h /workspace
docker ps -a --format '{{.Names}} {{.Status}}'
docker volume ls --format '{{.Name}}'
```

既存の `node_modules`、専用 CLI、`/workspace/.svml-tools/npm-cache` を優先する。依存差分や欠落がある場合だけ、現在の lockfile に対応する隔離チェックアウトで `npm ci --offline --cache /workspace/.svml-tools/npm-cache` を試せる。これは再構築用の例で C-02 では未実行。`npm ci` は対象の既存 `node_modules` を置き換えるため、復元済みツリーの日常起動には不要。Windows の一般セットアップは [README](../README.md) を参照する。

[ローカル設定](../supabase/config.toml) の project ID は確認時点で `sv-match-log-baseline-step3`、API は `127.0.0.1:54321`、DB は `127.0.0.1:54322`。同名コンテナ・ボリュームの所属を確認する。別プロジェクトがポートを使用中なら起動手順を中断し、所有者を確認する。本番にリンクせず、以降の API は loopback、CLI の DB 操作は `--local` を明示する。

```bash
(
  set -eu
  "$cli" start -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor \
    --ignore-health-check >/dev/null 2>&1
  "$cli" migration list --local
  for route in auth/v1/health rest/v1/ storage/v1/status; do
    code=$(curl --noproxy '*' --max-time 5 -sS -o /dev/null -w '%{http_code}' \
      "http://127.0.0.1:54321/$route")
    printf '%s %s\n' "$route" "$code"
    test "$code" = 200
  done
)
```

対象は DB、Kong、Auth、PostgREST、Storage の5サービス。開始時のキー一覧を出力せず、終了コードと実応答で判定する。マイグレーション一覧の両列を [現行 SQL](../supabase/migrations) のファイル名先頭の版と照合し、片側のみ・順序差があれば DB 依存の作業を止める。C-02 は31件一致、末尾は `20261126105932`。Auth はバージョン付き JSON、REST は OpenAPI、Storage の status は空本文でも 200。REST をもう一段確認するには `GET /rest/v1/environments?select=id&limit=0` の 200 と空配列を使える。データ行を読み出す必要はない。

## 3. Next.js と画面を確認する

Cloud の開発プロセスにローカル URL を明示する。本番の環境ファイルをコピーせず、Vercel の本番変数も取り込まない。利用できる loopback 以外の DB 接続設定や出所不明の環境ファイルがある場合は、開発用の隔離環境に切り替える。

```bash
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
NEXT_PUBLIC_SUPABASE_ANON_KEY=local-ui-placeholder NEXT_TELEMETRY_DISABLED=1 \
  npm run dev -- --hostname 127.0.0.1 --port 3000
```

Cloud 内のブラウザーで `http://127.0.0.1:3000/guest` の「ゲストモード」と「戦績入力」タブ、`/login` のメール・パスワード欄とボタンを確認する。スマートフォン自身の localhost は別の端末を指す。C-02 では両画面が 200、型チェック成功。上記ダミー値で REST 認証は 401。カタログが空のときは準備待ち画面が出るため、画面が開いても DB 読み取り・ログイン・戦績保存の成功とは判定できない。

**DB と連動する開発**では、同じローカルプロジェクト専用の公開クライアントキー（anon または対応する publishable key）を、開発プロセスの `NEXT_PUBLIC_SUPABASE_ANON_KEY` に非表示で供給する。設定元と URL が同じローカル環境を指すことを確認し、上のダミー値指定を外してサーバーを再起動する。公開変数はブラウザーに配信される。service role、秘密鍵、本番用キーを入れず、値をチャット・ログ・Git に残さない。ログイン後は専用の合成アカウントで別途検証する。

次はローカル専用の公開キーがプロセス環境に設定済みの場合の起動例。開発者が管理する既存の設定を使い、値の表示やキー一覧の取得は不要。C-02 で実行したのは上のダミー値による起動まで。

```bash
(
  set -eu
  test "${NEXT_PUBLIC_SUPABASE_URL:-}" = http://127.0.0.1:54321
  test -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"
  test "$NEXT_PUBLIC_SUPABASE_ANON_KEY" != local-ui-placeholder
  NEXT_TELEMETRY_DISABLED=1 npm run dev -- --hostname 127.0.0.1 --port 3000
)
```

## 4. 変更に合わせてテストを選ぶ

| 変更範囲 | Linux での検証 |
|---|---|
| 文書のみ | パス・コマンド・現行仕様を照合。`git diff --check` と `git status --short`。新規文書の空白も別途確認する |
| UI・TypeScript | `npm run typecheck -- --incremental false`、`npm run lint`、対象画面を確認。例としてランク絞り込みなら `node --require ./tests/register.cjs --test tests/analysis-rank.test.cjs` |
| 共通ロジック・リリース候補 | Cloudでの標準一式は `python3 scripts/cloud_tests.py standard`（内部は `npm test`）。手動で `npm test` を使う場合も、OBS試験のヘルパーが読み込むPGliteを準備して `PGLITE_MODULE` を指定する。ビルドに影響する変更ではローカル開発用の環境変数で `npm run build`。開発サーバーと同一の `.next` に同時に書き込まない |
| SQL・RPC・権限 | PGlite の対象テストで SQL と合成 fixture を検証。実 Auth・REST、ネイティブ型、現行マイグレーションとの結合は、対象テスト用の隔離 PostgreSQL／Supabase で追加検証する |

PR #1 は標準 **618/618**、統合 **81/81（36ファイル）**、失敗・スキップ0。型チェックと本番用ビルド成功、Lint エラー0・既存警告2。合成データのみの当時の実績で、将来の合格件数は対象 SHA のテストから判断する。`npm test` の対象は `*.test.cjs`。統合は別の入口を持つ。[PR #1 の検証記録](https://github.com/keith122412241224-hash/sv-match-log-web/pull/1)・[npm スクリプト](../package.json)・[検証方針](development-verification-policy.md)

### Linux の統合テストと補助ファイル

1. リポジトリ直下で `git ls-files 'tests/*.integration.cjs'` を実行し、対象ファイルとそこで読み込む helper を確認する。履歴検査は過去の Git オブジェクトと [theme-source.cjs](../tests/theme-source.cjs)・[レビュー済みパッチ](../tests/fixtures/theme-source.patch) を使う。浅い取得や補助ファイル欠落をテスト失敗と混同しない。
2. キャッシュ済みの `@electric-sql/pglite` と `pg` を優先し、以下の2変数に各パッケージの絶対パスを設定する。なければ、テストを必要とする場合だけ、リポジトリ外に一時依存を準備する。次の Linux の例では、検証実績のある PGlite 0.5.8 と pg 8.16.3 を指定する。キャッシュを使う場合も実際に使用した版を記録する。[PGlite の既存記録](phase2c-verification.md)

```bash
qa_tools=$(mktemp -d)
npm install --prefix "$qa_tools" --no-save --package-lock=false --prefer-offline \
  --cache /workspace/.svml-tools/npm-cache @electric-sql/pglite@0.5.8 pg@8.16.3
export PGLITE_MODULE="$qa_tools/node_modules/@electric-sql/pglite"
export PG_MODULE="$qa_tools/node_modules/pg"
node -e 'for (const k of ["PGLITE_MODULE","PG_MODULE"]) console.log(k, require.resolve(process.env[k]))'
node --require ./tests/register.cjs --test tests/period-report-rpc.integration.cjs
```

3. この例の [期間レポート試験](../tests/period-report-rpc.integration.cjs) は PGlite と合成データを使う。`PG_MODULE` はネイティブ DB に接続する Node クライアントの場所で、接続先の指定には使えない。ネイティブ試験ではソースが要求する空の使い捨て DB・ポート・マイグレーション・合成 fixture を先に準備する。準備済みなら例として `node --test tests/environment-schedule.integration.cjs`。この試験は両モジュールを使う。[現行テスト](../tests/environment-schedule.integration.cjs)・[DB セットアップ helper](../tests/match-mutations-db.cjs)
4. 日常開発の DB は 54322。一方、[旧手順](environment-input-schedule.md) に記載の 54322 と異なり、現行のスケジュール試験は **56322** で履歴一致と戦績0件を要求する。他にも専用スタックがある。dashboard は 56321/56322 と `build/e1-evidence/start.log`、multi-rank は 57321/57322 と `build/e12/keys.json`、dashboard v3 は 58321/58322 と `build/ux-evidence/keys.json` を参照する。これらはテスト固有のローカル生成物で Git 管理外。ログ・キー・セッションを共有したり、他環境のものを使い回したりしない。[dashboard](../tests/environment-dashboard.integration.cjs)・[multi-rank](../tests/multi-rank.integration.cjs)・[dashboard v3](../tests/environment-dashboard-v3.integration.cjs)
5. Linux 用の別添手順・補助ファイルを引き継いだ場合は、対象 SHA、出所、スクリプト中の OS・ポート・入出力先を照合する。C-02確認時点ではLinux向けの起動手順が分散していた。現行の復元手順は上のE-03を使う。足りない試験はファイル名・不足条件を記録する。日常 DB のリセットや本番接続で穴埋めしない。Windows 側では README の `npm.cmd` を利用できる。一部の過去のブラウザー試験は Windows 用 `.exe` を直接参照するため、Linux の実行結果と区別する。[該当するブラウザー試験](../tests/period-report-real-browser.cjs)

## 5. GitHub に反映する（承認後）

1. §1 の更新後、作業開始時に `git switch -c feat/short-topic` などで依頼専用のブランチを作る。引き継ぎ時は既存の対象ブランチ・HEAD を確認する。
2. `git status --short`、`git diff`、`git diff --check` で範囲をレビュー。コミットの承認後、意図したパスだけを `git add -- <対象パス>` で指定し、`git diff --cached` と `git diff --cached --check` を確認する。秘密情報・生成物・利用者データを含めない。
3. 承認範囲内でコミットし、現在のブランチ名が専用ブランチであることを再確認する。同名ブランチに `git push -u origin feat/short-topic`。例のブランチ名は実名に置き換える。**main への直接 push は禁止**。
4. GitHub の **Create draft pull request** で base を `main`、compare を対象ブランチにする。差分、試験と残課題、DB 変更の有無、戻し方を書く。PR 作成までの承認と、本番へ反映する承認を分ける。

## 6. 本番に反映する（この変更では未実施）

- 運用前提は Vercel Hobby、Ignored Build Step は **Only build production**。PR・作業ブランチの Preview ビルドを省き、既存契約のビルド枠を本番に使う。PR #1 にも Skipped Deployment の記録がある。PR の検証結果はローカルで残し、Preview のスキップをテスト成功には数えない。
- 最終差分、最新 base と PR の head SHA、試験結果、対象ドメイン、直前の正常な Production deployment・SHA を確認する。DB や権限変更がある場合は、互換性、バックアップ・復旧点、適用順、停止条件を別途レビューし、対象を指定して承認を取る。[マイグレーション運用](migration-baseline.md)
- **本番反映の明示承認後**に Draft を Ready for review にし、レビューを完了して GitHub で main にマージする。マージ後の main の完全 SHA を記録する。通常は Git 連携で Vercel が Production を自動デプロイする。重複する手動デプロイを追加しない。
- Vercel の `sv-match-log-web` → Deployments で、環境 **Production**、状態 **READY**、Source の SHA がマージ後 main と一致すること、Domains で **sv-match-log-web.vercel.app** がその deployment に割り当てられていることを照合する。最後に本番ドメインのログイン画面など必要最小限の読み取りで表示を確認し、確認時刻・SHA・deployment を記録する。実利用者の戦績や認証情報を取得せず、本番に試験データを書き込まない。

## 7. 障害と復旧

| 症状 | 確認と復旧 |
|---|---|
| Production ビルド失敗・SHA 不一致 | 対象 deployment、最初の失敗工程、現在のドメイン割当を確認する。直前正常版が配信中なら維持し、修正ブランチでローカル再現して PR に戻す。ログから秘密値を転記しない |
| 公開後に重大な回帰 | 影響と復旧先を報告し、本番操作の承認後に **Instant Rollback** で利用可能な直前正常版へ切り替える。Hobby の画面で選択可能な対象と DB 互換性を確認する。配信中の deployment・ドメイン・画面を再照合する |
| 不具合のある変更が main に残る | **GitHub Revert** で対象 PR の打ち消し PR を作成し、レビュー・承認後にマージする。Instant Rollback はドメインの配信先を戻し、revert はソース履歴を修正する。どちらも DB の変更は戻さない |
| Instant Rollback 後に修正版が READY でも公開されない | ロールバック後は本番ドメインの自動割り当てが無効になる。承認済みの修正版の SHA と検証結果を確認し、対象 deployment を明示的に **Promote**。本番ドメインと自動割り当ての復帰を確認する。[既存の復旧手順](environment-trends-release-runbook.md)・[Vercel Instant Rollback](https://vercel.com/docs/instant-rollback) |
| Docker が ENOSPC | 起動・再試行を止め、`docker system df`、`df -h /workspace`、`df -i /workspace` を確認。稼働中なら DB コンテナ内のデータ領域も `docker exec supabase_db_sv-match-log-baseline-step3 df -h /var/lib/postgresql/data` で確認。使用量と対象を報告し、既存 DB・コンテナ・ボリュームを無断で削除・prune しない |
| Docker に接続できない | `id`、`docker context show`、`stat -Lc '%A %U:%G %n' /var/run/docker.sock /run/codex-docker/docker.sock` を確認。C-02 は一般ユーザー agent、グループ agent、0660。ローカルソケットを明示して Server の応答を調べる。権限変更やデーモン再起動を行わず、接続先とエラーを報告する |
| Auth・Storage が unhealthy | C-02 ではコンテナ内の probe が接続拒否でも Kong 経由の両 API は 200。§2 の API を再確認し、表示と実応答を別々に記録する。非200・タイムアウトなら未復旧として対象サービスを調べる |

既存プロジェクトの初回登録手順は [README](../README.md)、使い捨て DB の初期化・復旧は [migration-baseline.md](migration-baseline.md) に従う。日常起動で既存 DB を reset しない。機能固有の切り戻し先がある場合は、その機能のリリース資料で互換条件を確認する。

## 8. 費用・権限と未解決事項

既存契約の範囲で運用する。追加課金・自動購入・プラン変更、本番用秘密鍵のクラウド開発環境への無断登録、利用者の生データ取得は禁止。本番反映・DB 変更・権限変更には事前承認が必要。日常開発の合成データは隔離ローカル環境で扱う。管理者向けの総合環境評価は [AGENTS.md](../AGENTS.md) の専用手順と承認条件に従う。

| 未解決事項 | 次に確認すること |
|---|---|
| 起動用スキルの自動配布・公開 revision 3 との対応・完全自動復元 | 独立した新規タスクでスキルの有無、公開版との対応、起動直後の HEAD・ツール・ボリュームを記録。C-02 は同一環境の手動起動まで |
| ログイン後の主要機能 | ローカル専用公開キー・合成アカウント・合成カタログでログイン、入力、分析を検証 |
| 統合環境のタスク間再現性 | E-03のスクリプトを、独立した新規クラウドタスクとキャッシュなしの環境で別途検証 |
| Windows 固有の依存関係 | VS Code で該当するブラウザー実行ファイル、パス、PowerShell・文字コードの前提を個別に確認 |
