"use client";

import { ChevronDown, Download } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/Button";
import { createAnalysisPng, saveAnalysisPng, type AnalysisPng } from "@/lib/analysis-png";
import { AnalysisPngPreview } from "@/components/analysis/AnalysisPngPreview";

export function ExportableAnalysisBlock({ title, filename, children, collapsible = false }: {
  title: string;
  filename: string;
  children: ReactNode;
  collapsible?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const busy = useRef(false);
  const titleId = useId();
  const contentId = useId();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<{ png: AnalysisPng; first: File } | null>(null);
  const session = useRef<AnalysisPng | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; session.current?.dispose(); };
  }, []);
  function closePreview() {
    session.current?.dispose();
    session.current = null;
    setPreview(null);
  }

  async function save() {
    if (!ref.current || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    setProgress("");
    try {
      const progress = (page: number, total: number) => { if (mounted.current) setProgress(`${page} / ${total}`); };
      // Responsive presentation is independent from file-sharing API capability.
      if (window.matchMedia("(max-width: 767px)").matches) {
        session.current?.dispose();
        const png = await createAnalysisPng(ref.current, filename);
        if (!mounted.current) { png.dispose(); return; }
        session.current = png;
        const first = await png.page(0, progress);
        if (mounted.current) setPreview({ png, first });
      } else {
        const count = await saveAnalysisPng(ref.current, filename, progress);
        if (mounted.current && count > 1) setNotice(`${count}枚のPNGをZIPにまとめて保存しました。ZIPを展開してご利用ください。`);
      }
    } catch {
      session.current?.dispose();
      session.current = null;
      if (mounted.current) setError("PNGを保存できませんでした。画像の読み込みや通信状況を確認して、もう一度お試しください。");
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <><section ref={ref} aria-labelledby={titleId} className="min-w-0 rounded-md border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 id={titleId} className="font-bold text-ink">{title}</h2>
        {collapsible ? <button type="button" data-png-exclude aria-expanded={open} aria-controls={contentId}
          onClick={() => setOpen(value => !value)} className="ml-auto inline-flex min-h-10 items-center gap-1 rounded px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2">
          {open ? "閉じる" : "展開"}<ChevronDown aria-hidden="true" size={16} className={open ? "rotate-180" : ""} />
        </button> : null}
        <Button type="button" variant="secondary" onClick={save} disabled={saving}
          aria-label={`${title}をPNG保存`} aria-busy={saving} data-png-exclude
          className="min-h-9 px-3 py-1.5 text-xs">
          <Download size={16} aria-hidden="true" />
          {saving ? `保存中… ${progress}` : "PNG保存"}
        </Button>
      </header>
      {error ? <p role="alert" data-png-exclude className="px-4 pt-3 text-sm text-red-700">{error}</p> : null}
      <p role="status" data-png-exclude className="px-4 text-xs text-muted">
        {saving ? `画像を作成しています ${progress}` : notice}
      </p>
      {collapsible ? <>
        <p data-png-exclude className="px-4 py-3 text-sm text-muted">使用デッキと相手デッキの組み合わせ別に勝率を確認できます。閉じた状態でもPNGに全データを出力できます。</p>
        <div id={contentId} hidden={!open} data-png-expand>{children}</div>
      </> : children}
    </section>
    {preview ? <AnalysisPngPreview title={title} png={preview.png} first={preview.first} onClose={closePreview} /> : null}</>
  );
}
