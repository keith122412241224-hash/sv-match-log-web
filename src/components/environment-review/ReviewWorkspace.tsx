"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MAX_EVALUATION_BYTES, type EvaluationDocument, type reviewDiagnostics } from "@/lib/environment-review/evaluation";
import { researchPlan } from "@/lib/environment-review/research-plan";
import { tierMethod, strength } from "@/lib/environment-review/assessment-v3";
import { freshness } from "@/lib/environment-review/evidence-v2";
import { jst, matchupLabel, tierLabel, type MemberPayload } from "@/lib/environment-review/publication";
import type { compareDraft, ReviewEvent, ReviewRun, RunDetail } from "@/lib/environment-review/workflow";
import { ReviewReport } from "./ReviewReport";
import { ReviewEditor } from "./ReviewEditor";

const api = "/admin/environment-review/api";
const button = "min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold disabled:opacity-50";
const primary = "min-h-11 rounded-md bg-ink px-4 text-sm font-bold text-white disabled:opacity-50";
const card = "min-w-0 rounded-md border border-slate-200 bg-white p-4 sm:p-5";
const field = "w-full min-w-0 rounded-md border border-slate-300 bg-white p-2";
const labels: Record<string,string> = { snapshot:"集計済み", draft:"下書き", published:"公開中", archived:"公開終了",create:"集計",save:"下書き保存",publish:"公開",withdraw:"公開停止",restore:"復元",failure:"失敗" };
type Index = { runs: ReviewRun[]; events: ReviewEvent[]; current: string | null };
type Preview = { sourceEdition?:string|null; reviewKey: string; matchesSaved: boolean; payload: MemberPayload; warnings: string[]; analysis: EvaluationDocument; diagnostics: ReturnType<typeof reviewDiagnostics>; draftComparison: ReturnType<typeof compareDraft>; publishedEdition: string | null };

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body ? { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body),cache:"no-store" } : { cache:"no-store" });
  const value = await res.json();
  if (!res.ok) throw new RequestError(value.error ?? "処理に失敗しました。",res.status);
  return value;
}
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
export function ReviewWorkspace({environment, environmentName}: {environment: string; environmentName: string}) {
  const base = api + "?environment=" + encodeURIComponent(environment);
  const [index,setIndex] = useState<Index>({runs:[],events:[],current:null});
  const [page,setPage] = useState(0), [run,setRun] = useState<RunDetail | null>(null);
  const [input,setInput] = useState(""), [reason,setReason] = useState("");
  const [preview,setPreview] = useState<Preview | null>(null), [confirmed,setConfirmed] = useState(false);
  const [busy,setBusy] = useState(true), [error,setError] = useState(""), [notice,setNotice] = useState("");
  const [eventData,setEventData] = useState<unknown>();
  const lock = useRef(false);
  const [filename,setFilename] = useState("");
  const [edited,setEdited] = useState(false), [editorDirty,setEditorDirty] = useState(false);
  const [reloadRequired,setReloadRequired] = useState(false);
  const [receipt,setReceipt] = useState<{asOf:string; publishedAt:string} | null>(null);
  const parsed = useMemo(() => {
    try { return JSON.parse(input); } catch { return null; }
  }, [input]);
  const snapshotMatches = !!run && parsed?.snapshotId === run.id && parsed?.environmentId === environment;
  function loadRun(r: RunDetail | null) {
    setFilename(""); setEdited(false); setEditorDirty(false); setReloadRequired(false); setReceipt(null);
    setRun(r); setInput(r?.analysis ? JSON.stringify(r.analysis,null,2) : ""); setPreview(null); setConfirmed(false); setReason("");
  }
  const refresh = useCallback(async (pageNo: number) => {
    const next = await request<Index>(base + "&page=" + pageNo);
    setIndex(next); setPage(pageNo); setEventData(undefined);
    return next;
  },[base]);
  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const list = await request<Index>(base);
        const first = list.runs[0];
        const detail = first ? await request<RunDetail>(base + "&id=" + first.id) : null;
        if (active) { setIndex(list); loadRun(detail); }
      } catch(e) { if (active) setError(String(e instanceof Error ? e.message : e)); }
      finally { if (active) setBusy(false); }
    }
    void init(); return () => { active = false; };
  },[base]);
  async function task(fn: () => Promise<void>) {
    if (busy || lock.current) return;
    lock.current = true;
    setBusy(true); setNotice(""); setError("");
    try { await fn(); } catch(e) {
      setError(e instanceof Error ? e.message : "操作に失敗しました。");
      if (e instanceof RequestError && e.status === 409) { setReloadRequired(true); setConfirmed(false); setPreview(null); }
    }
    finally { lock.current = false; setBusy(false); }
  }
  function edit(text: string, name = "") {
    setEdited(Boolean(preview) || edited); setPreview(null); setConfirmed(false); setReceipt(null);
    setFilename(name); setInput(text); setEditorDirty(false); setNotice(""); setError("");
  }
  function payload(action: string, selected = run) {
    return {action,environment,id:selected?.id,revision:selected?.revision,expectedPublication:index.current,reason};
  }
  async function check(selected = run, current = index.current, document = parsed) {
    if (!document) throw new Error("JSONの形式を確認して、もう一度検証してください。");
    return request<Preview>(api,{...payload("preview",selected),expectedPublication:current,document});
  }
  async function reload() {
    const current = await refresh(0);
    const id = run?.id ?? current.runs[0]?.id;
    if (!id) { loadRun(null); return; }
    const latest = await request<RunDetail>(base + "&id=" + id);
    const working = input || (latest.analysis ? JSON.stringify(latest.analysis,null,2) : "");
    loadRun(latest); setInput(working); setReason(reason); setFilename(filename);
    if (working) {
      let document;
      try { document = JSON.parse(working); } catch { throw new Error("入力中のJSONを修正して再検証してください。"); }
      setPreview(await check(latest,current.current,document));
    }
    setNotice("最新の状態を読み込みました。内容を確認してください。");
  }
  async function submit(publish: boolean) {
    if (!run || !preview) return;
    let revision: number;
    try {
      const result = await request<{revision:number}>(api,{
        ...payload(publish ? "confirmPublish" : "save"), document:preview.analysis,
        reviewKey:preview.reviewKey, sourceEdition:confirmed?preview.sourceEdition:null, publishedEdition:preview.publishedEdition, confirmChanges:confirmed
      });
      revision = result.revision;
    } catch (e) {
      // A lost response is ambiguous: reconcile with the server before allowing a retry.
      setConfirmed(false); setReloadRequired(true); setReceipt(null);
      throw e instanceof RequestError ? e : new Error("応答を確認できませんでした。再読み込みして保存・公開状態を確認してください。");
    }
    setPreview(null); setConfirmed(false);
    try {
      const list = await refresh(0);
      const latest = await request<RunDetail>(base + "&id=" + run.id);
      if (latest.revision !== revision) throw new Error("別の操作によって評価が更新されました。");
      setRun(latest);
      if (publish) {
        if (latest.status !== "published" || list.current !== latest.id || !latest.published_at) throw new Error("別の操作によって評価が更新されました。");
        setReceipt({asOf:latest.as_of, publishedAt:latest.published_at});
        setNotice("公開しました。");
      } else {
        setPreview(await check(latest,list.current,preview.analysis));
        setNotice("下書きを保存しました。プレビューを確認し、チェックを入れると公開できます。");
      }
      setReason(""); setEdited(false); setEditorDirty(false);
    } catch (e) {
      setReloadRequired(true);
      throw new Error((publish ? "公開処理の後、最新の状態を確認できませんでした。" : "下書きは保存済みです。") +
        "再読み込みしてください。 " + (e instanceof Error ? e.message : ""));
    }
  }
  async function after(id: string, message: string) {
    await refresh(0); loadRun(await request<RunDetail>(base + "&id=" + id)); setNotice(message);
  }
  async function apply(action: string) {
    if (!run) return;
    await request(api,payload(action));
    await after(run.id,({withdraw:"公開を停止しました。",failure:"分析失敗を記録しました。"} as Record<string,string>)[action]);
  }
  async function restore(event: ReviewEvent) {
    if (!event.run_id) return;
    const selected = await request<RunDetail>(base + "&id=" + event.run_id);
    await request(api,{...payload("restore",selected),restoreEvent:event.id});
    await after(selected.id,"選択した公開版を復元しました。");
  }
  const needsReason = !!run?.analysis && !!preview && !preview.matchesSaved;
  let blocked = "";
  if (busy) blocked = "処理中です。";
  else if (reloadRequired) blocked = "最新の保存・公開状態を再読み込みしてください。";
  else if (!run) blocked = "スナップショットを作成してください。";
  else if (!input.trim()) blocked = "分析結果JSONを取り込んでください。";
  else if (!preview) blocked = edited ? "評価内容が変更されたため、再検証が必要です。" : "検証してプレビューを実行してください。";
  else if (editorDirty) blocked = "詳細な評価編集の修正をJSONに反映するか、取り消してください。";
  else if (preview.matchesSaved && run.status !== "draft") blocked = "同じ内容は公開済みです。過去版は履歴から復元できます。";
  else if (needsReason && !reason.trim()) blocked = "評価を変更した理由を入力してください。";
  else if (preview.warnings.length && run.mode !== "manual") blocked = "管理者による手動の評価確認が必要です。";
  else if (!confirmed) blocked = preview.warnings.length ? "重要な警告を確認し、公開内容の確認チェックを入れてください。" : "公開内容の確認チェックを入れてください。";

  return <fieldset disabled={busy} aria-busy={busy} className="grid min-w-0 gap-4">
    <section className={card}><h2 className="text-lg font-bold">基本情報</h2>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">{[
        ["対象環境",environmentName],["集計基準日時",run ? jst(run.as_of) + " JST" : "未集計"],
        ["実戦データ件数",run ? run.snapshot.matchCount + "件" : "未集計"],
        ["環境の公開状態",index.current ? "管理者限定公開中" : "未公開"],
        ["選択中の評価",run ? labels[run.status] + " ／ 更新番号 " + run.revision : "なし"],
        ["最終更新日時",run ? jst(run.updated_at) + " JST" : "未更新"]
      ].map(([key,value])=><div key={key}><dt className="text-muted">{key}</dt><dd className="font-semibold">{busy && !run ? "…" : value}</dd></div>)}</dl>
      {run && <p className="mt-3 text-xs text-muted">{run.snapshot.ruleVersion} ／ {run.snapshot.confidenceRuleVersion} ／ JSON v{run.snapshot.schemaVersion}</p>}
    </section>
    <details className={card} open={!run}><summary className="cursor-pointer font-semibold">STEP 1　分析用データの出力</summary>
      <p className="my-2 text-sm text-muted">対象環境の全期間と、同じ締切の直近7日・3日の戦績を固定します。JSONと専用プロンプトをChatGPTに渡してください。</p>
      <div className="flex flex-wrap items-center gap-2"><button className={primary} onClick={() => task(async () => {
        const {id} = await request<{id:string}>(api,{action:"create",environment}); await after(id,"集計を保存しました。分析用JSONをダウンロードできます。");
      })}>スナップショットを作成</button>
      <button className={button} disabled={!run} onClick={() => task(async () => download("sv-environment-" + run!.id + ".json",await request(base + "&id=" + run!.id + "&export=1")))}>分析用JSONを出力</button>
      {([["prompt","専用プロンプト"],["schema","JSON Schema"],["sample","サンプルJSON"]] as const).map(([key,label]) => <a className="p-1 text-sm underline" href={api+"?resource="+key+"&version="+(run?.snapshot.schemaVersion===1 ? 1 : 3)} key={key} download>{label}</a>)}</div>
    </details>
    <section className={card}><h2 className="text-lg font-bold">STEP 2　分析結果の取り込み</h2>
      {run ? <div className="mt-3 grid gap-3">
        <details open={!run.analysis}><summary className="cursor-pointer text-sm font-semibold">ファイル・JSONの取り込み</summary><div className="mt-2 grid gap-2">
        <label className="grid gap-1 text-sm font-semibold">分析結果ファイル<input className="max-w-full" type="file" accept=".json,application/json" onChange={e=>{
          const file=e.target.files?.[0]; e.target.value="";
          if(file) void task(async()=>{edit(""); if(file.size>MAX_EVALUATION_BYTES)throw new Error("JSONは2MB以内で指定してください。");edit(await file.text(), file.name);});
        }} /></label>
        {filename && <p className="break-all text-sm">取り込んだファイル　{filename}</p>}
        <details><summary className="cursor-pointer font-semibold">JSONを直接貼り付け・編集</summary>
          <label className="mt-2 grid gap-1 text-sm">評価JSON（貼り付け・編集）<textarea className={field+" font-mono text-xs"} rows={6} value={input} onChange={e=>edit(e.target.value)} spellCheck={false} /></label>
        </details>
        {input.trim() && <p className="text-sm">{snapshotMatches ? "対象環境・スナップショットIDが一致しました。" : "対象環境・スナップショットIDを照合できません。入力内容を確認してください。"}</p>}
        </div></details>
        {run.analysis && !preview && !edited && input === JSON.stringify(run.analysis,null,2) && <p className="text-sm">{run.analysis.public.overview.facts}</p>}
        <div><button className={button} disabled={!input.trim() || reloadRequired} onClick={()=>task(async()=>{
          setPreview(null); setConfirmed(false); setEditorDirty(false); setReceipt(null);
          setPreview(await check()); setEdited(false); setNotice("検証が完了しました。公開前プレビューを確認してください。");
        })}>検証してプレビュー</button></div>
      </div> : <p>スナップショットを作成すると取り込みを開始できます。</p>}
    </section>
    <div aria-live="polite">{busy && "処理中…"}{notice && <p role="status" className="rounded-md bg-emerald-50 p-3 text-emerald-900">{notice}</p>}{error && <p role="alert" className="rounded-md bg-red-50 p-3 text-red-800">{error}</p>}</div>
    <section className={card}><h2 className="text-lg font-bold">STEP 3　評価内容の確認・公開</h2><div className="mt-3 grid min-w-0 gap-3">
      {receipt && <div className="rounded-md border p-3"><h3 className="font-bold">公開完了</h3>
        <p>{environmentName} ／ 管理者限定公開中</p><p className="text-sm">分析基準日時　{jst(receipt.asOf)} JST<br/>公開日時　{jst(receipt.publishedAt)} JST</p>
        <Link prefetch={false} className="mt-3 inline-flex min-h-11 items-center rounded-md bg-ink px-4 text-sm font-bold text-white" href={{pathname:"/environment",query:{environment,tab:"review"}}}>総合環境評価を見る</Link></div>}
      {preview && run && <>
        <div><h3 className="font-semibold">評価結果</h3><p className="text-sm">{preview.analysis.public.overview.facts}</p></div>
        {preview.warnings.length > 0 && <details className="rounded-md border border-amber-500 p-3"><summary className="cursor-pointer font-semibold">重要な警告・管理者確認（{preview.warnings.length}件）</summary><ul className="list-disc pl-5 text-sm">{preview.warnings.map(w=><li key={w}>{w}</li>)}</ul></details>}
        {preview.sourceEdition && preview.analysis.schemaVersion===2 && <details><summary>公開前に照合する原典</summary>
          {preview.analysis.internal.research?.sources.filter(s=>s.outcome==="採用" || s.guideCheck?.status==="本文確認").map(s=><p key={s.id}><a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.publisher}</a>　{s.applicability}</p>)}</details>}
        <Comparison run={run} preview={preview}/>
        <details className="min-w-0 rounded-md border p-3"><summary className="cursor-pointer font-semibold">公開前プレビュー</summary><ReviewReport preview publication={{run_id:run.id,as_of:run.as_of,published_at:run.as_of,payload:preview.payload}} /></details>
        {needsReason && <label className="grid gap-1 text-sm font-semibold">評価の修正理由<input className={field} value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)} /></label>}
      </>}
      {!receipt && <><label className="flex items-center gap-2"><input type="checkbox" disabled={!preview || reloadRequired || editorDirty} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{preview?.sourceEdition?"原典の本文・適用範囲、判断の反対材料、公開内容と前回からの変更を確認しました":"公開内容と前回からの変更を確認しました"}</label>
      <div className="flex flex-wrap gap-2"><button className={primary} disabled={!!blocked} aria-describedby="publish-guidance" onClick={()=>task(()=>submit(true))}>確認して公開</button>
        <button className={button} disabled={!preview || preview.matchesSaved || editorDirty || reloadRequired || (needsReason && !reason.trim())} onClick={()=>task(()=>submit(false))}>下書き保存</button></div>
      <p id="publish-guidance" className="text-sm text-muted">{blocked || "確認済みの内容を管理者限定で公開できます。"}</p></>}
      {reloadRequired && <button className={button+" justify-self-start"} onClick={()=>task(reload)}>最新の状態を再読み込み</button>}
    </div></section>
    <details className={card}><summary className="cursor-pointer text-lg font-bold">評価履歴・詳細設定</summary><div className="mt-3 grid min-w-0 gap-3">
      {preview && run && <><ReviewEditor document={preview.analysis} snapshot={run.snapshot} onApply={edit} onDirtyChange={dirty=>{setEditorDirty(dirty);setConfirmed(false);}}/>
        <details><summary className="cursor-pointer font-semibold">管理者用の出典・判断根拠</summary><InternalInfo analysis={preview.analysis} snapshot={run.snapshot}/></details></>}
      <label className="grid gap-1 text-sm font-semibold">修正・復元・失敗の理由<input className={field} value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={!run || index.current!==run.id} onClick={()=>{if(window.confirm("この環境の評価を公開停止しますか？")) void task(()=>apply("withdraw"));}}>公開停止</button>
        <button className={button} disabled={!run || !reason.trim()} onClick={()=>task(()=>apply("failure"))}>分析失敗を記録</button></div>
      <h3 className="font-bold">過去の評価履歴</h3>
      {index.runs.map(r=><button key={r.id} aria-pressed={run?.id===r.id} className="mb-2 mr-2 rounded-md border border-slate-300 p-2 text-left text-sm aria-pressed:border-sky-700" onClick={()=>task(async()=>loadRun(await request<RunDetail>(base+"&id="+r.id)))}>{jst(r.as_of)} ／ {labels[r.status]} ／ {r.mode==="manual"?"手動":"自動"}{r.id===index.current?" ／ 管理者限定公開中":""}</button>)}
      <h3 className="mt-3 font-bold">実行・修正履歴</h3>{index.events.length===0&&<p className="text-sm text-muted">履歴はありません。</p>}
      {index.events.map(e=><div className="flex flex-wrap items-center gap-2 border-b border-slate-200 py-2 text-sm" key={e.id}><span>{jst(e.created_at)}　{labels[e.action]??e.action}　{e.reason}</span>
        <button className="underline" onClick={()=>task(async()=>setEventData(await request(base+"&event="+e.id)))}>変更内容</button>
        {e.action==="publish"&&<button className="underline" disabled={!reason.trim()} onClick={()=>{if(window.confirm("選択した公開版を復元しますか？"))void task(()=>restore(e));}}>この公開版へ復元</button>}</div>)}
      {eventData!==undefined&&<pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all bg-slate-50 p-3 text-xs">{JSON.stringify(eventData,null,2)}</pre>}
      <div className="mt-3 flex flex-wrap items-center gap-3"><button className={button} disabled={page===0} onClick={()=>task(async()=>{await refresh(page-1);})}>前の20件</button><button className={button} disabled={Math.max(index.runs.length,index.events.length)<20} onClick={()=>task(async()=>{await refresh(page+1);})}>次の20件</button></div>
      <button className={button+" justify-self-start"} onClick={()=>task(reload)}>再読み込み</button>
    </div></details>
  </fieldset>;
}

function Comparison({run, preview}: {run: RunDetail; preview: Preview}) {
  if (!preview.diagnostics.length) return null;
  const decks = new Map(run.snapshot.decks.map(d => [d.deckId, d]));
  const pairs = new Map(run.snapshot.pairs.map(p => [p.a + "/" + p.b, p]));
  const evidence = new Map(preview.analysis.internal.evidence.map(e => [e.target, e] as const));
  const comparison = preview.draftComparison;
  return <details className="min-w-0 rounded-md border border-slate-200 p-3"><summary className="cursor-pointer font-semibold">新旧ルール・総合評価の比較</summary>
    <p className="my-2 text-sm text-muted">前回差はスナップショット作成時の公開版との比較です。公開操作では、その時点の公開版との大幅変動も確認します。</p>
    <details className="mb-2 text-sm"><summary className="cursor-pointer">同じスナップショットの保存済み案と比較</summary>
      <p className="mt-2 break-all">外部資料の識別値（SHA-256）　{comparison.fingerprint}</p>
      <p>{comparison.sameSources === null ? "初回の取り込みです。" :
        (comparison.sameSources ? "保存済み案と外部資料は同一です。" : "保存済み案から外部資料が変わりました。") +
        " 総合Tier・対面評価の変更 " + comparison.changedTargets.length + "件"}</p>
      {comparison.changedTargets.length > 0 && <p>{comparison.changedTargets.map(t => t.split("/").map(id=>decks.get(id)?.name ?? id).join(" 対 ")).join("、")}</p>}
    </details>
    <div className="max-h-96 overflow-auto"><table className="w-max min-w-full text-left text-sm">
      <thead className="sticky top-0 bg-white"><tr>{["対象","従来A","改善候補C","採用したデータ評価","外部評価傾向","総合評価","データからの補正","前回差","総合信頼度","乖離候補・優先度"].map(s=><th key={s} scope="col" className="p-2">{s}</th>)}</tr></thead>
      <tbody>{preview.diagnostics.map(d => {
        const deck = decks.get(d.target), pair = pairs.get(d.target), model = deck?.model, pairModel = pair?.model;
        const format = deck ? tierLabel : matchupLabel;
        const label = d.target.split("/").map(id => decks.get(id)?.name ?? id).join(" 対 ");
        const old = model ? model.legacyTier : pairModel?.legacyRating;
        const candidate = model ? model.candidateTier : pairModel?.candidateRating;
        const delta = (n: number | null) => n == null ? "比較対象なし" : n === 0 ? "据え置き" : Math.abs(n) + (n > 0 ? "段階上方" : "段階下方");
        return <tr key={d.target} className="border-t"><th scope="row" className="p-2">{label}</th>
          <td className="p-2">{format(old ?? null)}</td><td className="p-2">{format(candidate ?? null)}</td><td className="p-2">{format(d.before)}</td>
          <td className="p-2">{evidence.get(d.target)?.externalTrend ?? "比較不能"} ／ {d.independentGroups}系列</td><td className="p-2">{format(d.after)}</td>
          <td className="p-2">{delta(d.signedChange)}</td><td className="p-2">{delta(d.previousChange)}</td>
          <td className="p-2">{d.confidence}</td><td className="max-w-80 p-2">{d.status} ／ {d.importance}{d.signals.length > 0 && <div>{d.signals.join("、")}</div>}
            {d.omissionReason && <div>未掲載理由　{d.omissionReason}</div>}</td></tr>;
      })}</tbody></table></div></details>;
}
function InternalInfo({analysis,snapshot}: {analysis: EvaluationDocument; snapshot: RunDetail["snapshot"]}) {
  const sources = new Map(analysis.schemaVersion===2 ? analysis.internal.sources.map(s=>[s.id,s] as const) : []);
  const evidence = new Map(analysis.schemaVersion===2 ? analysis.internal.evidence.map(e=>[e.target,e] as const) : []);
  const names = new Map(snapshot.decks.map(d=>[d.deckId,d.name]));
  const targetName = (target:string) => target.split("/").map(id=>names.get(id) ?? id).join(" 対 ");
  const codes:Record<string,string> = {rank:"上位ランク差",trend:"推移",concentration:"登録者集中",equalWeight:"登録者均等勝率",perspective:"使用・反転差",smallSample:"少数戦績",matchup:"主要対面",turn:"先後差",difficulty:"難易度",build:"構築変化",tournament:"大会",external:"外部評価",split:"外部評価の分裂",other:"その他"};
  if(analysis.schemaVersion===2 && analysis.internal.research) {
    const research=analysis.internal.research, accepted=research.sources.filter(s=>s.outcome==="採用");
    const rate=tierMethod(analysis.tierRule);
    const plan=researchPlan(snapshot,research,snapshot.previousEvaluation,analysis.public);
    const targets=new Set(accepted.flatMap(s=>s.claims.map(c=>c.target)));
    return <div className="grid gap-2 text-sm"><b>評価方式　{analysis.judgmentRule ?? analysis.tierRule ?? "v3.0"}</b><details><summary>全デッキの基礎Tier・補正・前回公開版</summary>{snapshot.decks.map(d=>{const m=rate(d,snapshot), published=snapshot.previousEvaluation?.payload.evaluation.decks.find(p=>p.deckId===d.deckId);return <p key={d.deckId}><b>{d.name}</b>　遭遇 {tierLabel(m.presence)} ／ 旧方式 {tierLabel(strength(d,snapshot).tier)} ／ 実測補正後 {tierLabel(m.tier)} ／ 外部込み {tierLabel(analysis.public.decks.find(x=>x.deckId===d.deckId)?.tier??null)} ／ 集計時の前回公開 {published?tierLabel(published.tier):"比較なし"}。{m.reason}</p>})}</details><b>外部調査　{jst(research.analyzedAt)} JST</b><p>採用 {accepted.length}件 ／ 不採用 {research.sources.filter(s=>s.outcome==="不採用").length}件 ／ 取得不能 {research.sources.filter(s=>s.outcome==="取得不能").length}件</p>
      {analysis.internal.judgments && <details><summary>AIの判断根拠・反対材料・不確実性</summary>{analysis.internal.judgments.map(j=><article key={j.target} className="my-2"><b>{targetName(j.target)} ／ {j.priority} ／ {j.confidence}</b><p>{j.reason}</p><p>反対材料・条件　{j.counterargument}</p><p>不確実性　{j.uncertainty}</p>{j.sourceIds.map(id=>{const s=research.sources.find(r=>r.id===id);return s && <a key={id} className="mr-2 underline" href={s.url} target="_blank" rel="noreferrer">{s.publisher}</a>})}</article>)}</details>}
      <p>根拠のあるデッキ {[...targets].filter(k=>!k.includes("/")).length} ／ 対面 {[...targets].filter(k=>k.includes("/")).length}</p><p>{research.searchLog}</p>
      <details><summary>重点調査対象 {plan.targets.length} 件 ／ マスタ照合候補 {plan.candidates.length} 件</summary>
        <button type="button" className={button} onClick={()=>download("sv-research-plan-"+snapshot.snapshotId+".json",plan)}>追加調査用JSONを出力</button>
        {plan.targets.map(t=><p key={t.key}><b>{t.name}</b>　{t.reasons.join("、")}</p>)}
        {plan.candidates.map(c=><p key={c.source+c.name}>マスタ照合候補　{c.name} ／ {c.source}</p>)}</details>
      {research.sources.filter(s=>s.guideCheck).map(s=><details key={"guide-"+s.id}><summary>{s.publisher}との内部比較 ／ {s.guideCheck!.status}</summary>
        <p>{s.reason}　本文の版 {s.updatedAt || s.publishedAt ? jst((s.updatedAt ?? s.publishedAt)!) : "不明"} ／ 閲覧 {jst(s.retrievedAt)} JST</p>
        {s.guideCheck!.rows.map(row=><p key={row.deckId}><b>{names.get(row.deckId)}</b>　{row.relation} ／ {row.reason}</p>)}
      </details>)}
      {!analysis.judgmentRule && [...targets].map(target=>{
        const claimValues=accepted.flatMap(r=>r.claims.filter(c=>c.target===target && c.value!==null).map(c=>c.value));
        const deck=snapshot.decks.find(d=>d.deckId===target),pair=snapshot.pairs.find(p=>p.a+"/"+p.b===target);
        const base=deck ? rate(deck,snapshot).tier : pair?.dataRating ?? null;
        const end=deck ? analysis.public.decks.find(d=>d.deckId===target)?.tier : analysis.public.pairs.find(p=>p.a+"/"+p.b===target)?.rating;
        const fmt=deck ? tierLabel : matchupLabel;
        return <p key={target}><b>{targetName(target)}</b>　{fmt(base)} → {fmt(end??null)} ／ {end!==base ? base===null?"外部根拠で暫定評価":"外部根拠で補正" : !claimValues.length?"構築・対策の補足":claimValues.every(v=>v===base)?"実測案を支持":"見解の差・要検証"}</p>;
      })}
      {research.sources.map(s=><details key={s.id}><summary>{s.channel}・{s.publisher} ／ {s.outcome}</summary><p>{s.reason}　{s.applicability}</p><a className="underline" href={s.origin} target="_blank" rel="noreferrer">原典</a>{s.claims.map(c=><p key={c.target}>{targetName(c.target)}　{c.basis}（{c.conditions}）</p>)}</details>)}</div>;
  }
  return <div className="grid gap-3 py-2 text-sm">{analysis.internal.sources.map(s=><article className="rounded bg-slate-50 p-3" key={s.id}>
    <b>{s.publisher} ／ {s.group} ／ 信頼度 {s.reliability}</b><p>{s.summary}</p><p>外部評価の傾向　{s.trend}</p>
    <p>公開 {s.publishedAt?jst(s.publishedAt):"不明"} ／ 取得 {jst(s.retrievedAt)} JST</p>
    {sources.has(s.id) && (() => {
      const source=sources.get(s.id)!;
      const timing={latest:"対象期間内",applicableGuide:"現環境で有効な解説",ineligible:"根拠の集計対象外"}[freshness(source,snapshot)];
      return <><p>{timing} ／ {source.provenance==="original"?"一次資料":"引用・転載"} ／ {source.setting==="ranked"?"ランク戦":"大会"}</p>
        <p>確認した内容版　{source.versionAt?jst(source.versionAt):"指定なし"}</p>
        <p>対象　{source.targets.map(t=>targetName(t.target)+"（"+t.direction+"）").join("、") || "なし"}</p>
        <p>原典　<a className="break-all underline" href={source.originUrl} target="_blank" rel="noreferrer">{source.originUrl}</a></p></>;
    })()}
    <a href={s.url} className="break-all underline" target="_blank" rel="noreferrer">{s.url}</a></article>)}
    {analysis.internal.evidence.map(e=><details key={e.target}><summary>{targetName(e.target)} ／ {e.externalTrend}</summary><p>{e.rationale}</p><p>事実　{e.facts}</p><p>仮説　{e.hypothesis}</p><p>参照資料　{e.sourceIds.join("、")||"なし"}</p>
      {evidence.has(e.target) && <><p>補正理由の種別　{evidence.get(e.target)!.reasonCodes.map(code=>codes[code]).join("、")||"なし"}</p><p>残っている不確実性　{evidence.get(e.target)!.uncertainty}</p></>}</details>)}
    <p>情報不足・取得失敗　{analysis.internal.limitations || "記録なし"}</p></div>;
}
