import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CreatorError, creatorClient } from "@/lib/creator/server";
import { baselineEvaluation, reviewDiagnostics, MAX_EVALUATION_BYTES } from "@/lib/environment-review/evaluation";
import { JUDGMENT_RULE } from "@/lib/environment-review/judgment";
import { researchPlan } from "@/lib/environment-review/research-plan";
import { anchoredStrength, cellLabel, priority, strength, TIER_RULE } from "@/lib/environment-review/assessment-v3";
import { checkDb, createSnapshot, publicationFor, publishReviewed, ReviewConflict, reviewAction, reviewId, runDetail, RUN_FIELDS } from "@/lib/environment-review/workflow";

export const dynamic = "force-dynamic";
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (e: unknown) => reply({ error: e instanceof Error ? e.message : "操作に失敗しました。" }, e instanceof ReviewConflict ? 409 : e instanceof CreatorError ? e.status : 400);
const resourcesV1 = {
  prompt: () => readFile(path.join(process.cwd(),"docs/environment-review/v1/prompt.md"),"utf8"),
  schema: () => readFile(path.join(process.cwd(),"docs/environment-review/v1/input.schema.json"),"utf8"),
  sample: () => readFile(path.join(process.cwd(),"docs/environment-review/v1/sample.json"),"utf8")
};
const resourcesV3 = {
  prompt: () => readFile(path.join(process.cwd(),"docs/environment-review/v3/prompt.md"),"utf8"),
  schema: () => readFile(path.join(process.cwd(),"docs/environment-review/v3/input.schema.json"),"utf8"),
  sample: () => readFile(path.join(process.cwd(),"docs/environment-review/v3/sample.json"),"utf8")
};
const resources = {
  prompt: () => readFile(path.join(process.cwd(),"docs/environment-review/prompt.md"),"utf8"),
  schema: () => readFile(path.join(process.cwd(),"docs/environment-review/input.schema.json"),"utf8"),
  sample: () => readFile(path.join(process.cwd(),"docs/environment-review/sample.json"),"utf8")
};

export async function GET(request: NextRequest) {
  try {
    const { client } = await creatorClient();
    const q = request.nextUrl.searchParams, resource = q.get("resource");
    if (resource && Object.hasOwn(resources,resource)) {
      const files = q.get("version") === "1" ? resourcesV1 : q.get("version")==="3" ? resourcesV3 : resources;
      const text = await files[resource as keyof typeof resources]();
      return new Response(text,{headers: {"Cache-Control":"private, no-store","Content-Type":"text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="environment-review-${resource}.${resource === "prompt" ? "md" : "json"}"` }});
    }
    const environment = reviewId(q.get("environment"));
    if (q.has("event")) {
      const event = Number(q.get("event"));
      if (!Number.isSafeInteger(event) || event < 1) throw new Error("履歴番号が不正です。");
      const result = await client.from("environment_review_events").select("action,reason,created_at,before_data,after_data").eq("id",event).eq("environment_id",environment).single();
      checkDb(result.error);
      return reply(result.data);
    }
    if (q.has("id")) {
      const run = await runDetail(client, reviewId(q.get("id")), environment);
      if (!q.has("export")) return reply(run);
      const { previousEvaluation, ...snapshot } = run.snapshot;
      if (snapshot.schemaVersion === 2) {
        const previous = previousEvaluation?.payload.evaluation ?? null;
        const researchTemplate={schemaVersion:2,promptVersion:snapshot.promptVersion,reviewVersion:3,tierRule:TIER_RULE,environmentId:snapshot.environmentId,snapshotId:snapshot.snapshotId,public:null,internal:{sources:[],evidence:[],limitations:"外部調査前",research:{mode:"current",analyzedAt:new Date().toISOString(),sources:[],searchLog:"未調査"}}};
        return reply({snapshot, previousEvaluation: previousEvaluation ?? null, candidates: reviewDiagnostics(snapshot, null, previous),
          v3Reference:{researchPlan:researchPlan(snapshot,run.analysis?.schemaVersion===2 ? run.analysis.internal.research : undefined,previousEvaluation,run.analysis?.public),decks:snapshot.decks.map(d=>({deckId:d.deckId,...anchoredStrength(d,snapshot),previousMethodTier:strength(d,snapshot).tier,priority:priority(d.encounterRate),dataTier:d.dataTier})),
            pairs:snapshot.pairs.map(p=>({a:p.a,b:p.b,measuredLabel:cellLabel(p.dataRating,p.wins,p.count),dataRating:p.dataRating}))},
          template: baselineEvaluation(snapshot, previous), researchTemplate, v3Template:{...researchTemplate,judgmentRule:JUDGMENT_RULE,internal:{...researchTemplate.internal,judgments:[]}}});
      }
      return reply({ snapshot, previousEvaluation: previousEvaluation ?? null });
    }
    const page = Number(q.get("page") ?? "0");
    if (!Number.isSafeInteger(page) || page < 0 || page > 100000) throw new Error("ページが不正です。");
    const [runs, events, current] = await Promise.all([
      client.from("environment_review_runs").select(RUN_FIELDS).eq("environment_id",environment).order("created_at",{ascending:false}).order("id").range(page*20,page*20+19),
      client.from("environment_review_events").select("id,run_id,action,reason,created_at").eq("environment_id",environment).order("id",{ascending:false}).range(page*20,page*20+19),
      publicationFor(client,environment)
    ]);
    checkDb(runs.error); checkDb(events.error);
    return reply({ runs: runs.data, events: events.data, current: current?.run_id ?? null });
  } catch(e) { return failure(e); }
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new CreatorError("操作元を確認できませんでした。",403);
    const { client } = await creatorClient();
    const reader = request.body?.getReader();
    if (!reader) throw new Error("JSONを指定してください。");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_EVALUATION_BYTES + 8192) { await reader.cancel(); throw new CreatorError("JSONが大きすぎます。",413); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const environment = reviewId(body.environment);
    let id: string | null = null;
    try {
      if (body.action === "create") return reply({ id: await createSnapshot(client,environment) });
      const run = await runDetail(client,reviewId(body.id),environment);
      id = run.id;
      if (body.action === "confirmPublish") return reply(await publishReviewed(client,run,body));
      if (body.action === "failure") {
        if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 1000) throw new Error("失敗の内容を1〜1000文字で入力してください。");
        checkDb((await client.rpc("environment_review_failure",{p_environment_id:environment,p_run_id:id,p_reason:body.reason})).error);
        return reply({ recorded:true });
      }
      return reply(await reviewAction(client,run,body));
    } catch(e) {
      if (["create","save","publish","confirmPublish","preview"].includes(body.action)) {
        await client.rpc("environment_review_failure",{ p_environment_id:environment,p_run_id:id,p_reason:(e instanceof Error ? e.message : "処理に失敗しました。").slice(0,1000) });
      }
      throw e;
    }
  } catch(e) { return failure(e); }
}
