"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedChanges } from "./useUnsavedChanges";
import { newTierDocument, imageUrl, placeImage, parseTierDocument, validateImageFile, type CreatorImage, type ImageDrag, type TierDocument, type TierRow, type TierWork } from "@/lib/creator/model";
import { ImageLibrary, beginImageDrag, DRAG_TYPE } from "./ImageLibrary";
import { TierPreview } from "./TierPreview";
import { saveTierPng } from "@/lib/creator/png";
import { prepareCreatorUpload } from "@/lib/creator/upload";
import styles from "./Creator.module.css";

type Data = { images: CreatorImage[]; works: TierWork[]; decks: { id: string; name: string }[]; correlations: { id: string; tier_work_id: string }[] };
export function TierEditor({ initial, initialDocument, initialWorkId }: { initial: Data; initialDocument: TierDocument; initialWorkId?: string }) {
  const router = useRouter();
  const initialWork = initial.works.find(w => w.id === initialWorkId) ?? null;
  const [data, setData] = useState(initial);
  const [doc, setDoc] = useState(initialWork?.document ?? initialDocument);
  const [current, setCurrent] = useState<TierWork | null>(initialWork);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState<ImageDrag | null>(null);
  const [transparent, setTransparent] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const confirmLeave = useUnsavedChanges(dirty);
  const hasCorrelation = (tierId: string) => data.correlations.some(c => c.tier_work_id === tierId);
  function openCorrelation(work: TierWork) {
    if (!confirmLeave()) return;
    void run(async () => {
      if (!hasCorrelation(work.id)) await request({ action: "create-correlation", tierId: work.id, tierRevision: work.revision });
      setDirty(false);
      router.push(`/admin/creator/tier/${work.id}/correlation`);
    });
  }
  const edit = (next: TierDocument) => { setDoc(next); setDirty(true); };
  async function request(body: Record<string, unknown> | FormData) {
    const response = await fetch("/admin/creator/api", { method: "POST", ...(body instanceof FormData ? { body } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "処理に失敗しました。");
    return result;
  }
  async function run(task: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setNotice(null);
    try { await task(); }
    catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "処理に失敗しました。" }); }
    finally { operation.current = false; setBusy(false); }
  }
  function mutation(body: Record<string, unknown>, confirmation?: string) {
    if (body.action === "delete-image" && doc.rows.some(r => r.imageIds.includes(String(body.id)))) { setNotice({ error: true, text: "編集中のTier表で使用中です。先にTierから取り除いてください。" }); return; }
    if (confirmation && !window.confirm(confirmation)) return;
    void run(async () => {
      const result = await request(body); setData(result);
      if (body.action === "delete-work" && current?.id === body.id) { setCurrent(null); setDirty(true); }
      setNotice({ error: false, text: result.warning ?? "変更を保存しました。" });
    });
  }
  function upload(files: File[], image?: CreatorImage) {
    void run(async () => {
      files.forEach(validateImageFile);
      let count = 0;
      for (const file of files) {
        try {
          const prepared = await prepareCreatorUpload(file);
          const form = new FormData(); form.set("file", prepared); form.set("name", file.name.slice(0, 120));
          if (image) { form.set("id", image.id); form.set("revision", String(image.revision)); }
          const result = await request(form); setData(result); count++;
        }
        catch (error) { throw Error(`${count}枚保存済み。${error instanceof Error ? error.message : "アップロードに失敗しました。"}`); }
      }
      setNotice({ error: false, text: `${count}枚の画像を保存しました。` });
    });
  }
  function setRow(rowId: string, change: Partial<TierRow>) { edit({ ...doc, rows: doc.rows.map(r => r.id === rowId ? { ...r, ...change } : r) }); }
  function moveRow(index: number, offset: number) {
    const rows = [...doc.rows]; const [row] = rows.splice(index, 1); rows.splice(index + offset, 0, row); edit({ ...doc, rows });
  }
  function place(drag: ImageDrag, rowId: string, index: number) {
    if (busy || !data.images.some(image => image.id === drag.imageId)) return;
    const next = placeImage(doc, drag, rowId, index);
    try { parseTierDocument(next); edit(next); setSelected(null); }
    catch (error) { setNotice({ error: true, text: (error as Error).message }); }
  }
  function drop(e: React.DragEvent, rowId: string, index: number) {
    e.preventDefault(); e.stopPropagation();
    try { place(JSON.parse(e.dataTransfer.getData(DRAG_TYPE)), rowId, index); } catch { /* Ignore external drags. */ }
  }
  function openWork(work: TierWork | null) {
    if (dirty && !window.confirm("未保存の変更があります。破棄して切り替えますか？")) return;
    setCurrent(work); setDoc(work?.document ?? newTierDocument()); setDirty(false); setSelected(null); setNotice(null);
  }
  return <main className={styles.page}>
    <header className={styles.header}><div><p className={styles.muted}>コンテンツ制作</p><h1>Tier表メーカー</h1><p className={styles.muted}>画像を置いて、名前を整えて、PNG・OBSへ。</p></div><Link href="/admin?section=tools" className={styles.button} onClick={e => { if (dirty && !window.confirm("未保存の変更を破棄して管理画面へ戻りますか？")) e.preventDefault(); }}>管理画面へ</Link></header>
    {notice && <p role={notice.error ? "alert" : "status"} className={`${styles.notice} ${notice.error ? styles.error : ""}`}>{notice.text}</p>}
    <div className={styles.toolbar} aria-busy={busy}>
      <button disabled={busy} onClick={() => openWork(null)}>新しいTier表</button>
      <button className={styles.primary} disabled={busy} onClick={() => void run(async () => {
        const result = await request({ action: "save", id: current?.id, revision: current?.revision, document: parseTierDocument(doc) });
        setCurrent(result.work); setData(old => ({ ...old, works: [result.work, ...old.works.filter(w => w.id !== result.work.id)] })); setDirty(false); setNotice({ error: false, text: "Tier表を保存しました。OBSはページ更新で反映されます。" });
      })}>{busy ? "処理中…" : "Tier表を保存"}</button>
      <button disabled={busy} onClick={() => void run(async () => { const artwork = preview.current?.querySelector<HTMLElement>("[data-tier-artwork]"); if (!artwork) return; await saveTierPng(artwork); setNotice({ error: false, text: "1920×1080 PNGを出力しました。" }); })}>PNG出力</button>
      {current && <a className={styles.button} href={`/admin/obs/tier/${current.id}${transparent ? "?transparent=1" : ""}`} target="_blank" rel="noreferrer">OBS表示を開く</a>}
      {current && <button disabled={busy || dirty} onClick={() => openCorrelation(current)}>{hasCorrelation(current.id) ? "相関図を編集" : "相関図を追加"}</button>}
      {current && hasCorrelation(current.id) && <a className={styles.button} href={`/admin/obs/set/${current.id}${transparent ? "?transparent=1" : ""}`} target="_blank" rel="noreferrer">セットOBS</a>}
      <span className={styles.muted}>{dirty ? "未保存の変更あり" : current ? "保存済み" : "新規作品"}</span>
      {dirty && current && <span className={styles.muted}>相関図へ進む前にTier表を保存してください。</span>}
    </div>
    <div className={styles.columns}>
      <ImageLibrary images={data.images} decks={data.decks} busy={busy} onUpload={upload} onMutation={mutation} onSelect={setSelected} />
      <div className="grid gap-5">
        <section className={styles.panel}>
          <label>作品タイトル<input value={doc.title} maxLength={120} disabled={busy} onChange={e => edit({ ...doc, title: e.target.value })} /></label>
          <div className={styles.toolbar}><label className={styles.check}><input type="checkbox" checked={doc.showTitle} disabled={busy} onChange={e => edit({ ...doc, showTitle: e.target.checked })} />タイトルを表示</label><label className={styles.check}><input type="checkbox" checked={transparent} disabled={busy} onChange={e => setTransparent(e.target.checked)} />PNG・OBSの背景を透明にする</label></div>
        </section>
        <section className={styles.panel} aria-label="Tier編集">
          <div className={styles.header}><h2>Tierを編集</h2><button disabled={busy || doc.rows.length >= 30} onClick={() => edit({ ...doc, rows: [...doc.rows, { id: crypto.randomUUID(), name: `Tier ${doc.rows.length + 1}`, color: "#c4b5fd", imageIds: [] }] })}>Tier行を追加</button></div>
          {selected && <div role="status" className={styles.notice}>配置先の「ここに配置」を選んでください。<button onClick={() => setSelected(null)}>キャンセル</button></div>}
          {doc.rows.map((row, rowIndex) => <section key={row.id} aria-label={`Tier ${row.name}`} className={styles.row} style={{ borderLeftColor: row.color }} onDragOver={e => { if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault(); }} onDrop={e => drop(e, row.id, row.imageIds.length)}>
            <div className={styles.rowControls}>
              <input aria-label={`${rowIndex + 1}行目のTier名`} value={row.name} maxLength={40} disabled={busy} onChange={e => setRow(row.id, { name: e.target.value })} />
              <input aria-label={`${rowIndex + 1}行目の背景色`} type="color" value={row.color} disabled={busy} onChange={e => setRow(row.id, { color: e.target.value })} />
              <div className={styles.toolbar}><button aria-label={`${rowIndex + 1}行目を上へ`} disabled={busy || rowIndex === 0} onClick={() => moveRow(rowIndex, -1)}>↑</button><button aria-label={`${rowIndex + 1}行目を下へ`} disabled={busy || rowIndex === doc.rows.length - 1} onClick={() => moveRow(rowIndex, 1)}>↓</button><button disabled={busy || doc.rows.length === 1} onClick={() => { if (!row.imageIds.length || window.confirm("このTier行と画像の配置を削除しますか？ライブラリの画像は残ります。")) edit({ ...doc, rows: doc.rows.filter(r => r.id !== row.id) }); }}>行を削除</button></div>
            </div>
            <div className={styles.items}>
              {!row.imageIds.length && <p className={styles.muted}>ここへ画像をドロップ</p>}
              {row.imageIds.map((id, index) => { const image = data.images.find(i => i.id === id); const drag = { imageId: id, rowId: row.id, index }; return <div key={`${id}-${index}`} className={styles.item} onDrop={e => drop(e, row.id, index)}>
                {image ? <img src={imageUrl(image)} alt={image.name} width={96} height={96} draggable={!busy} onDragStart={e => beginImageDrag(e, drag)} /> : <span>画像なし</span>}
                <div className={styles.toolbar}><button disabled={busy || index === 0} aria-label={`${image?.name ?? "画像"}を左へ`} onClick={() => place(drag, row.id, index - 1)}>←</button><button disabled={busy || index === row.imageIds.length - 1} aria-label={`${image?.name ?? "画像"}を右へ`} onClick={() => place(drag, row.id, index + 2)}>→</button></div>
                <button disabled={busy} onClick={() => setSelected(drag)}>別Tierへ移動</button><button disabled={busy} onClick={() => setRow(row.id, { imageIds: row.imageIds.filter((_, i) => i !== index) })}>取り除く</button>
              </div>; })}
            </div>
            {selected && <button disabled={busy} onClick={() => place(selected, row.id, row.imageIds.length)}>ここに配置：{row.name}</button>}
          </section>)}
        </section>
        <section className={styles.panel}>
          <h2>プレビュー</h2><div ref={preview}><TierPreview document={doc} images={data.images} transparent={transparent} /></div>
          <p className={styles.muted}>1920×1080。行・画像が多い場合は全体を縮小します。OBSは保存済み内容を表示します。</p>
        </section>
      </div>
    </div>
    <section className={styles.panel} aria-label="保存済み作品"><h2>保存済みTier表</h2>{!data.works.length && <p className={styles.muted}>保存した作品がここに表示されます。</p>}{data.works.map(work => <div key={work.id} className={styles.work}><div><strong>{work.document.title || "無題のTier表"}</strong><p className={styles.muted}>{new Date(work.updated_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}（日本時間）</p></div><div className={styles.toolbar}><button disabled={busy} onClick={() => openWork(work)}>再編集</button><button disabled={busy} onClick={() => openCorrelation(work)}>{hasCorrelation(work.id) ? "相関図を編集" : "相関図を追加"}</button><button disabled={busy} onClick={() => mutation({ action: "delete-work", id: work.id, revision: work.revision }, "保存済みのTier表を削除しますか？関連する相関図がある場合は先に相関図を削除してください。")}>作品を削除</button></div></div>)}</section>
  </main>;
}
