"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { CreatorImage, TierWork } from "@/lib/creator/model";
import { boundNode, parseCorrelation, removeNode, type CorrelationDocument, type CorrelationEdge, type CorrelationNode, type CorrelationWork } from "@/lib/creator/correlation";
import { linkedDeck, matchupCandidates, sameSelection, withAutomaticData, type DataSelection, type MatchupCandidate, type MatchupData } from "@/lib/creator/matchup-data";
import { DASHBOARD_PERIODS, dashboardPeriodLabel } from "@/lib/environment-dashboard-period";
import { RANK_ATOMS } from "@/lib/rank-selection";
import { RankMultiSelect } from "@/components/RankMultiSelect";
import { formatJstDateTime } from "@/lib/utils";
import { saveArtworkPng } from "@/lib/creator/png";
import { useUnsavedChanges } from "./useUnsavedChanges";
import { CorrelationCanvas } from "./CorrelationCanvas";
import styles from "./Creator.module.css";

export function CorrelationEditor({ tier, initial, images, displayNames = {}, environments, defaultEnvironment }: { tier: TierWork; initial: CorrelationWork; images: CreatorImage[]; displayNames?: Record<string,string>; environments: {id:string;name:string}[]; defaultEnvironment:string }) {
  const router = useRouter();
  const [work,setWork] = useState(initial), [doc,setDoc] = useState(initial.document);
  const [dirty,setDirty] = useState(false), [busy,setBusy] = useState(false), [transparent,setTransparent] = useState(false);
  const [selected,setSelected] = useState(initial.document.nodes[0]?.id ?? "");
  const [actualSize,setActualSize] = useState(false);
  const [source,setSource] = useState(initial.document.nodes[0]?.id ?? ""), [target,setTarget] = useState(initial.document.nodes[1]?.id ?? "");
  const [asset,setAsset] = useState(images[0]?.id ?? "");
  const [notice,setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [candidates,setCandidates]=useState<MatchupCandidate[]|null>(null), [chosen,setChosen]=useState<string[]>([]);
  const [minimum,setMinimum]=useState(30), [threshold,setThreshold]=useState(55);
  const selection:DataSelection=doc.dataSelection??{environment:defaultEnvironment,period:"7d",ranks:RANK_ATOMS};
  const operation = useRef(false), preview = useRef<HTMLDivElement>(null);
  const confirmLeave = useUnsavedChanges(dirty);
  const name = (imageId: string) => displayNames[imageId] ?? images.find(i => i.id === imageId)?.name ?? "画像なし";
  const nodeName = (nodeId: string) => { const index = doc.nodes.findIndex(n => n.id === nodeId); return index < 0 ? "削除済み" : `${index + 1}. ${name(doc.nodes[index].imageId)}`; };
  const selectedNode = doc.nodes.find(n => n.id === selected);
  function edit(next: CorrelationDocument) { setDoc(next); setDirty(true); setCandidates(null); }
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
  async function loadData():Promise<MatchupData> {
    return request({action:"load-matchups",selection,imageIds:[...new Set(doc.nodes.map(n=>n.imageId))]});
  }
  function updateEdge(edge:CorrelationEdge) {
    if(operation.current)return;
    const next={...doc,edges:doc.edges.map(e=>e.id===edge.id?edge:e)};
    if(edge.dataSource!=="auto") {edit(next);return;}
    // Clear old-perspective values before fetching: failure must not relabel them.
    const cleared={...edge,winRate:null,matchCount:null,dataSnapshot:undefined};
    edit({...next,edges:next.edges.map(e=>e.id===edge.id?cleared:e)});
    void run(async()=>{const data=await loadData();edit({...next,dataSelection:selection,edges:next.edges.map(e=>e.id===edge.id?withAutomaticData(next,cleared,data):e)});});
  }
  function addEdge() {
    void run(async()=>{
      const automatic=!!selection.environment && !!linkedDeck(doc,source,images) && !!linkedDeck(doc,target,images);
      const edge:CorrelationEdge={id:crypto.randomUUID(),sourceNodeId:source,targetNodeId:target,origin:"manual",label:"有利",visible:true,dataSource:automatic?"auto":"manual"};
      const next=parseCorrelation({...doc,edges:[...doc.edges,edge]});edit(next);
      if(automatic){const data=await loadData();edit({...next,dataSelection:selection,edges:next.edges.map(e=>e.id===edge.id?withAutomaticData(next,e,data):e)});}
    });
  }
  function dataStatus(edge:CorrelationEdge) {
    const a=linkedDeck(doc,edge.sourceNodeId,images),b=linkedDeck(doc,edge.targetNodeId,images),snapshot=edge.dataSnapshot;
    if(!a||!b)return "デッキ未設定 — Tier表の画像管理で標準デッキを選択するか、手動入力をご利用ください。";
    if(edge.dataSource!=="auto")return "手動入力";
    if(!snapshot)return "未取得 — データを更新してください。手動入力にも切り替えられます。";
    if(!sameSelection(selection,snapshot.selection)||a!==snapshot.sourceDeckId||b!==snapshot.targetDeckId)return "条件が変更されています — 表示中の値を更新するには「データを更新」を押してください。";
    return `${edge.matchCount===0?"データなし · ":""}${snapshot.start === null ? "環境全期間" : formatJstDateTime(snapshot.start)} 〜 ${formatJstDateTime(snapshot.end)}（終了時刻を含まない）· 取得 ${formatJstDateTime(snapshot.aggregatedAt)}`;
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
        <p className={styles.muted}>標準デッキを設定した画像同士をつなぐと、接続元から見た勝率・対戦数が入ります。両方向矢印も数値は接続元側の視点です。画像はドラッグ・矢印キーで移動できます。</p>
        <button type="button" aria-pressed={actualSize} onClick={() => setActualSize(value => !value)}>原寸で確認</button>
        {actualSize && <p className={styles.muted}>上下左右にスクロールして、PNG・OBSと同じ文字サイズを確認できます。</p>}
        <div ref={preview} data-correlation-preview style={{ overflow: "auto", maxHeight: actualSize ? "70vh" : undefined }}>
          <div style={{ width: actualSize ? 1920 : "100%" }}><CorrelationCanvas document={doc} images={images} displayNames={displayNames} title={tier.document.title} transparent={transparent} selectedId={selected} onSelect={setSelected} onMove={move} disabled={busy} /></div>
        </div>
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
    <section className={styles.panel} aria-label="データ集計条件"><h2>データ集計条件</h2>
      <div className={styles.dataFilters}>
        <label>環境<select aria-label="集計する環境" value={selection.environment} disabled={busy} onChange={e=>edit({...doc,dataSelection:{...selection,environment:e.target.value}})}><option value="" disabled>環境を選択</option>{environments.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label>期間<select aria-label="集計期間" value={selection.period} disabled={busy||!selection.environment} onChange={e=>edit({...doc,dataSelection:{...selection,period:e.target.value as DataSelection["period"]}})}>{DASHBOARD_PERIODS.map(p=><option key={p.value} value={p.value}>{dashboardPeriodLabel(p.value)}</option>)}</select></label>
        <RankMultiSelect label="ランク・レート帯" value={selection.ranks} disabled={busy||!selection.environment} onApply={ranks=>edit({...doc,dataSelection:{...selection,ranks}})} />
        <button disabled={busy||!selection.environment} onClick={()=>void run(async()=>{const data=await loadData();edit({...doc,dataSelection:selection,edges:doc.edges.map(e=>e.dataSource==="auto"?withAutomaticData(doc,e,data):e)});setNotice({error:false,text:"自動の矢印データを更新しました。作品を保存するとPNG・OBSにも保持されます。"});})}>データを更新</button>
      </div>
      <p className={styles.muted}>全ユーザーの本人側＋対戦相手側を合算します。環境・OBSと同じ30分区切りの集計です。条件を変えても手動値は変わりません。自動値は「データを更新」で再取得できます。</p>
    </section>
    <section className={styles.panel} aria-label="矢印設定"><h2>相性矢印</h2>
      <div className={styles.edgeComposer}>
        <label>接続元（有利）<select aria-label="接続元" value={source} disabled={busy} onChange={e => setSource(e.target.value)}><option value="">選択してください</option>{doc.nodes.map(n => <option key={n.id} value={n.id}>{nodeName(n.id)}</option>)}</select></label>
        <label>接続先<select aria-label="接続先" value={target} disabled={busy} onChange={e => setTarget(e.target.value)}><option value="">選択してください</option>{doc.nodes.map(n => <option key={n.id} value={n.id}>{nodeName(n.id)}</option>)}</select></label>
        <button disabled={busy || !source || !target || source === target || doc.edges.length >= 600} onClick={addEdge}>矢印を追加</button>
      </div>
      {!doc.edges.length && <p className={styles.muted}>接続元・接続先を選んで矢印を追加してください。1ペア1本です。</p>}
      {doc.edges.map((edge,index) => <div key={edge.id} className={styles.edgeRow} data-edge-editor={edge.id}>
        <p className="break-words">{nodeName(edge.sourceNodeId)} {edge.type === "bidirectional" ? "↔" : "→"} {nodeName(edge.targetNodeId)}</p>
        <label>データソース<select aria-label={`矢印${index+1}のデータソース`} value={edge.dataSource??"manual"} disabled={busy} onChange={e=>updateEdge({...edge,dataSource:e.target.value as "auto"|"manual",dataSnapshot:undefined})}><option value="auto">自動</option><option value="manual">手動</option></select></label>
        <p className={styles.muted} data-edge-data-status={edge.id}>{dataStatus(edge)}</p>
        <label>種類<select aria-label={`矢印${index+1}の種類`} value={edge.type ?? "forward"} disabled={busy} onChange={e=>edit({...doc,edges:doc.edges.map(v=>v.id===edge.id?{...v,type:e.target.value as "forward"|"bidirectional"}:v)})}><option value="forward">片方向</option><option value="bidirectional">両方向</option></select></label>
        <label>ラベル<input aria-label={`矢印${index+1}のラベル`} value={edge.label} maxLength={60} disabled={busy} onChange={e => edit({ ...doc,edges:doc.edges.map(v => v.id === edge.id ? {...v,label:e.target.value} : v) })} /></label>
        <div className={styles.toolbar}>{(["winRate","matchCount"] as const).map(key=><label key={key}>{key === "winRate" ? "勝率（%）" : "対戦数"}<input aria-label={`矢印${index+1}の${key === "winRate" ? "勝率" : "対戦数"}`} type="number" min={0} max={key === "winRate" ? 100 : Number.MAX_SAFE_INTEGER} step={key === "winRate" ? "any" : 1} value={edge[key] ?? ""} disabled={busy||edge.dataSource==="auto"} onChange={e=>edit({...doc,edges:doc.edges.map(v=>v.id===edge.id?{...v,[key]:e.target.value === "" ? null : Number(e.target.value)}:v)})} /></label>)}</div>
        <div className={styles.toolbar}><label className={styles.check}><input type="checkbox" aria-label={`矢印${index+1}を表示`} checked={edge.visible} disabled={busy} onChange={e => edit({ ...doc,edges:doc.edges.map(v => v.id === edge.id ? {...v,visible:e.target.checked} : v) })} />表示</label>
          <button disabled={busy} onClick={() => updateEdge({...edge,sourceNodeId:edge.targetNodeId,targetNodeId:edge.sourceNodeId})}>方向を反転</button>
          <button disabled={busy} onClick={() => edit({ ...doc,edges:doc.edges.filter(v => v.id !== edge.id) })}>矢印を削除</button>
        </div>
      </div>)}
    </section>
    <section className={styles.panel} aria-label="相性候補"><h2>相性候補</h2>
      <p className={styles.muted}>相関図内の標準デッキから候補を探します。既存の矢印は保持し、選択した候補だけを追加します。</p>
      <div className={styles.toolbar}>
        <label>最低対戦数<input type="number" min={0} step={1} value={minimum} disabled={busy} onChange={e=>{setMinimum(Number(e.target.value));setCandidates(null);}} /></label>
        <label>有利判定（%）<input type="number" min={50} max={100} step="any" value={threshold} disabled={busy} onChange={e=>{setThreshold(Number(e.target.value));setCandidates(null);}} /></label>
        <button disabled={busy||!selection.environment} onClick={()=>void run(async()=>{setCandidates(null);setChosen([]);const values=matchupCandidates(doc,await loadData(),minimum,threshold);setCandidates(values);setChosen(values.map(v=>v.sourceNodeId+":"+v.targetNodeId));})}>候補を生成</button>
      </div>
      {candidates && <><div className={styles.candidates}>{!candidates.length && <p>条件に合う新しい候補はありません。</p>}{candidates.map(c=>{const key=c.sourceNodeId+":"+c.targetNodeId;return <label className={styles.check} key={key}><input type="checkbox" checked={chosen.includes(key)} disabled={busy} onChange={e=>setChosen(old=>e.target.checked?[...old,key]:old.filter(v=>v!==key))} />{nodeName(c.sourceNodeId)} → {nodeName(c.targetNodeId)}　{c.winRate}% / {c.matchCount}戦</label>;})}</div>
        <button disabled={busy||!chosen.length} onClick={()=>void run(async()=>{const edges:CorrelationEdge[]=candidates.filter(c=>chosen.includes(c.sourceNodeId+":"+c.targetNodeId)).map(c=>({id:crypto.randomUUID(),sourceNodeId:c.sourceNodeId,targetNodeId:c.targetNodeId,origin:"manual",label:"有利",visible:true,type:"forward",dataSource:"auto",winRate:c.winRate,matchCount:c.matchCount,dataSnapshot:c.snapshot}));edit(parseCorrelation({...doc,dataSelection:selection,edges:[...doc.edges,...edges]}));setNotice({error:false,text:`${edges.length}本の矢印を追加しました。`});})}>選択した矢印を追加</button>
      </>}
    </section>
    <section className={styles.panel}><h2>相関図の管理</h2><p className={styles.muted}>相関図を削除しても、親のTier表と画像ライブラリは残ります。</p>
      <button disabled={busy} onClick={() => { if (!window.confirm("この相関図を削除しますか？未保存の編集も破棄されます。Tier表は残ります。")) return; void run(async () => { await request({action:"delete-correlation",id:work.id,revision:work.revision}); setDirty(false); router.push(`/admin/creator/tier?work=${tier.id}`); }); }}>相関図を削除</button>
    </section>
  </main>;
}
