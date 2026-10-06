"use client";
import { useEffect, useRef, useState } from "react";
import { TierArtworkView, useTierImageLayout } from "./TierArtwork";
import { beginImageDrag, DRAG_TYPE } from "./ImageLibrary";
import { tierImagePosition, tierTextColor, type CreatorImage, type ImageDrag, type TierDocument } from "@/lib/creator/model";
import styles from "./Creator.module.css";

/** Editing is a sibling overlay; exports clone only the pristine artwork. */
export function TierCanvas({ document: doc, images, transparent, disabled, selected, onSelect, onRow, onName, onPlace }: {
  document: TierDocument; images: CreatorImage[]; transparent: boolean; disabled: boolean; selected: ImageDrag | null;
  onSelect: (drag: ImageDrag) => void; onRow: (id: string) => void; onName: (id: string, name: string) => void;
  onPlace: (drag: ImageDrag, rowId: string, index: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null), [width,setWidth] = useState(0), [fitWidth,setFitWidth]=useState<number>();
  useEffect(() => {
    const element=host.current;
    if(!element)return;
    const measure=()=>{
      setWidth(element.clientWidth);
      // Reserve the adjacent upload heading + thumbnail strip, including wrapped headers.
      const top=element.getBoundingClientRect().top+window.scrollY;
      const board=element.closest('section[aria-label="Tier編集"]');
      const heading=board?.querySelector<HTMLElement>('[data-library-heading]'), strip=board?.querySelector<HTMLElement>('[data-library-strip]');
      const reserved=(heading?.offsetHeight??60)+(strip?.offsetHeight??123)+32;
      setFitWidth(window.innerWidth>900?Math.max(180,window.innerHeight-top-reserved)*16/9:undefined);
    };
    const observer=new ResizeObserver(measure);observer.observe(element);observer.observe(element.closest('main')!);
    window.addEventListener('resize',measure);measure();
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[]);
  const resolved = useTierImageLayout(doc, images);
  const { layout, ready } = resolved;
  let top = 0;
  function startDrag(event: React.DragEvent, drag: ImageDrag, rowIndex: number, index: number) {
    beginImageDrag(event, drag);
    const image = host.current?.querySelector<HTMLImageElement>(`img[data-tier-row="${rowIndex}"][data-tier-index="${index}"]`);
    if (!image) return;
    const bounds = image.getBoundingClientRect();
    // A DOM wrapper keeps the preview at its displayed size, even for high-resolution originals.
    const preview = window.document.createElement("div"), copy = image.cloneNode() as HTMLImageElement;
    Object.assign(preview.style, { position: "fixed", left: "-10000px", top: "0", width: `${bounds.width}px`, height: `${bounds.height}px`, pointerEvents: "none" });
    Object.assign(copy.style, { position: "static", width: "100%", height: "100%" });
    preview.append(copy); window.document.body.append(preview);
    event.dataTransfer.setDragImage(preview, Math.max(0, event.clientX - bounds.left), Math.max(0, event.clientY - bounds.top));
    window.setTimeout(() => preview.remove(), 0);
  }
  function drop(event: React.DragEvent, rowId: string, index: number) {
    event.preventDefault(); event.stopPropagation();
    if (disabled) return;
    try { onPlace(JSON.parse(event.dataTransfer.getData(DRAG_TYPE)),rowId,index); } catch { /* External files belong to the library. */ }
  }
  return <div ref={host} data-tier-preview className={`${styles.canvasHost} ${styles.tierFit}`} style={{maxWidth:fitWidth}}>
    <div style={{position:"absolute",inset:0,width:1920,height:1080,transform:`scale(${width/1920})`,transformOrigin:"top left"}}>
      <TierArtworkView document={doc} images={images} transparent={transparent} {...resolved} />
      <div data-tier-edit-overlay style={{position:"absolute",left:48,top:doc.showTitle?120:48,width:1824,transform:`scale(${layout.scale})`,transformOrigin:"top center"}}>
        {doc.rows.map((row,rowIndex)=>{
          const y=top; top+=layout.heights[rowIndex]+8;
          return <section key={row.id} aria-label={`Tier ${row.name}`} style={{position:"absolute",left:0,top:y,width:1824,height:layout.heights[rowIndex]}} onDragOver={e=>{if(!disabled && e.dataTransfer.types.includes(DRAG_TYPE))e.preventDefault();}} onDrop={e=>drop(e,row.id,row.imageIds.length)}>
            <textarea aria-label={`${rowIndex+1}行目のTier名`} value={row.name} maxLength={40} disabled={disabled} onFocus={()=>onRow(row.id)} onChange={e=>onName(row.id,e.target.value.replace(/\n/g,""))} className={styles.canvasName} style={{background:row.color,color:tierTextColor(row.color),fontSize:Math.min(28,Math.floor(Math.sqrt(136*(layout.heights[rowIndex]-24)/Math.max(1,row.name.length))*0.8))}} />
            <div className={styles.canvasItems} style={{position:"absolute",left:160,top:0,width:1664,height:"100%"}}>
              {row.imageIds.map((id,index)=>{const drag={imageId:id,rowId:row.id,index};return <button key={`${id}-${index}`} type="button" aria-label={`${images.find(i=>i.id===id)?.name??"画像"}を選択 (${row.name} ${index+1})`} disabled={disabled || !ready} draggable={!disabled && ready} onDragStart={e=>startDrag(e,drag,rowIndex,index)} onDrop={e=>drop(e,row.id,index)} onClick={()=>{onSelect(drag);onRow(row.id);}} className={styles.canvasImage} data-selected={selected?.rowId===row.id && selected.index===index} style={tierImagePosition(layout,index,rowIndex)} />;})}
            </div>
          </section>;
        })}
      </div>
    </div>
  </div>;
}
