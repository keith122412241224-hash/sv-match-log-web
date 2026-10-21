"use client";

import { ChevronDown, Download } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/Button";
import { saveAnalysisPng } from "@/lib/analysis-png";

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

  async function save() {
    if (!ref.current || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    setProgress("");
    try {
      const count = await saveAnalysisPng(ref.current, filename, (page, total) => setProgress(`${page} / ${total}`));
      if (count > 1) setNotice(`${count}枚のPNGをZIPにまとめて保存しました。ZIPを展開してご利用ください。`);
    } catch {
      setError("PNGを保存できませんでした。画像の読み込みや通信状況を確認して、もう一度お試しください。");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <section ref={ref} aria-labelledby={titleId} className="min-w-0 rounded-md border border-slate-200 bg-white">
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
  );
}
