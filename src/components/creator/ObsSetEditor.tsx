"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { OBS_CONTENTS, OBS_LABELS, obsOptions, selectedObsContents, obsCompositionUrl, parseObsSet, type ObsSet, type ObsContent } from "@/lib/creator/obs-set";
import { creatorRead, type CreatorPage, type TierSummary } from "@/lib/creator/pagination";
import type { CorrelationSummary, getObsSet } from "@/lib/creator/independent-server";
import { CreatorPager, useCreatorPage } from "./CreatorPager";
import { useUnsavedChanges } from "./useUnsavedChanges";
import styles from "./Creator.module.css";
import { RankMultiSelect } from "@/components/RankMultiSelect";
import { DASHBOARD_PERIODS, dashboardPeriodLabel, normalizeDashboardPeriod } from "@/lib/environment-dashboard-period";
import { selectInitialEnvironmentId } from "@/lib/environment-selection";
import type { Environment } from "@/types/database";

type Selection = Awaited<ReturnType<typeof getObsSet>>;
export function ObsSetEditor({ initial, environments }: { environments: Environment[]; initial: { sets: CreatorPage<ObsSet>; tiers: CreatorPage<TierSummary>; correlations: CreatorPage<CorrelationSummary>; selection: Selection | null } }) {
  const sets = useCreatorPage<ObsSet, CreatorPage<ObsSet>>("obs-sets", initial.sets);
  const tiers = useCreatorPage<TierSummary, CreatorPage<TierSummary>>("works", initial.tiers);
  const correlations = useCreatorPage<CorrelationSummary, CreatorPage<CorrelationSummary>>("correlations", initial.correlations);
  const [current, setCurrent] = useState(initial.selection?.set ?? null);
  const [name, setName] = useState(current?.name ?? "新しいOBSセット");
  const [tierId, setTierId] = useState(current?.tier_work_id ?? ""), [correlationId, setCorrelationId] = useState(current?.correlation_id ?? "");
  const [tierName, setTierName] = useState(initial.selection?.tier?.work.document.title ?? ""), [correlationName, setCorrelationName] = useState(initial.selection?.correlation?.correlation.document.title ?? "");
  const [options, setOptions] = useState(obsOptions(current));
  const [enabled, setEnabled] = useState<ObsContent[]>(current ? selectedObsContents(current) : ["tier", "correlation"]);
  const initialEnvironment = () => selectInitialEnvironmentId(environments);
  const [environmentId, setEnvironmentId] = useState(current?.environment_id ?? initialEnvironment());
  const [urlView, setUrlView] = useState<ObsContent | "">(current?.display_mode === "individual" ? selectedObsContents(current)[0] : "");
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [transparent, setTransparent] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const active = useRef(false), confirmLeave = useUnsavedChanges(dirty);
  async function run(task: () => Promise<void>) {
    if (active.current) return;
    active.current = true; setBusy(true); setNotice(null);
    try { await task(); } catch (e) { setNotice({ error: true, text: e instanceof Error ? e.message : "処理に失敗しました。" }); }
    finally { active.current = false; setBusy(false); }
  }
  async function post(body: Record<string, unknown>) {
    const r = await fetch("/admin/creator/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await r.json(); if (!r.ok) throw Error(result.error); return result;
  }
  function select(data: Selection | null) {
    const s = data?.set ?? null;
    setCurrent(s); setName(s?.name ?? "新しいOBSセット"); setTierId(s?.tier_work_id ?? ""); setCorrelationId(s?.correlation_id ?? "");
    setTierName(data?.tier?.work.document.title ?? ""); setCorrelationName(data?.correlation?.correlation.document.title ?? "");
    setOptions(obsOptions(s)); setEnabled(s ? selectedObsContents(s) : ["tier", "correlation"]);
    setEnvironmentId(s?.environment_id ?? initialEnvironment()); setUrlView(s?.display_mode === "individual" ? selectedObsContents(s)[0] : ""); setDirty(false);
    window.history.replaceState(null, "", `/admin/creator/obs-sets${s ? `?set=${s.id}` : ""}`);
  }
  const savedContents = current ? selectedObsContents(current) : [];
  const url = current ? obsCompositionUrl(current.id, transparent, urlView && savedContents.includes(urlView) ? urlView : undefined) : "";
  const visibleOrder = options.content_order.filter(k => enabled.includes(k));
  function move(content: ObsContent, delta: number) {
    const order = [...options.content_order], other = visibleOrder[visibleOrder.indexOf(content) + delta];
    if (!other) return;
    const a = order.indexOf(content), b = order.indexOf(other);
    [order[a], order[b]] = [order[b], order[a]];
    setOptions({ ...options, content_order: order }); setDirty(true);
  }
  const canSave = !!name.trim() && enabled.length > 0 && (!enabled.includes("environment") || !!environmentId) && (!enabled.includes("tier") || !!tierId) && (!enabled.includes("correlation") || !!correlationId);
  const pager = (label: string, list: typeof tiers | typeof correlations | typeof sets) => <CreatorPager label={label} index={list.index} hasNext={!!list.page.nextCursor} busy={busy} loading={list.loading} error={list.error} onPage={i=>void run(()=>list.load(i))} onRetry={()=>void run(()=>list.load(list.retryTarget))} />;
  return <main className={styles.page}>
    <header className={styles.header}><h1>OBS表示管理</h1><Link className={styles.button} href="/admin?section=tools" aria-disabled={busy} onClick={e=>{if(busy||active.current||!confirmLeave())e.preventDefault();}}>運用ツールへ戻る</Link></header>
    {notice && <p role={notice.error ? "alert" : "status"} className={notice.error ? styles.error : styles.notice}>{notice.text}</p>}
    <section className={styles.panel} aria-label="セット編集"><div className={styles.toolbar}><button disabled={busy} onClick={()=>{if(confirmLeave()){select(null);setNotice(null);}}}>新しいセット</button><span>{dirty ? "未保存の変更あり" : current ? "保存済み" : "新規セット（未保存）"}</span></div>
      <label>セット名<input value={name} maxLength={120} disabled={busy} onChange={e=>{setName(e.target.value);setDirty(true);}} /></label>
      <fieldset className={styles.toolbar}><legend>表示するコンテンツ</legend>{OBS_CONTENTS.map(content => <label key={content} className={styles.check} style={{ minHeight: 44 }}><input type="checkbox" style={{ width: 18, height: 18, minHeight: 18, padding: 0, flexShrink: 0 }} checked={enabled.includes(content)} disabled={busy} onChange={e => { setEnabled(e.target.checked ? [...enabled, content] : enabled.filter(k => k !== content)); setDirty(true); }} />{OBS_LABELS[content]}</label>)}</fieldset>
      {enabled.includes("environment") && <fieldset className="grid min-w-0 gap-3"><legend>環境データの集計条件</legend>
        <label>環境<select aria-label="環境" value={environmentId} disabled={busy || !environments.length} onChange={e => {setEnvironmentId(e.target.value);setDirty(true);}}>
          {!environments.length && <option value="">選択できる環境がありません</option>}{environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select></label>
        <label>期間<select aria-label="期間" disabled={busy} value={options.environment_period} onChange={e => {setOptions({...options,environment_period:normalizeDashboardPeriod(e.target.value)});setDirty(true);}}>{DASHBOARD_PERIODS.map(p => <option key={p.value} value={p.value}>{dashboardPeriodLabel(p.value)}</option>)}</select></label>
        <RankMultiSelect label="ランク・レート帯" disabled={busy} value={options.environment_ranks} onApply={ranks => {setOptions({...options,environment_ranks:ranks});setDirty(true);}} />
      </fieldset>}
      {enabled.includes("tier") && <div><label>表示するTier表<select aria-label="表示するTier表" value={tierId} disabled={busy} onChange={e=>{setTierId(e.target.value);setTierName(tiers.page.items.find(w=>w.id===e.target.value)?.title ?? "");setDirty(true);}}><option value="">選択してください</option>{tierId&&!tiers.page.items.some(w=>w.id===tierId)&&<option value={tierId}>{tierName||"無題のTier表"}（選択中）</option>}{tiers.page.items.map(w=><option value={w.id} key={w.id}>{w.title||"無題のTier表"}</option>)}</select></label>{pager("Tier表",tiers)}</div>}
      {enabled.includes("correlation") && <div><label>表示する相関図<select aria-label="表示する相関図" value={correlationId} disabled={busy} onChange={e=>{setCorrelationId(e.target.value);setCorrelationName(correlations.page.items.find(w=>w.id===e.target.value)?.title ?? "");setDirty(true);}}><option value="">選択してください</option>{correlationId&&!correlations.page.items.some(w=>w.id===correlationId)&&<option value={correlationId}>{correlationName||"無題の相関図"}（選択中）</option>}{correlations.page.items.map(w=><option value={w.id} key={w.id}>{w.title||"無題の相関図"}</option>)}</select></label>{pager("相関図",correlations)}</div>}
      <fieldset className={styles.toolbar}><legend>表示方法</legend>{([['continuous','縦連続表示'],['individual','個別表示']] as const).map(([value,label]) => <label className={styles.check} key={value} style={{ minHeight: 44 }}><input type="radio" name="display-mode" style={{ width: 18, height: 18, minHeight: 18, padding: 0 }} checked={options.display_mode === value} disabled={busy} onChange={() => {setOptions({...options,display_mode:value});setDirty(true);}} />{label}</label>)}</fieldset>
      <fieldset><legend>表示順序</legend><ol>{visibleOrder.map((content, index) => <li key={content} className={styles.toolbar} data-order-content={content}><span>{index + 1}. {OBS_LABELS[content]}</span><button aria-label={OBS_LABELS[content] + "を上へ"} disabled={busy || index === 0} onClick={() => move(content,-1)}>↑ 上へ</button><button aria-label={OBS_LABELS[content] + "を下へ"} disabled={busy || index === visibleOrder.length - 1} onClick={() => move(content,1)}>↓ 下へ</button></li>)}</ol></fieldset>
      <p className={styles.muted}>縦連続表示は幅1920pxを基準に、選択順に表示します。個別表示は先頭のコンテンツを表示し、保存後に各コンテンツのURLを選べます。環境データは再読み込み時点の集計になります。</p>
      <button className={styles.primary} disabled={busy || !canSave} onClick={()=>void run(async()=>{
        const values=parseObsSet({name,...options,environment_id:enabled.includes("environment")?environmentId:null,tier_work_id:enabled.includes("tier")?tierId:null,correlation_id:enabled.includes("correlation")?correlationId:null});
        const result=await post({action:"save-obs-set",id:current?.id,revision:current?.revision,values});setCurrent(result.set);setName(result.set.name);setUrlView(result.set.display_mode === "individual" ? selectedObsContents(result.set)[0] : "");setDirty(false);window.history.replaceState(null,"",`?set=${result.set.id}`);await sets.load(0);setNotice({error:false,text:"OBSセットを保存しました。"});
      })}>{busy?"処理中…":"セットを保存"}</button>
      {current && <div className={styles.toolbar}><label>OBSの表示対象<select aria-label="OBSの表示対象" value={urlView} onChange={e => setUrlView(e.target.value as ObsContent | "")}><option value="">保存した表示方法</option>{savedContents.map(content => <option key={content} value={content}>{OBS_LABELS[content]}のみ</option>)}</select></label><label className={styles.check}><input type="checkbox" checked={transparent} onChange={e=>setTransparent(e.target.checked)} />OBSの背景を透明にする</label><a className={styles.button} href={url} target="_blank" rel="noreferrer">OBS表示を開く</a><button disabled={busy} onClick={()=>void run(async()=>{await navigator.clipboard.writeText(new URL(url,window.location.origin).href);setNotice({error:false,text:"OBS URLをコピーしました。"});})}>OBS URLをコピー</button><input aria-label="OBS URL" value={url} readOnly />{dirty&&<p>OBSには最後に保存したセットが表示されます。</p>}</div>}
      <details className="mt-3 text-sm"><summary className="min-h-11 cursor-pointer py-3">OBSの設定・使い方</summary><p>OBSブラウザソースは幅1920 × 高さ1080を目安に設定してください。縦連続表示は「対話」からスクロールできます。環境データは内容に応じた高さで表示されます。</p><p>OBS側にも管理者ログインが必要です。最新の作品・集計はページを再読み込みすると反映されます。</p></details>
    </section>
    <section className={styles.panel} aria-label="保存済みOBSセット"><h2>保存済みOBSセット</h2>{!sets.page.items.length&&<p>このページにセットはありません。</p>}{sets.page.items.map(s=><div className={styles.work} key={s.id}><div><strong>{s.name}</strong><p className={styles.muted}>{new Date(s.updated_at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})}（日本時間）</p></div><div className={styles.toolbar}><button disabled={busy} onClick={()=>{if(confirmLeave())void run(async()=>select(await creatorRead<Selection>("obs-set",s.id)));}}>再編集</button><a className={styles.button} href={`/admin/obs/composition/${s.id}`} target="_blank" rel="noreferrer">OBS</a><button disabled={busy} onClick={()=>{if(!confirmLeave()||!window.confirm(`「${s.name}」を削除しますか？環境・Tier表・相関図は残ります。`))return;void run(async()=>{await post({action:"delete-obs-set",id:s.id,revision:s.revision});if(current?.id===s.id)select(null);await sets.load(sets.index);});}}>セットを削除</button></div></div>)}{pager("セット",sets)}</section>
  </main>;
}
