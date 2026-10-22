"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/Button";
import { downloadAnalysisFile, type AnalysisPng } from "@/lib/analysis-png";

function canShare(file: File) {
  try {
    return typeof navigator.share === "function" && typeof navigator.canShare === "function"
      && navigator.canShare({ files: [file] });
  } catch { return false; }
}

export function AnalysisPngPreview({ title, png, first, onClose }: {
  title: string; png: AnalysisPng; first: File; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  const working = useRef(false);
  const heading = useId();
  const [current, setCurrent] = useState({ index: 0, file: first });
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const supported = canShare(current.file);

  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      mounted.current = false;
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const next = URL.createObjectURL(current.file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [current.file]);

  function start() {
    if (working.current) return false;
    working.current = true;
    setBusy(true); setError(""); setMessage(""); setProgress("");
    return true;
  }
  function finish() {
    working.current = false;
    if (mounted.current) { setBusy(false); setProgress(""); }
  }
  async function navigate(index: number) {
    if (!start()) return;
    try {
      const file = await png.page(index, (page, total) => {
        if (mounted.current) setProgress(`画像を作成しています ${page} / ${total}`);
      });
      if (mounted.current) setCurrent({ index, file });
    } catch {
      if (mounted.current) setError("画像を作成できませんでした。もう一度ページを選ぶか、ZIPをお試しください。");
    } finally { finish(); }
  }
  async function zip() {
    if (!start()) return;
    try {
      const file = await png.zip((page, total) => {
        if (mounted.current) setProgress(`ZIPを作成しています ${page} / ${total}`);
      });
      if (mounted.current) downloadAnalysisFile(file);
    } catch (error) {
      if (mounted.current) setError(error instanceof Error && error.message.startsWith("ZIPが大きすぎます")
        ? error.message : "ZIPを作成できませんでした。個別のPNGを保存するか、もう一度お試しください。");
    } finally { finish(); }
  }
  function share() {
    if (!supported || !start()) return;
    const failed = (error: unknown) => {
      if (!mounted.current) return;
      if (error instanceof DOMException && error.name === "AbortError") setMessage("共有をキャンセルしました。もう一度操作できます。");
      else setError("共有できませんでした。PNGのダウンロードや画像の長押しをお試しください。");
    };
    try {
      // The generated File is ready: no await/import/render before the native share call.
      navigator.share({ files: [current.file] }).then(() => {
        if (mounted.current) setMessage("共有メニューでの操作が終了しました。保存先で画像をご確認ください。");
      }, failed).finally(finish);
    } catch (error) { failed(error); finish(); }
  }
  function openImage() {
    // Let the new document own its URL. Closing this preview must not break that image.
    const opened = window.open("", "_blank") as (Window & typeof globalThis) | null;
    if (!opened) { setError("画像を開けませんでした。PNGのダウンロードをお試しください。"); return; }
    opened.opener = null;
    opened.document.title = current.file.name;
    const meta = opened.document.createElement("meta");
    meta.name = "viewport"; meta.content = "width=device-width, initial-scale=1";
    opened.document.head.append(meta);
    const image = opened.document.createElement("img");
    image.alt = title;
    image.src = opened.URL.createObjectURL(current.file);
    image.style.cssText = "display:block;max-width:100%;height:auto;margin:auto";
    opened.document.body.append(image);
    // This URL remains available for long-press/save until its owning document unloads.
  }

  return createPortal(<dialog ref={dialog} aria-labelledby={heading} onCancel={event => { event.preventDefault(); onClose(); }}
    className="m-auto max-h-[92dvh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-0 text-ink backdrop:bg-black/50">
    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-white px-4 py-3">
      <h2 id={heading} className="font-bold">分析画像の保存</h2>
      <Button type="button" variant="secondary" onClick={onClose} className="min-h-11">閉じる</Button>
    </header>
    <div className="space-y-3 p-4">
      <p className="text-sm font-semibold">{title}</p>
      {url ? <a href={url} target="_blank" rel="noopener" onClick={event => { event.preventDefault(); openImage(); }} aria-label="画像を単独で開く">
        {/* A real, unoptimized Blob image preserves long-press actions and its aspect ratio. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`${title} ${current.index + 1} / ${png.count}`} className="mx-auto h-auto max-h-[48dvh] max-w-full object-contain" />
      </a> : null}
      <div className="flex items-center justify-center gap-3" aria-label="画像のページ">
        {png.count > 1 ? <Button type="button" variant="secondary" disabled={busy || current.index === 0} onClick={() => navigate(current.index - 1)}>前へ</Button> : null}
        <p aria-live="polite" className="text-sm">{current.index + 1} / {png.count}</p>
        {png.count > 1 ? <Button type="button" variant="secondary" disabled={busy || current.index === png.count - 1} onClick={() => navigate(current.index + 1)}>次へ</Button> : null}
      </div>
      <p role="status" className="text-sm text-muted">{progress || message}</p>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {supported ? <Button type="button" className="min-h-11 w-full" disabled={busy} onClick={share}>
        {png.count > 1 ? "この画像を共有・保存" : "画像を共有・保存"}
      </Button> : <p className="text-sm text-muted">このブラウザでは画像の共有に対応していません。ダウンロードや長押しをご利用ください。</p>}
      <Button type="button" variant="secondary" className="min-h-11 w-full" disabled={busy} onClick={() => downloadAnalysisFile(current.file)}>
        {png.count > 1 ? "このPNGをダウンロード" : "PNGをダウンロード"}
      </Button>
      {url ? <a href={url} target="_blank" rel="noopener" onClick={event => { event.preventDefault(); openImage(); }} className="inline-flex min-h-11 items-center text-sm underline">画像を単独で開く</a> : null}
      {png.count > 1 ? <Button type="button" variant="secondary" className="min-h-11 w-full" disabled={busy} onClick={zip}>ZIPをダウンロード</Button> : null}
      <p className="text-xs leading-relaxed text-muted">写真への保存は、共有メニューまたは画像の長押しから操作できます。利用できる項目は端末によって異なります。</p>
    </div>
  </dialog>, document.body);
}
