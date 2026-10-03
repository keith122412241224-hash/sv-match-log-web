"use client";

import { Copy, Download } from "lucide-react";
import { useContext, useRef, useState, type ReactNode } from "react";
import { PeriodReportDisplayContext } from "@/components/admin/PeriodReportRankContext";
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
  const description = useContext(PeriodReportDisplayContext);

  async function downloadPng() {
    if (!ref.current) {
      return;
    }

    const { toPng } = await import("html-to-image");
    // Include the title and conditions only in the exported image.
    const exportNode = ref.current.cloneNode(true) as HTMLDivElement;
    exportNode.style.width = `${ref.current.getBoundingClientRect().width}px`;
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
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none";
    container.setAttribute("aria-hidden", "true");
    container.append(exportNode);
    document.body.append(container);
    try {
      const dataUrl = await toPng(exportNode, {
        cacheBust: true,
        backgroundColor: "#ffffff",
        pixelRatio: 2
      });
      const link = document.createElement("a");
      link.download = fileName;
      link.href = dataUrl;
      link.click();
    } finally {
      container.remove();
    }
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
