"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { parseObsSet, type ObsSet } from "@/lib/creator/obs-set";
import { creatorRead, type CreatorPage, type TierSummary } from "@/lib/creator/pagination";
import type { CorrelationSummary, getObsSet } from "@/lib/creator/independent-server";
import { CreatorPager, useCreatorPage } from "./CreatorPager";
import { useUnsavedChanges } from "./useUnsavedChanges";
import styles from "./Creator.module.css";

type Selection = Awaited<ReturnType<typeof getObsSet>>;
type Mode = "tier" | "correlation" | "both";
export function ObsSetEditor({ initial }: { initial: { sets: CreatorPage<ObsSet>; tiers: CreatorPage<TierSummary>; correlations: CreatorPage<CorrelationSummary>; selection: Selection | null } }) {
  const sets = useCreatorPage<ObsSet, CreatorPage<ObsSet>>("obs-sets", initial.sets);
  const tiers = useCreatorPage<TierSummary, CreatorPage<TierSummary>>("works", initial.tiers);
  const correlations = useCreatorPage<CorrelationSummary, CreatorPage<CorrelationSummary>>("correlations", initial.correlations);
  const [current, setCurrent] = useState(initial.selection?.set ?? null);
  const [name, setName] = useState(current?.name ?? "新しいOBSセット");
  const [tierId, setTierId] = useState(current?.tier_work_id ?? ""), [correlationId, setCorrelationId] = useState(current?.correlation_id ?? "");
  const [tierName, setTierName] = useState(initial.selection?.tier?.work.document.title ?? ""), [correlationName, setCorrelationName] = useState(initial.selection?.correlation?.correlation.document.title ?? "");
  const [mode, setMode] = useState<Mode>(current?.tier_work_id ? current.correlation_id ? "both" : "tier" : current?.correlation_id ? "correlation" : "both");
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
    setMode(s?.tier_work_id ? s.correlation_id ? "both" : "tier" : s?.correlation_id ? "correlation" : "both"); setDirty(false);
    window.history.replaceState(null, "", `/admin/creator/obs-sets${s ? `?set=${s.id}` : ""}`);
  }
  const url = current ? `/admin/obs/composition/${current.id}${transparent ? "?transparent=1" : ""}` : "";
  const pager = (label: string, list: typeof tiers | typeof correlations | typeof sets) => <CreatorPager label={label} index={list.index} hasNext={!!list.page.nextCursor} busy={busy} loading={list.loading} error={list.error} onPage={i=>void run(()=>list.load(i))} onRetry={()=>void run(()=>list.load(list.retryTarget))} />;
  return <main className={styles.page}>
    <header className={styles.header}><h1>OBS表示セット</h1><Link className={styles.button} href="/admin?section=tools" aria-disabled={busy} onClick={e=>{if(busy||active.current||!confirmLeave())e.preventDefault();}}>運用ツールへ戻る</Link></header>
    {notice && <p role={notice.error ? "alert" : "status"} className={notice.error ? styles.error : styles.notice}>{notice.text}</p>}
    <section className={styles.panel} aria-label="セット編集"><div className={styles.toolbar}><button disabled={busy} onClick={()=>{if(confirmLeave()){select(null);setNotice(null);}}}>新しいセット</button><span>{dirty ? "未保存の変更あり" : current ? "保存済み" : "新規セット（未保存）"}</span></div>
      <label>セット名<input value={name} maxLength={120} disabled={busy} onChange={e=>{setName(e.target.value);setDirty(true);}} /></label>
      <fieldset className={styles.toolbar}><legend>表示内容</legend>{([['tier','Tier表のみ'],['correlation','相関図のみ'],['both','Tier表＋相関図']] as const).map(([value,label])=><label key={value} className={styles.check} style={{ minHeight: 44, whiteSpace: "nowrap" }}><input type="radio" style={{ width: 18, height: 18, minHeight: 18, padding: 0, flexShrink: 0 }} name="display-mode" value={value} checked={mode===value} disabled={busy} onChange={()=>{setMode(value);setDirty(true);}} />{label}</label>)}</fieldset>
      {mode!=='correlation' && <div><label>表示するTier表<select aria-label="表示するTier表" value={tierId} disabled={busy} onChange={e=>{setTierId(e.target.value);setTierName(tiers.page.items.find(w=>w.id===e.target.value)?.title ?? "");setDirty(true);}}><option value="">選択してください</option>{tierId&&!tiers.page.items.some(w=>w.id===tierId)&&<option value={tierId}>{tierName||"無題のTier表"}（選択中）</option>}{tiers.page.items.map(w=><option value={w.id} key={w.id}>{w.title||"無題のTier表"}</option>)}</select></label>{pager("Tier表",tiers)}</div>}
      {mode!=='tier' && <div><label>表示する相関図<select aria-label="表示する相関図" value={correlationId} disabled={busy} onChange={e=>{setCorrelationId(e.target.value);setCorrelationName(correlations.page.items.find(w=>w.id===e.target.value)?.title ?? "");setDirty(true);}}><option value="">選択してください</option>{correlationId&&!correlations.page.items.some(w=>w.id===correlationId)&&<option value={correlationId}>{correlationName||"無題の相関図"}（選択中）</option>}{correlations.page.items.map(w=><option value={w.id} key={w.id}>{w.title||"無題の相関図"}</option>)}</select></label>{pager("相関図",correlations)}</div>}
      <p className={styles.muted}>上にTier表、下に相関図を表示します。作品を保存した後はOBSページを再読み込みしてください。</p>
      <button className={styles.primary} disabled={busy || !name.trim() || (mode!=="correlation"&&!tierId) || (mode!=="tier"&&!correlationId)} onClick={()=>void run(async()=>{
        const values=parseObsSet({name,tier_work_id:mode==="correlation"?null:tierId,correlation_id:mode==="tier"?null:correlationId});
        const result=await post({action:"save-obs-set",id:current?.id,revision:current?.revision,values});setCurrent(result.set);setName(result.set.name);setDirty(false);window.history.replaceState(null,"",`?set=${result.set.id}`);await sets.load(0);setNotice({error:false,text:"OBSセットを保存しました。"});
      })}>{busy?"処理中…":"セットを保存"}</button>
      {current && <div className={styles.toolbar}><label className={styles.check}><input type="checkbox" checked={transparent} onChange={e=>setTransparent(e.target.checked)} />OBSの背景を透明にする</label><a className={styles.button} href={url} target="_blank" rel="noreferrer">OBS表示を開く</a><button disabled={busy} onClick={()=>void run(async()=>{await navigator.clipboard.writeText(new URL(url,window.location.origin).href);setNotice({error:false,text:"OBS URLをコピーしました。"});})}>OBS URLをコピー</button><input aria-label="OBS URL" value={url} readOnly />{dirty&&<p>OBSには最後に保存したセットが表示されます。</p>}</div>}
    </section>
    <section className={styles.panel} aria-label="保存済みOBSセット"><h2>保存済みOBSセット</h2>{!sets.page.items.length&&<p>このページにセットはありません。</p>}{sets.page.items.map(s=><div className={styles.work} key={s.id}><div><strong>{s.name}</strong><p className={styles.muted}>{new Date(s.updated_at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})}（日本時間）</p></div><div className={styles.toolbar}><button disabled={busy} onClick={()=>{if(confirmLeave())void run(async()=>select(await creatorRead<Selection>("obs-set",s.id)));}}>再編集</button><a className={styles.button} href={`/admin/obs/composition/${s.id}`} target="_blank" rel="noreferrer">OBS</a><button disabled={busy} onClick={()=>{if(!confirmLeave()||!window.confirm(`「${s.name}」を削除しますか？Tier表と相関図は残ります。`))return;void run(async()=>{await post({action:"delete-obs-set",id:s.id,revision:s.revision});if(current?.id===s.id)select(null);await sets.load(sets.index);});}}>セットを削除</button></div></div>)}{pager("セット",sets)}</section>
  </main>;
}
