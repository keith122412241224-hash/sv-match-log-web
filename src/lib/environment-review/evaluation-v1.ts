/** v1. Only the explicitly constructed public projection may leave the admin boundary. */
const confidenceLevels = ["判断保留", "低", "中", "高"] as const;
const directions = ["過小評価の可能性", "過大評価の可能性", "評価が分かれている", "判断保留"] as const;
const trends = ["上振れ評価", "下振れ評価", "評価分裂", "概ね一致", "比較不能"] as const;
const comparisons = ["available", "partial", "unavailable"] as const;
export const EVALUATION_SCHEMA_VERSION = 1;
export const CONFIDENCE_RULE_VERSION = "review-confidence-v1";
export const MAX_EVALUATION_BYTES = 2_000_000;
export type Confidence = (typeof confidenceLevels)[number];
export type Direction = (typeof directions)[number];
export type Trend = (typeof trends)[number];
export type Divergence = {
  status: "確認済み" | "要検証";
  direction: Direction;
  importance: number;
  facts: string;
  hypothesis: string;
};
type Assessment = {reason: string; confidence: Confidence; divergence: Divergence | null};
export type DeckAssessment = Assessment & {deckId: string; tier: number | null};
export type PairAssessment = Assessment & {a: string; b: string; rating: number | null};
export type PublicEvaluation = {
  overview: {facts: string; hypothesis: string};
  comparison: (typeof comparisons)[number];
  decks: DeckAssessment[];
  pairs: PairAssessment[];
  changes: string;
};
export type Source = {
  id: string; url: string; publisher: string; group: string; publishedAt: string | null;
  retrievedAt: string; environmentId: string; summary: string; trend: string; reliability: "高" | "中" | "低";
};
export type Evidence = {
  target: string; sourceIds: string[]; externalTrend: Trend; rationale: string; facts: string; hypothesis: string;
};
export type EvaluationDocument = {
  schemaVersion: 1;
  environmentId: string;
  snapshotId: string;
  public: PublicEvaluation;
  internal: {sources: Source[]; evidence: Evidence[]; limitations: string};
};
type Population = {count: number; eligibleCount?: number; contributors?: number | null; topContributorShare?: number | null};
export type ReviewContext = {
  snapshotId: string; environmentId: string; periodStart: string; asOf: string;
  decks: (Population & {deckId: string; dataTier: number | null})[];
  pairs: (Population & {a: string; b: string; dataRating: number | null})[];
};

export function fail(message: string): never {
  throw new Error(message);
}

export function object(value: unknown, keys: string, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${label} はオブジェクトを指定してください。`);
  const expected = keys.split(" ");
  if (Object.keys(value).length !== expected.length || !expected.every(key => Object.hasOwn(value, key))) {
    fail(`${label} の項目が仕様と一致しません。必須項目と余分な項目（実測値など）を確認してください。`);
  }
  return value as Record<string, unknown>;
}

export function list<T>(value: unknown, parse: (item: unknown) => T, limit: number, label: string): T[] {
  if (!Array.isArray(value) || value.length > limit) fail(`${label} の配列が不正です（最大${limit}件）。`);
  return value.map(parse);
}

export function string(value: unknown, label: string, max = 1200, optional = false): string {
  if (typeof value !== "string" || value.length > max || (!optional && !value.trim()) ||
      Array.from(value).some(char => char.charCodeAt(0) < 32 && !"\t\r\n".includes(char))) {
    fail(`${label} の文字列を確認してください（最大${max}文字）。`);
  }
  return value.trim();
}

function publicText(value: unknown, label: string, optional = false): string {
  const result = string(value, label, 1200, optional);
  if (/https?:\/\/|www\.|<\/?[a-z][^>]*>/iu.test(result)) fail(`${label} にURLやHTMLは掲載できません。`);
  return result;
}

export function oneOf<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (!options.some(item => item === value)) fail(`${label} は ${options.join(" / ")} から選択してください。`);
  return value as T;
}

function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) fail(`${label} は${min}〜${max}の整数です。`);
  return value;
}

export function id(value: unknown): string {
  const result = string(value, "ID", 128);
  if (!/^[\w.-]+$/u.test(result)) fail("IDには英数、ハイフン、アンダースコア、ピリオドを指定してください。");
  return result;
}

export function iso(value: unknown): string {
  const result = string(value, "日時", 40);
  const datePart = result.slice(0, 10);
  const day = new Date(datePart + "T00:00:00Z");
  if (!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.test(result) ||
      !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== datePart || !Number.isFinite(Date.parse(result))) {
    fail("日時はタイムゾーン付きのISO 8601形式で指定してください。");
  }
  return result;
}

export function indexed<T>(items: T[], key: (item: T) => string, label: string): Map<string,T> {
  const result = new Map(items.map(item => [key(item), item]));
  if (result.size !== items.length) fail(`${label} が重複しています。`);
  return result;
}

function parseDivergence(value: unknown): Divergence | null {
  if (value === null) return null;
  const d = object(value, "status direction importance facts hypothesis", "乖離分析");
  return {
    status: oneOf(d.status, ["確認済み", "要検証"], "乖離の状態"),
    direction: oneOf(d.direction, directions, "乖離の方向"), importance: integer(d.importance, 1, 5, "乖離の重要度"),
    facts: publicText(d.facts, "確認できた事実"), hypothesis: publicText(d.hypothesis, "推測", true)
  };
}

function assessment(d: Record<string,unknown>): Assessment {
  return {reason: publicText(d.reason, "評価理由"), confidence: oneOf(d.confidence, confidenceLevels, "信頼度"), divergence: parseDivergence(d.divergence)};
}

function deck(value: unknown): DeckAssessment {
  const d = object(value, "deckId tier reason confidence divergence", "デッキ評価");
  return {deckId: id(d.deckId), tier: d.tier === null ? null : integer(d.tier, 1, 5, "Tier"), ...assessment(d)};
}

function pair(value: unknown): PairAssessment {
  const d = object(value, "a b rating reason confidence divergence", "対面評価");
  const a = id(d.a), b = id(d.b);
  if (a >= b) fail("対面は異なるIDを昇順で1組だけ指定してください。");
  return {a, b, rating: d.rating === null ? null : integer(d.rating, -2, 2, "総合相性"), ...assessment(d)};
}

export function source(value: unknown): Source {
  const d = object(value, "id url publisher group publishedAt retrievedAt environmentId summary trend reliability", "外部資料");
  const urlValue = string(d.url, "出典URL", 2048);
  if (!URL.canParse(urlValue)) fail("出典URLの形式を確認してください。");
  const url = new URL(urlValue);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) fail("出典URLは認証情報のないHTTP(S)形式にしてください。");
  url.hash = "";
  const publishedAt = d.publishedAt === null ? null : iso(d.publishedAt), retrievedAt = iso(d.retrievedAt);
  if (publishedAt && Date.parse(publishedAt) > Date.parse(retrievedAt)) fail("公開日時が取得日時より後です。");
  return {
    id: id(d.id), url: url.href, publisher: string(d.publisher, "発信元", 120), group: string(d.group, "独立した発信元の識別名", 120),
    publishedAt, retrievedAt, environmentId: id(d.environmentId), summary: string(d.summary, "独自要約", 500),
    trend: string(d.trend, "外部評価の傾向", 500), reliability: oneOf(d.reliability, ["高", "中", "低"], "資料信頼度")
  };
}

export function evidence(value: unknown): Evidence {
  const d = object(value, "target sourceIds externalTrend rationale facts hypothesis", "内部判断根拠");
  const sourceIds = list(d.sourceIds, id, 100, "参照資料ID");
  indexed(sourceIds, key => key, "参照資料ID");
  return {
    target: string(d.target, "対象ID", 257), sourceIds, externalTrend: oneOf(d.externalTrend, trends, "実測に対する外部評価の傾向"),
    rationale: string(d.rationale, "内部判断理由"), facts: string(d.facts, "内部の事実"), hypothesis: string(d.hypothesis, "内部の仮説", 1200, true)
  };
}

function independentGroups(sources: Source[], ctx: ReviewContext): number {
  const start = Date.parse(ctx.periodStart), end = Date.parse(ctx.asOf);
  return new Set(sources.filter(s => s.publishedAt && Date.parse(s.publishedAt) >= start && Date.parse(s.publishedAt) <= end && s.reliability !== "低").map(s => s.group)).size;
}

const directionFor: Partial<Record<Trend,Direction>> = {
  "上振れ評価":"過小評価の可能性", "下振れ評価":"過大評価の可能性", "評価分裂":"評価が分かれている"
};

function checkAssessment(
  row: Assessment, rating: number | null, baseline: number | null, pop: Population,
  basis: Evidence, groups: number, comparison: PublicEvaluation["comparison"]
) {
  if (baseline === null && rating !== null) fail(`${basis.target} は実測データの品質条件を満たさないため評価保留です。`);
  if ((rating === null) !== (row.confidence === "判断保留")) fail(`${basis.target} の保留と信頼度が一致しません。`);
  if (!groups && basis.externalTrend !== "比較不能") fail("外部評価の判断には同じ分析期間に公開された中以上の資料が必要です。");
  if (basis.externalTrend === "評価分裂" && groups < 2) fail("評価分裂には独立した複数の資料が必要です。");
  if (comparison === "unavailable" && basis.externalTrend !== "比較不能") fail("外部比較不能と対象別の外部評価が矛盾しています。");
  if (rating !== null && rating !== baseline && (!groups || basis.externalTrend === "比較不能")) fail("データ評価の変更には比較可能な外部根拠と変更理由が必要です。");
  if (row.divergence?.status === "確認済み" && (!groups || pop.count === 0 || directionFor[basis.externalTrend] !== row.divergence.direction)) {
    fail("確認済みの乖離には方向が一致する外部根拠が必要です。");
  }
  if (row.divergence?.status === "要検証" && !groups && row.divergence.direction !== "判断保留") fail("外部根拠が不足している対面・デッキの方向は判断保留です。");
  let maximum: Confidence = "低";
  if ((pop.eligibleCount ?? pop.count) >= 20 && groups >= 1 && basis.externalTrend !== "比較不能") maximum = "中";
  if (maximum === "中" && groups >= 2 && basis.externalTrend !== "評価分裂" && (pop.contributors ?? 0) >= 3 && pop.topContributorShare != null && pop.topContributorShare <= 50) maximum = "高";
  if (confidenceLevels.indexOf(row.confidence) > confidenceLevels.indexOf(maximum)) fail(`${basis.target} の信頼度の上限は「${maximum}」です。`);
}

export function parsePublic(value: unknown, ctx: ReviewContext, pairLimit?: number) {
  const p = object(value, "overview comparison decks pairs changes", "公開評価");
  const overview = object(p.overview, "facts hypothesis", "環境総評");
  const measuredDecks = indexed(ctx.decks, item => item.deckId, "集計デッキ");
  const measuredPairs = indexed(ctx.pairs, item => item.a + "/" + item.b, "集計対面");
  const pub: PublicEvaluation = {
    overview: {facts: publicText(overview.facts, "環境総評の事実"), hypothesis: publicText(overview.hypothesis, "環境総評の推測", true)},
    comparison: oneOf(p.comparison, comparisons, "外部情報の充足度"),
    decks: list(p.decks, deck, measuredDecks.size, "デッキ評価"), pairs: list(p.pairs, pair, pairLimit ?? measuredPairs.size, "対面評価"),
    changes: publicText(p.changes, "前回からの変化")
  };
  return {pub, measuredDecks, measuredPairs};
}

export function validateEvaluation(value: unknown, ctx: ReviewContext): EvaluationDocument {
  const root = object(value, "schemaVersion environmentId snapshotId public internal", "取り込みJSON");
  if (root.schemaVersion !== EVALUATION_SCHEMA_VERSION) fail("未対応のスキーマバージョンです。");
  if (root.snapshotId !== ctx.snapshotId || root.environmentId !== ctx.environmentId) fail("環境IDまたはスナップショットIDが一致しません。");
  const { pub, measuredDecks, measuredPairs } = parsePublic(root.public, ctx);
  const deckMap = indexed(pub.decks, item => item.deckId, "デッキ評価");
  if (deckMap.size !== measuredDecks.size || !ctx.decks.every(d => deckMap.has(d.deckId))) fail("デッキ一覧をスナップショットと一致させてください。");
  const pairMap = indexed(pub.pairs, item => item.a + "/" + item.b, "対面評価");
  const i = object(root.internal, "sources evidence limitations", "内部情報");
  const sources = list(i.sources, source, 100, "資料");
  const byId = indexed(sources, s => s.id, "資料ID");
  indexed(sources, s => s.url, "出典URL");
  if (sources.some(s => s.environmentId !== ctx.environmentId)) fail("異なる環境の資料が含まれています。");
  const proofs = list(i.evidence, evidence, deckMap.size + pairMap.size, "対象別の根拠");
  const proofsByTarget = indexed(proofs, s => s.target, "対象別の根拠");
  if (proofsByTarget.size !== deckMap.size + pairMap.size) fail("各デッキ・対面に内部判断根拠を1件指定してください。");
  let comparable = 0;
  for (const basis of proofs) {
    const refs = basis.sourceIds.map(key => byId.get(key) ?? fail("存在しない資料IDがあります。"));
    const groups = independentGroups(refs, ctx);
    if (basis.externalTrend !== "比較不能") comparable++;
    const deckRow = deckMap.get(basis.target);
    if (deckRow) {
      const pop = measuredDecks.get(basis.target)!;
      checkAssessment(deckRow, deckRow.tier, pop.dataTier, pop, basis, groups, pub.comparison);
    } else {
      const pairRow = pairMap.get(basis.target), pop = measuredPairs.get(basis.target);
      if (!pairRow || !pop || !deckMap.has(pairRow.a) || !deckMap.has(pairRow.b)) fail("対象デッキまたは対面がスナップショットと一致しません。");
      checkAssessment(pairRow, pairRow.rating, pop.dataRating, pop, basis, groups, pub.comparison);
    }
  }
  const expectedComparison = comparable === 0 ? "unavailable" :
    comparable === proofs.length && pairMap.size === measuredPairs.size ? "available" : "partial";
  if (pub.comparison !== expectedComparison) fail("外部情報の充足度が対象別の分析と一致しません。");
  const limitations = string(i.limitations, "情報不足・取得失敗の記録", 1800, pub.comparison === "available");
  return {schemaVersion: 1, environmentId: ctx.environmentId, snapshotId: ctx.snapshotId, public: pub, internal: {sources, evidence: proofs, limitations}};
}
