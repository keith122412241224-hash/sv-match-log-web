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
  let previousTop = -Infinity;
  for (const item of items) {
    const top = item.getBoundingClientRect().top;
    if (!table && Math.abs(top - previousTop) < 1) groups[groups.length - 1].push(item);
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
  for (const group of groups) {
    container.append(...group);
    if (current.length && (snapshot.getBoundingClientRect().height > PAGE_HEIGHT || current.length + group.length > PAGE_ITEMS)) {
      pages.push(current);
      container.replaceChildren(...group);
      current = [];
    }
    current.push(...group);
  }
  pages.push(current);
  return { pages, container, counter };
}

/** Capture a detached snapshot so scrolling, filters and the visible layout stay intact. */
export async function saveAnalysisPng(source: HTMLElement, block: string, onProgress?: (page: number, total: number) => void) {
  const filename = pngFilename(block);
  const { snapshot, remove } = createReportPngSnapshot(source);

  try {
    const { toBlob } = await import("html-to-image");
    await document.fonts.ready;
    const { pages, container, counter } = paginate(snapshot);
    const files: Record<string, Uint8Array> = {};
    let downloadBlob: Blob | null = null;
    for (let index = 0; index < pages.length; index++) {
      if (container) container.replaceChildren(...pages[index]);
      if (counter) counter.textContent = `${index + 1} / ${pages.length}`;
      onProgress?.(index + 1, pages.length);
      // Only decode/rasterize images belonging to this page.
      await Promise.all(Array.from(snapshot.querySelectorAll("img"), (img) => img.decode()));
      const { width, height, pixelRatio } = reportPngSize(snapshot);
      const blob = await toBlob(snapshot, {
        backgroundColor: "#ffffff", pixelRatio, width, height,
        // Next/Image URLs share /_next/image; their query selects the actual class icon.
        includeQueryParams: true
      });
      if (!blob) throw new Error("PNG encoding failed");
      if (pages.length === 1) downloadBlob = blob;
      else {
        const suffix = `-part-${String(index + 1).padStart(3, "0")}-of-${String(pages.length).padStart(3, "0")}.png`;
        files[filename.replace(/\.png$/, suffix)] = new Uint8Array(await blob.arrayBuffer());
      }
      // Allow progress to paint and release each canvas before starting the next page.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    if (pages.length > 1) {
      // PNG is already compressed. Store entries without recompression or repeated downloads.
      const { zipSync } = await import("fflate");
      downloadBlob = new Blob([new Uint8Array(zipSync(files, { level: 0 }))], { type: "application/zip" });
    }
    if (!downloadBlob) throw new Error("No images generated");
    const url = URL.createObjectURL(downloadBlob);
    const link = document.createElement("a");
    link.download = pages.length === 1 ? filename : filename.replace(/\.png$/, ".zip");
    link.href = url;
    document.body.append(link);
    link.click();
    link.remove();
    // Give the browser time to start the download before releasing the Blob.
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    return pages.length;
  } finally {
    remove();
  }
}
