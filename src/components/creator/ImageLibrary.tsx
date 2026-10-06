"use client";
/* eslint-disable @next/next/no-img-element */
import { imageUrl, type CreatorImage, type ImageDrag } from "@/lib/creator/model";
import styles from "./Creator.module.css";

export const DRAG_TYPE = "application/x-sv-creator-image";
export function beginImageDrag(event: React.DragEvent, value: ImageDrag) {
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(value));
  event.dataTransfer.effectAllowed = value.rowId ? "move" : "copy";
}

export function ImageLibrary({ images, decks, busy, onUpload, onMutation, onSelect }: {
  images: CreatorImage[]; decks: { id: string; name: string }[]; busy: boolean;
  onUpload: (files: File[], image?: CreatorImage) => void;
  onMutation: (body: Record<string, unknown>, confirmation?: string) => void;
  onSelect: (drag: ImageDrag) => void;
}) {
  function filesSelected(files: FileList | null, image?: CreatorImage) { if (files?.length) onUpload(Array.from(files), image); }
  return <section className={styles.panel} aria-label="画像ライブラリ">
    <h2>画像ライブラリ</h2>
    <p className={styles.muted}>画像をTierへドラッグ。または「配置する」→配置先を選択。</p>
    <div className={styles.drop} onDragOver={e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (!busy) filesSelected(e.dataTransfer.files); }}>
      <label>画像をドロップ / ファイル選択<input aria-label="画像アップロード" type="file" accept=".jpg,.jpeg,.png,.webp" multiple disabled={busy} onChange={e => { filesSelected(e.target.files); e.target.value = ""; }} /></label>
      <p className={styles.muted}>JPG・PNG・WEBP / 1枚4MBまで。透明PNG対応。</p>
    </div>
    {!images.length && <p className={styles.muted}>まずデッキ画像を追加してください。</p>}
    <div className={styles.library}>
      {images.map(image => <article className={styles.asset} key={`${image.id}-${image.revision}`}>
        <img src={imageUrl(image)} alt={image.name} width={96} height={96} draggable={!busy} onDragStart={e => beginImageDrag(e, { imageId: image.id })} />
        <h3 className="break-words">{image.name}</h3>
        <button disabled={busy} onClick={() => onSelect({ imageId: image.id })}>配置する</button>
        <details><summary>画像の管理</summary>
          <form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); onMutation({ action: "edit-image", id: image.id, revision: image.revision, name: form.get("name"), archetypeId: form.get("archetypeId") }); }}>
            <label>画像名<input name="name" defaultValue={image.name} maxLength={120} required disabled={busy} /></label>
            <label>標準デッキ<select name="archetypeId" defaultValue={image.archetype_id ?? ""} disabled={busy}><option value="">関連付けなし</option>{decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <button disabled={busy}>画像情報を保存</button>
            <label>画像を差し替え<input type="file" accept=".jpg,.jpeg,.png,.webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file && window.confirm("この画像を使うすべてのTier表にも反映されます。差し替えますか？")) onUpload([file], image); e.target.value = ""; }} /></label>
            <button type="button" disabled={busy} onClick={() => onMutation({ action: "delete-image", id: image.id, revision: image.revision }, `「${image.name}」を削除しますか？保存済み作品で使用中の画像は削除できません。`)}>画像を削除</button>
          </form>
        </details>
      </article>)}
    </div>
    <button disabled={busy} onClick={() => onMutation({ action: "cleanup" })}>ストレージ整理を再試行</button>
  </section>;
}
