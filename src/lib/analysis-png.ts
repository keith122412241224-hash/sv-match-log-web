import { createReportPngSnapshot, reportPngSize } from "@/lib/report-png-snapshot";

function pngFilename(block: string, date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `analysis-${block}-${day}-${time}.png`;
}

const PAGE_HEIGHT = 1600;
const PAGE_ITEMS = 32;

/** Partition actual rows/cards before rasterizing; never allocate a full-height canvas. */
function paginate(snapshot: HTMLElement) {
  const table = snapshot.querySelector("table");
  const items = Array.from(snapshot.querySelectorAll<HTMLElement>(table ? "tbody > tr" : "article"));
  const container = items[0]?.parentElement;
  if (!container || (snapshot.getBoundingClientRect().height <= PAGE_HEIGHT && items.length <= PAGE_ITEMS)) {
    return { pages: [items], container: null, counter: null };
  }

  // Retain column widths across pages even when only one page has a long deck name.
  if (table) {
    const columns = document.createElement("colgroup");
    table.querySelectorAll("thead tr:first-child > th").forEach((cell) => {
      const column = document.createElement("col");
      column.style.width = `${cell.getBoundingClientRect().width}px`;
      columns.append(column);
    });
    table.prepend(columns);
    table.style.tableLayout = "fixed";
  }

  // Cards in the same grid row stay together. Table rows are each one group.
  const groups: HTMLElement[][] = [];
  const matchups = table?.hasAttribute("data-analysis-matchups");
  let previousTop = -Infinity;
  for (const item of items) {
    const top = item.getBoundingClientRect().top;
    // Keep a deck heading with its first matchup, including an empty-filter row.
    if (matchups && groups.at(-1)?.at(-1)?.hasAttribute("data-matchup-heading")) groups[groups.length - 1].push(item);
    else if (!table && Math.abs(top - previousTop) < 1) groups[groups.length - 1].push(item);
    else groups.push([item]);
    previousTop = top;
  }
  const counter = document.createElement("span");
  counter.className = "shrink-0 text-xs text-muted";
  counter.textContent = "1 / 1";
  snapshot.querySelector("header")?.append(counter);
  container.replaceChildren();
  const pages: HTMLElement[][] = [];
  let current: HTMLElement[] = [];
  let deckHeading: HTMLElement | undefined;
  for (const group of groups) {
    container.append(...group);
    if (current.length && (snapshot.getBoundingClientRect().height > PAGE_HEIGHT || current.length + group.length > PAGE_ITEMS)) {
      pages.push(current);
      container.replaceChildren(...group);
      current = [];
      // Repeat the owning deck on continuation pages without touching the live UI.
      if (matchups && !group[0].hasAttribute("data-matchup-heading") && deckHeading) {
        const repeated = deckHeading.cloneNode(true) as HTMLElement;
        container.prepend(repeated);
        current.push(repeated);
      }
    }
    if (matchups && group[0].hasAttribute("data-matchup-heading")) deckHeading = group[0];
    current.push(...group);
  }
  pages.push(current);
  return { pages, container, counter };
}

const CACHE_BYTES = 12 * 1024 * 1024;
const CACHE_PAGES = 3;
const ZIP_BYTES = 64 * 1024 * 1024;
type Progress = (page: number, total: number) => void;

/** One immutable DOM snapshot; rasterize on demand, keeping only a small recent-page cache. */
export async function createAnalysisPng(source: HTMLElement, block: string) {
  const filename = pngFilename(block);
  const { snapshot, remove } = createReportPngSnapshot(source);
  try {
    const { toBlob } = await import("html-to-image");
    await document.fonts.ready;
    const { pages, container, counter } = paginate(snapshot);
    const cache = new Map<number, File>();
    let cachedBytes = 0;
    let disposed = false;
    let rendering = false;
    const dispose = () => {
      disposed = true;
      cache.clear();
      cachedBytes = 0;
      if (!rendering) remove();
    };
    async function page(index: number, onProgress?: Progress, retain = true): Promise<File> {
      if (disposed || rendering) throw new Error("PNG session unavailable");
      if (!Number.isInteger(index) || index < 0 || index >= pages.length) throw new RangeError("PNG page");
      onProgress?.(index + 1, pages.length);
      const cached = cache.get(index);
      if (cached) {
        cache.delete(index);
        cache.set(index, cached);
        return cached;
      }
      rendering = true;
      try {
        if (container) container.replaceChildren(...pages[index]);
        if (counter) counter.textContent = `${index + 1} / ${pages.length}`;
        await Promise.all(Array.from(snapshot.querySelectorAll("img"), (img) => img.decode()));
        if (disposed) throw new Error("PNG session closed");
        const { width, height, pixelRatio } = reportPngSize(snapshot);
        const blob = await toBlob(snapshot, {
          backgroundColor: "#ffffff", pixelRatio, width, height,
          // Next/Image queries select distinct class icons.
          includeQueryParams: true
        });
        if (disposed) throw new Error("PNG session closed");
        if (!blob) throw new Error("PNG encoding failed");
        const suffix = `-part-${String(index + 1).padStart(3, "0")}-of-${String(pages.length).padStart(3, "0")}.png`;
        const file = new File([blob], pages.length === 1 ? filename : filename.replace(/\.png$/, suffix), { type: "image/png" });
        if (retain && file.size <= CACHE_BYTES) {
          while (cache.size >= CACHE_PAGES || cachedBytes + file.size > CACHE_BYTES) {
            const oldest = cache.keys().next().value!;
            cachedBytes -= cache.get(oldest)!.size;
            cache.delete(oldest);
          }
          cache.set(index, file);
          cachedBytes += file.size;
        }
        // Allow progress to paint and release each canvas before the next page.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        return file;
      } finally {
        rendering = false;
        if (disposed) remove();
      }
    }
    async function zip(onProgress?: Progress) {
      // Stream stored entries: never retain an unbounded array of rasterized PNGs.
      const { Zip, ZipPassThrough } = await import("fflate");
      const chunks: BlobPart[] = [];
      let bytes = 0;
      let failure: Error | null = null;
      const archive = new Zip((error, data) => {
        if (error) failure = error;
        bytes += data.byteLength;
        if (bytes > ZIP_BYTES) failure = new Error("ZIPが大きすぎます。個別のPNGを保存するか、分析条件を絞ってください。");
        if (!failure) chunks.push(new Uint8Array(data));
      });
      try {
        for (let index = 0; index < pages.length; index++) {
          const file = await page(index, onProgress, false);
          const entry = new ZipPassThrough(file.name);
          archive.add(entry);
          entry.push(new Uint8Array(await file.arrayBuffer()), true);
          if (failure) throw failure;
        }
        archive.end();
        if (failure) throw failure;
        if (disposed) throw new Error("PNG session closed");
        return new File(chunks, filename.replace(/\.png$/, ".zip"), { type: "application/zip" });
      } finally {
        archive.terminate();
      }
    }
    return { count: pages.length, filename, page, zip, dispose };
  } catch (error) {
    remove();
    throw error;
  }
}

export type AnalysisPng = Awaited<ReturnType<typeof createAnalysisPng>>;

/** A download owns a separate URL, so closing a preview cannot interrupt it. */
export function downloadAnalysisFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.download = file.name;
  link.href = url;
  document.body.append(link);
  try { link.click(); } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

/** Desktop keeps its existing single PNG / multi-page ZIP automatic download. */
export async function saveAnalysisPng(source: HTMLElement, block: string, onProgress?: Progress) {
  const exportPng = await createAnalysisPng(source, block);
  try {
    const files: Record<string, Uint8Array> = {};
    let downloadBlob: Blob | null = null;
    for (let index = 0; index < exportPng.count; index++) {
      const file = await exportPng.page(index, onProgress, false);
      if (exportPng.count === 1) downloadBlob = file;
      else files[file.name] = new Uint8Array(await file.arrayBuffer());
    }
    if (exportPng.count > 1) {
      // PNG is already compressed. Store entries without recompression or repeated downloads.
      const { zipSync } = await import("fflate");
      downloadBlob = new Blob([new Uint8Array(zipSync(files, { level: 0 }))], { type: "application/zip" });
    }
    if (!downloadBlob) throw new Error("No images generated");
    downloadAnalysisFile(new File([downloadBlob], exportPng.count === 1 ? exportPng.filename : exportPng.filename.replace(/\.png$/, ".zip"), { type: downloadBlob.type }));
    return exportPng.count;
  } finally {
    exportPng.dispose();
  }
}
