"use client";

import { Copy, Download } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/Button";

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

  async function downloadPng() {
    if (!ref.current) {
      return;
    }

    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(ref.current, {
      cacheBust: true,
      backgroundColor: "#ffffff",
      pixelRatio: 2
    });
    const link = document.createElement("a");
    link.download = fileName;
    link.href = dataUrl;
    link.click();
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="font-bold text-ink">{title}</h2>
        <Button type="button" variant="ghost" className="min-h-9 px-3 text-xs" onClick={downloadPng}>
          <Download size={16} aria-hidden="true" />
          PNG
        </Button>
      </div>
      <div ref={ref} className="bg-white p-4">
        {children}
      </div>
    </section>
  );
}
