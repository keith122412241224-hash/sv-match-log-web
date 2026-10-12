"use client";

import { Copy, Download } from "lucide-react";
import { useContext, useRef, useState, type ReactNode } from "react";
import { PeriodReportDisplayContext } from "@/components/admin/PeriodReportRankContext";
import { Button } from "@/components/Button";
import { createReportPngSnapshot, reportPngSize } from "@/lib/report-png-snapshot";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copyText() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Button type="button" variant="secondary" onClick={copyText}>
      <Copy size={17} aria-hidden="true" />
      {copied ? "コピーしました" : label}
    </Button>
  );
}

export function MarkdownDownloadButton({ markdown, fileName }: { markdown: string; fileName: string }) {
  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="secondary" onClick={downloadMarkdown}>
      <Download size={17} aria-hidden="true" />
      Markdown保存
    </Button>
  );
}

export function ExportableReportBlock({ title, fileName, children }: { title: string; fileName: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const description = useContext(PeriodReportDisplayContext);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function downloadPng() {
    if (!ref.current || busy.current) {
      return;
    }

    busy.current = true;
    setSaving(true);
    setError("");
    let remove: (() => void) | undefined;
    try {
      const { toBlob } = await import("html-to-image");
      // Include the title and conditions only in the exported image.
      // Narrow phone charts need room for both the full deck label and its statistics.
      const prepared = createReportPngSnapshot(ref.current, 640);
      const exportNode = prepared.snapshot;
      remove = prepared.remove;
      const heading = document.createElement("h3");
      heading.className = "mb-2 font-bold text-ink";
      heading.textContent = title;
      exportNode.prepend(heading);
      if (description) {
        const context = document.createElement("p");
        context.className = "mb-3 break-words text-xs text-muted";
        context.textContent = description;
        heading.after(context);
      }
      await document.fonts.ready;
      await Promise.all(Array.from(exportNode.querySelectorAll("img"), img => img.decode()));
      const blob = await toBlob(exportNode, {
        ...reportPngSize(exportNode),
        includeQueryParams: true,
        backgroundColor: "#ffffff",
      });
      if (!blob) throw new Error("PNGを生成できませんでした。もう一度お試しください。");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = fileName;
      link.href = url;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (cause) {
      setError(cause instanceof Error && cause.message.startsWith("PNG") ? cause.message : "PNGを保存できませんでした。画像の読み込みや通信状況を確認して、もう一度お試しください。");
    } finally {
      remove?.();
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="font-bold text-ink">{title}</h2>
        <Button type="button" variant="ghost" className="min-h-9 px-3 text-xs" onClick={downloadPng} disabled={saving} aria-busy={saving}>
          <Download size={16} aria-hidden="true" />
          {saving ? "保存中…" : "PNG"}
        </Button>
      </div>
      {error ? <p role="alert" className="px-4 pt-3 text-sm text-red-700">{error}</p> : null}
      <div ref={ref} className="bg-white p-4">
        {children}
      </div>
    </section>
  );
}
