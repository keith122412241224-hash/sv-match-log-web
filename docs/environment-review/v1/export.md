# 総合環境評価の分析用JSONと実測評価

管理者画面からダウンロードするJSONは、保存済みの実測スナップショット `snapshot` と、同一環境の比較用公開評価 `previousEvaluation` を持つ。初回など比較対象がないときは `null`。ChatGPTにはこのファイルを分析材料として渡し、結果は入力仕様に沿った別のJSONで返す。

## 対象範囲と時刻

集計RPC `get_environment_review_source_v1` は管理者セッションで1回のSQL文のスナップショットを取得する。権限確認に加えて既存の戦績・マスタの読み取りポリシーが適用される。環境は `matches.environment_id` で限定する。集計終了が設定済みで経過していれば `dashboard_end_at` の時刻、それ以外は現在時刻を30分単位で切り下げる。環境の開始は既存推移分析と同じく `start_date` の日本時間0時、未設定なら `created_at`。直近72時間と168時間の開始をそれぞれ環境開始まで繰り上げる。開始を含み、終了を含まない。環境開始が集計終了より未来なら作成を受け付けない。

| snapshotの項目 | 意味 |
|---|---|
| schemaVersion / ruleVersion / confidenceRuleVersion | 出力構造の版 `1`、実測ルール `environment-review-v1`、信頼度ルール `review-confidence-v1` |
| snapshotId / environmentId / environmentName | 保存済みスナップショットUUID、対象環境UUID、表示名 |
| asOf / periodStart / shortPeriodStart | タイムゾーン付きISO日時。共通の集計終了、7日開始、3日開始 |
| ranks | 既存ランク選択の17区分すべて。登録者の対戦時点のランク。未登録は `unranked` |
| matchCount / shortMatchCount | 全期間、短期間の戦績登録件数。双方が同じ実戦を別々に登録した場合も既存と同じ登録単位 |
| contributors | 全期間の異なる登録者数 |
| decks / pairs | 以下のデッキ別・対面別の確定値 |

## デッキと対面

デッキは共通または当該環境のアーキタイプを対象とし、有効マスタと期間内に観測した無効マスタを含む。個人デッキIDを代用しない。未分類・環境外の分類はデッキとして出力せず、登録件数と遭遇率の分母には含める。他方が既知なら、そのデッキの実測勝率には含める。

| decks[]の項目 | 意味 |
|---|---|
| deckId / name / className / isOther | マスタUUID、名称、クラス、「その他」分類か |
| registrations / count / wins / winRate | 当該デッキを含む登録数、両者視点の評価件数、その勝数・勝率。ミラー1登録は2評価、1勝 |
| encounters / encounterRate | 相手側に出た登録数と、期間の全登録数に占める率。全登録があり遭遇が0なら0% |
| useCount / useWinRate | 使用側での登録数、その側から見た勝率 |
| eligibleCount / eligibleWinRate / interval95 | ミラー・未分類・その他を除くTier候補判定の件数・勝率・95% Wilson区間（百分率の下限・上限） |
| dataTier | 後述の数値1〜5、または保留のnull |
| contributors / pilots | 当該デッキがどちらかに登場した対戦の登録者数、自分で当該デッキを使用した登録者数 |
| topContributorShare / userEqualWinRate | 最大の1登録者が当該デッキ評価件数に占める率、各登録者の当該デッキ両者視点勝率を等重みで平均した率 |
| short / byRank / byDay | 3日間のデッキ成績、登録者ランクをキーにした7日間の成績、日本時間の日付をキーにした日別成績。各成績に registrations / count / wins / winRate / encounters / encounterRate / useCount / useWinRate を収録 |
| byTurn | first（先攻）とsecond（後攻）の各成績。count / wins / winRate。対象デッキが相手側に登場した場合は先後と勝敗を反転 |

対面は、期間内に観測した異なるマスタ同士をUUID昇順の `a`, `b` で1回だけ保持する。`count` は両方向の登録数、`wins` と `winRate` はa視点。`short` と `byRank` と `byTurn` は同じ視点のcount / wins / winRateを持つ。`interval95` はa視点の95% Wilson区間。`dataRating` は−2〜2の整数または保留のnull。逆方向の評価は符号反転で決まる。ミラーは対象外、未観測の組は保留。割合は0〜100の数値で保持し、分母0ではnull。ランク・日付キーの欠落は、その区分で全登録が0であることを示す。

各対面の `contributors` は当該組を登録した人数、`topContributorShare` は最大の1登録者が当該組の登録数に占める率、`userEqualWinRate` は登録者ごとにa視点にそろえた勝率の単純平均を表す。個人ごとの内訳はエクスポートされない。

## 実測ルール environment-review-v1

設計時の分布は既存のローカル検証記録 `build/environment-trends-production/rpc-all.json` の最終点で確認した。2026年11月15日19時30分時点、全ランク、7日移動集計812登録。選択24デッキの両者視点の評価件数は0〜481件、中央値39.5件。10件未満は6デッキ、20件未満は9デッキだった。これは単一環境の計測例で、現環境への精度評価ではない。以下のしきい値と標本区間は運用上の初版として固定する。

1. Tier用の母集団は既存期間レポートの `periodDeckPerspectives(..., true)` に倣い、両者視点を統合する。ミラー・未分類・「その他」相手は除く。「その他」の分類自体も保留。
2. 既存週報の最低10件に満たなければ保留。登録側・反転側が各20件以上でその勝率差が25ポイント以上の場合も、週報と同じく保留にする。この登録側の差だけで外部評価との乖離を認定しない。
3. Tier1は40件以上、勝率56%以上、95% Wilson下限が50%超。Tier2は20件以上、勝率53%以上、同じく下限が50%超。順に判定する。56/53/50%は既存週報の勝率基準、20/40件は少数での上位評価を抑える下限。
4. 次に勝率50%以上はTier3。40件以上でWilson上限が45%未満ならTier5。残りはTier4。総合TierとデータTierは別の項目として保持する。
5. 対面は10件未満と「その他」の対面を保留。実測勝率が60%超は+2、55%超〜60%は+1、45%〜55%は0、40%〜45%未満は−1、40%未満は−2。既存環境相性表と同じ境界を整数勝数で比較する。管理者は信頼区間・ランク・先後も確認して総合相性を判断する。

Wilson区間は正規分布の両側95%に相当するz=1.96を用いる。同一登録者の戦績や同一試合が含まれる可能性があり、これは標本の不確実性を確認する目安。区間や件数だけで外部評価との乖離を決定しない。次版にしきい値を変更した場合はruleVersionを更新し、過去の保存済み評価は作成時の版を維持する。
