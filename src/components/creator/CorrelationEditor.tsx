"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { CreatorImage, TierWork } from "@/lib/creator/model";
import { boundNode, parseCorrelation, removeNode, type CorrelationDocument, type CorrelationNode, type CorrelationWork } from "@/lib/creator/correlation";
import { saveArtworkPng } from "@/lib/creator/png";
import { useUnsavedChanges } from "./useUnsavedChanges";
import { CorrelationCanvas } from "./CorrelationCanvas";
import styles from "./Creator.module.css";

export function CorrelationEditor({ tier, initial, images }: { tier: TierWork; initial: CorrelationWork; images: CreatorImage[] }) {
  const router = useRouter();
  const [work,setWork] = useState(initial), [doc,setDoc] = useState(initial.document);
  const [dirty,setDirty] = useState(false), [busy,setBusy] = useState(false), [transparent,setTransparent] = useState(false);
  const [selected,setSelected] = useState(initial.document.nodes[0]?.id ?? "");
  const [source,setSource] = useState(initial.document.nodes[0]?.id ?? ""), [target,setTarget] = useState(initial.document.nodes[1]?.id ?? "");
  const [asset,setAsset] = useState(images[0]?.id ?? "");
  const [notice,setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const operation = useRef(false), preview = useRef<HTMLDivElement>(null);
  const confirmLeave = useUnsavedChanges(dirty);
  const name = (imageId: string) => images.find(i => i.id === imageId)?.name ?? "画像なし";
  const nodeName = (nodeId: string) => { const index = doc.nodes.findIndex(n => n.id === nodeId); return index < 0 ? "削除済み" : `${index + 1}. ${name(doc.nodes[index].imageId)}`; };
  const selectedNode = doc.nodes.find(n => n.id === selected);
  function edit(next: CorrelationDocument) { setDoc(next); setDirty(true); }
  function move(node: CorrelationNode) { setDoc(old => ({ ...old, nodes: old.nodes.map(n => n.id === node.id ? node : n) })); setDirty(true); }
  async function request(body: Record<string,unknown>) {
    const response = await fetch("/admin/creator/api",{ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "相関図を保存できませんでした。");
    return result;
  }
  async function run(task: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setNotice(null);
    try { await task(); } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : "処理に失敗しました。" }); }
    finally { operation.current = false; setBusy(false); }
  }
  function addEdge() {
    try {
      edit(parseCorrelation({ ...doc, edges: [...doc.edges,{ id: crypto.randomUUID(), sourceNodeId: source, targetNodeId: target, origin: "manual", label: "有利", visible: true }] })); setNotice(null);
    } catch (error) { setNotice({ error: true, text: (error as Error).message }); }
  }
  const obsQuery = transparent ? "?transparent=1" : "";
  return <main className={styles.page}>
    <header className={styles.header}><div><p className={styles.muted}>環境解説セット · Tier表 → 相関図</p><h1>相関図を編集</h1><p className="break-words">{tier.document.title || "無題のTier表"}</p></div><Link className={styles.button} href={`/admin/creator/tier?work=${tier.id}`} onClick={e => { if (busy || !confirmLeave()) e.preventDefault(); }}>Tier表に戻る</Link></header>
    {notice && <p role={notice.error ? "alert" : "status"} className={`${styles.notice} ${notice.error ? styles.error : ""}`}>{notice.text}</p>}
    <div className={styles.toolbar} aria-busy={busy}>
      <button className={styles.primary} disabled={busy} onClick={() => void run(async () => {
        const result = await request({ action: "save-correlation", id: work.id, revision: work.revision, document: parseCorrelation(doc) });
        setWork(result.correlation); setDirty(false); setNotice({ error: false, text: "相関図を保存しました。OBSを再読み込みすると反映されます。" });
      })}>{busy ? "処理中…" : "相関図を保存"}</button>
      <button disabled={busy} onClick={() => void run(async () => {
        const artwork = preview.current?.querySelector<HTMLElement>("[data-correlation-artwork]");
        if (artwork) { await saveArtworkPng(artwork,"correlation"); setNotice({ error: false, text: "相関図PNG（1920×1080）を出力しました。" }); }
      })}>相関図PNG</button>
      <a className={styles.button} href={`/admin/obs/set/${tier.id}${obsQuery}`} target="_blank" rel="noreferrer">セットOBS</a>
      <a className={styles.button} href={`/admin/obs/correlation/${tier.id}${obsQuery}`} target="_blank" rel="noreferrer">相関図OBS</a>
      <span className={styles.muted}>{dirty ? "未保存の変更あり" : "保存済み"}</span>
    </div>
    <div className={styles.correlationColumns}>
      <section className={styles.panel} aria-label="相関図キャンバス">
        <h2>画像を動かして、矢印でつなぐ</h2>
        <label>相関図タイトル<input value={doc.title ?? ""} maxLength={120} disabled={busy} onChange={e=>edit({...doc,title:e.target.value})} /></label>
        <p className={styles.muted}>矢印・数値はすべて手入力です。両方向の意味も自由に設定できます。画像をドラッグ、または選択して矢印キーで移動できます（Shiftで10px）。</p>
        <div ref={preview}><CorrelationCanvas document={doc} images={images} title={tier.document.title} transparent={transparent} selectedId={selected} onSelect={setSelected} onMove={move} disabled={busy} /></div>
        <div className={styles.toolbar}>
          <label className={styles.check}><input type="checkbox" checked={doc.showTitle} disabled={busy} onChange={e => edit({ ...doc,showTitle:e.target.checked })} />相関図タイトルを表示</label>
          <label className={styles.check}><input type="checkbox" checked={doc.showNames} disabled={busy} onChange={e => edit({ ...doc,showNames:e.target.checked })} />デッキ名を表示</label>
          <label className={styles.check}><input type="checkbox" checked={doc.showLabels !== false} disabled={busy} onChange={e=>edit({...doc,showLabels:e.target.checked})} />矢印ラベルを表示</label>
          <label className={styles.check}><input type="checkbox" checked={doc.showStats !== false} disabled={busy} onChange={e=>edit({...doc,showStats:e.target.checked})} />勝率・対戦数を表示</label>
          <label className={styles.check}><input type="checkbox" checked={transparent} disabled={busy} onChange={e => setTransparent(e.target.checked)} />PNG・OBSの背景を透明にする</label>
        </div>
        <p className={styles.muted}>1920×1080で保存します。重なったノード同士の矢印は、離すと表示されます。タイトルはTier表と独立して保存されます。</p>
      </section>
      <section className={styles.panel} aria-label="ノード設定"><h2>画像・位置</h2>
        <label>選択ノード<select aria-label="選択ノード" value={selected} disabled={busy} onChange={e => setSelected(e.target.value)}><option value="">選択してください</option>{doc.nodes.map(n => <option key={n.id} value={n.id}>{nodeName(n.id)}</option>)}</select></label>
        {selectedNode ? <>
          <div className={styles.toolbar}>{(["x","y"] as const).map(key => <label key={key}>{key.toUpperCase()}座標<input aria-label={`${key.toUpperCase()}座標`} type="number" min={0} max={(key === "x" ? 1920 - selectedNode.width : 1080 - selectedNode.height)} value={Math.round(selectedNode[key])} disabled={busy} onChange={e => move(boundNode(selectedNode,{ [key]: Number(e.target.value) }))} /></label>)}</div>
          <div className={styles.toolbar}><span>サイズ</span>{([ ["S",96], ["M",160], ["L",240] ] as const).map(([label,size]) => <button key={label} disabled={busy} aria-label={`画像サイズ${label}`} onClick={() => move(boundNode(selectedNode,{ width: size, height: Math.round(size * 1.15) }))}>{label}</button>)}</div>
          <button disabled={busy} onClick={() => { if (!window.confirm("このノードと接続している矢印を削除しますか？画像ライブラリとTier表は残ります。")) return; edit(removeNode(doc,selected)); if (source === selected) setSource(""); if (target === selected) setTarget(""); setSelected(""); }}>ノードを削除</button>
        </> : <p className={styles.muted}>キャンバスの画像を選択してください。</p>}
        <label>ライブラリの画像<select aria-label="追加する画像" value={asset} disabled={busy} onChange={e => setAsset(e.target.value)}>{images.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
        <button disabled={busy || !asset || doc.nodes.length >= 300} onClick={() => { const node = { id: crypto.randomUUID(), imageId: asset, x: 880, y: 448, width: 160, height: 184 }; edit({ ...doc,nodes:[...doc.nodes,node] }); setSelected(node.id); }}>画像ノードを追加</button>
        <p className={styles.muted}>作成時にTierの画像を引き継いでいます。その後の配置は独立します。画像のアップロード・差し替えはTier表の画像ライブラリから行えます。</p>
      </section>
    </div>
    <section className={styles.panel} aria-label="矢印設定"><h2>手動の相性矢印</h2>
      <div className={styles.edgeComposer}>
        <label>接続元（有利）<select aria-label="接続元" value={source} disabled={busy} onChange={e => setSource(e.target.value)}><option value="">選択してください</option>{doc.nodes.map(n => <option key={n.id} value={n.id}>{nodeName(n.id)}</option>)}</select></label>
        <label>接続先<select aria-label="接続先" value={target} disabled={busy} onChange={e => setTarget(e.target.value)}><option value="">選択してください</option>{doc.nodes.map(n => <option key={n.id} value={n.id}>{nodeName(n.id)}</option>)}</select></label>
        <button disabled={busy || !source || !target || source === target || doc.edges.length >= 600} onClick={addEdge}>矢印を追加</button>
      </div>
      {!doc.edges.length && <p className={styles.muted}>接続元・接続先を選んで矢印を追加してください。1ペア1本です。</p>}
      {doc.edges.map((edge,index) => <div key={edge.id} className={styles.edgeRow} data-edge-editor={edge.id}>
        <p className="break-words">{nodeName(edge.sourceNodeId)} {edge.type === "bidirectional" ? "↔" : "→"} {nodeName(edge.targetNodeId)}</p>
        <label>種類<select aria-label={`矢印${index+1}の種類`} value={edge.type ?? "forward"} disabled={busy} onChange={e=>edit({...doc,edges:doc.edges.map(v=>v.id===edge.id?{...v,type:e.target.value as "forward"|"bidirectional"}:v)})}><option value="forward">片方向</option><option value="bidirectional">両方向</option></select></label>
        <label>ラベル<input aria-label={`矢印${index+1}のラベル`} value={edge.label} maxLength={60} disabled={busy} onChange={e => edit({ ...doc,edges:doc.edges.map(v => v.id === edge.id ? {...v,label:e.target.value} : v) })} /></label>
        <div className={styles.toolbar}>{(["winRate","matchCount"] as const).map(key=><label key={key}>{key === "winRate" ? "勝率（%・手入力）" : "対戦数（手入力）"}<input aria-label={`矢印${index+1}の${key === "winRate" ? "勝率" : "対戦数"}`} type="number" min={0} max={key === "winRate" ? 100 : Number.MAX_SAFE_INTEGER} step={key === "winRate" ? "any" : 1} value={edge[key] ?? ""} disabled={busy} onChange={e=>edit({...doc,edges:doc.edges.map(v=>v.id===edge.id?{...v,[key]:e.target.value === "" ? null : Number(e.target.value)}:v)})} /></label>)}</div>
        <div className={styles.toolbar}><label className={styles.check}><input type="checkbox" aria-label={`矢印${index+1}を表示`} checked={edge.visible} disabled={busy} onChange={e => edit({ ...doc,edges:doc.edges.map(v => v.id === edge.id ? {...v,visible:e.target.checked} : v) })} />表示</label>
          <button disabled={busy} onClick={() => edit({ ...doc,edges:doc.edges.map(v => v.id === edge.id ? {...v,sourceNodeId:v.targetNodeId,targetNodeId:v.sourceNodeId} : v) })}>方向を反転</button>
          <button disabled={busy} onClick={() => edit({ ...doc,edges:doc.edges.filter(v => v.id !== edge.id) })}>矢印を削除</button>
        </div>
      </div>)}
    </section>
    <section className={styles.panel}><h2>相関図の管理</h2><p className={styles.muted}>相関図を削除しても、親のTier表と画像ライブラリは残ります。</p>
      <button disabled={busy} onClick={() => { if (!window.confirm("この相関図を削除しますか？未保存の編集も破棄されます。Tier表は残ります。")) return; void run(async () => { await request({action:"delete-correlation",id:work.id,revision:work.revision}); setDirty(false); router.push(`/admin/creator/tier?work=${tier.id}`); }); }}>相関図を削除</button>
    </section>
  </main>;
}
