"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { CorrelationSummary } from "@/lib/creator/independent-server";
import type { CreatorPage } from "@/lib/creator/pagination";
import { CreatorPager, useCreatorPage } from "./CreatorPager";
import styles from "./Creator.module.css";

export function CorrelationList({ initial }: { initial: CreatorPage<CorrelationSummary> }) {
  const list = useCreatorPage<CorrelationSummary, CreatorPage<CorrelationSummary>>("correlations", initial);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const running = useRef(false);
  async function run(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError("");
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : "処理に失敗しました。"); }
    finally { running.current = false; setBusy(false); }
  }
  return <main className={styles.page}>
    <header className={styles.header}><h1>相関図メーカー</h1><Link href="/admin/creator" className={styles.button}>クリエイターツールへ</Link></header>
    <div className={styles.toolbar}><Link className={styles.primary} href="/admin/creator/correlation/new">＋ 新しい相関図</Link><Link className={styles.button} href="/admin/creator/tier">Tier表から相関図を作成</Link><Link className={styles.button} href="/admin/creator/images">共通画像ライブラリ</Link></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <section className={styles.panel} aria-label="保存済み相関図"><h2>保存済み相関図</h2>
      {!list.page.items.length && <p>このページに相関図はありません。</p>}
      {list.page.items.map(work => <div className={styles.work} key={work.id}><div><strong>{work.title || "無題の相関図"}</strong><p className={styles.muted}>{new Date(work.updated_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}（日本時間）{work.tier_work_id ? " · Tier表から作成" : " · 独立した相関図"}</p></div><div className={styles.toolbar}><Link href={`/admin/creator/correlation/${work.id}`} className={styles.button}>編集</Link><a href={`/admin/obs/correlation-work/${work.id}`} className={styles.button} target="_blank" rel="noreferrer">OBS</a><button disabled={busy} onClick={()=>{if(!window.confirm(`「${work.title || "無題の相関図"}」を削除しますか？OBSセットで使用中の場合は削除できません。`))return;void run(async()=>{const response=await fetch("/admin/creator/api",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete-correlation",id:work.id,revision:work.revision})});const result=await response.json();if(!response.ok)throw Error(result.error);await list.load(list.index);});}}>削除</button></div></div>)}
      <CreatorPager label="相関図" index={list.index} hasNext={!!list.page.nextCursor} busy={busy} loading={list.loading} error={list.error} onPage={i=>void run(()=>list.load(i))} onRetry={()=>void run(()=>list.load(list.retryTarget))} />
    </section>
  </main>;
}
