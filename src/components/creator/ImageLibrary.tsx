"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { imageUrl, type CreatorImage, type ImageDrag } from "@/lib/creator/model";
import styles from "./Creator.module.css";

export const DRAG_TYPE = "application/x-sv-creator-image";
export function beginImageDrag(event: React.DragEvent, value: ImageDrag) {
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(value));
  event.dataTransfer.effectAllowed = value.rowId ? "move" : "copy";
}
export type UploadPreview = { id: string; name: string; url?: string; error?: string };
export function ImageLibrary({ images, decks, busy, pending = [], onUpload, onMutation, onSelect }: {
  images: CreatorImage[]; decks: { id: string; name: string }[]; busy: boolean; pending?: UploadPreview[];
  onUpload: (files: File[], image?: CreatorImage) => void;
  onMutation: (body: Record<string, unknown>, confirmation?: string) => void;
  onSelect: (drag: ImageDrag) => void;
}) {
  const [selected,setSelected] = useState("");
  const image = images.find(i=>i.id===selected);
  function filesSelected(files: FileList | null) { if (files?.length) onUpload(Array.from(files)); }
  return <section className={styles.panel} aria-label="画像ライブラリ">
    <h2>画像ライブラリ</h2>
    <p className={styles.muted}>画像をTierへドラッグ。クリックで配置先の選択・画像の管理ができます。</p>
    <div className={styles.drop} onDragOver={e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (!busy) filesSelected(e.dataTransfer.files); }}>
      <label>画像をドロップ / ファイル選択<input aria-label="画像アップロード" type="file" accept=".jpg,.jpeg,.png,.webp" multiple disabled={busy} onChange={e => { filesSelected(e.target.files); e.target.value = ""; }} /></label>
      <p className={styles.muted}>JPG・PNG・WEBP / 1枚4MBまで。透明PNG対応。</p>
    </div>
    {!images.length && !pending.length && <p className={styles.muted}>まずデッキ画像を追加してください。</p>}
    <div className={styles.library}>
      {pending.map(p=><article key={p.id} className={styles.asset} aria-busy={!p.error}>{p.url && <img src={p.url} alt="" width={96} height={96} />}<span>{p.name}</span><small className={p.error?styles.error:styles.muted}>{p.error?`失敗：${p.error}`:"処理中…"}</small></article>)}
      {images.map(asset => <article className={styles.asset} key={asset.id}>
        <button type="button" className={styles.thumbnail} aria-label={`${asset.name}を選択`} aria-pressed={selected===asset.id} disabled={busy} draggable={!busy} onDragStart={e=>beginImageDrag(e,{imageId:asset.id})} onClick={()=>{setSelected(asset.id);onSelect({imageId:asset.id});}}>
          <img src={imageUrl(asset)} alt={asset.name} width={96} height={96} draggable={false} />
          <span title={asset.name}>{asset.name}</span>
        </button>
      </article>)}
    </div>
    {image && <section aria-label="選択画像の管理" className={styles.selection}>
      <div className={styles.header}><h3>{image.name}</h3><button type="button" onClick={()=>setSelected("")}>管理を閉じる</button></div>
      <form key={`${image.id}-${image.revision}`} className={styles.manageForm} onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);onMutation({action:"edit-image",id:image.id,revision:image.revision,name:form.get("name"),archetypeId:form.get("archetypeId")});}}>
        <label>画像名<input name="name" defaultValue={image.name} maxLength={120} required disabled={busy} /></label>
        <label>標準デッキ<select name="archetypeId" defaultValue={image.archetype_id??""} disabled={busy}><option value="">関連付けなし</option>{decks.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <button disabled={busy}>画像情報を保存</button>
        <label>画像を差し替え<input type="file" accept=".jpg,.jpeg,.png,.webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file && window.confirm("この画像を使うTier表・相関図にも反映されます。差し替えますか？"))onUpload([file],image);e.target.value="";}} /></label>
        <button type="button" disabled={busy} onClick={()=>onMutation({action:"delete-image",id:image.id,revision:image.revision},`「${image.name}」を削除しますか？保存済み作品で使用中の画像は削除できません。`)}>画像を削除</button>
      </form>
    </section>}
    <details><summary>ストレージ管理</summary><button disabled={busy} onClick={()=>onMutation({action:"cleanup"})}>ストレージ整理を再試行</button></details>
  </section>;
}
