function pngFilename(block: string, date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `analysis-${block}-${day}-${time}.png`;
}

/** Capture a detached snapshot so scrolling, filters and the visible layout stay intact. */
export async function saveAnalysisPng(source: HTMLElement, block: string) {
  const filename = pngFilename(block);
  const snapshot = source.cloneNode(true) as HTMLElement;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  Object.assign(host.style, {
    position: "fixed", left: "-100000px", top: "0", pointerEvents: "none",
    fontFamily: getComputedStyle(source).fontFamily
  });
  snapshot.querySelectorAll("[data-png-exclude]").forEach((node) => node.remove());
  // Preserve the actual responsive image selected by Next/Image, including lazy images.
  const sourceImages = source.querySelectorAll("img");
  snapshot.querySelectorAll("img").forEach((img, index) => {
    img.src = sourceImages[index].currentSrc || sourceImages[index].src;
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.loading = "eager";
  });
  // Expand only horizontally scrollable tables. Keep the current viewport's card layout.
  const scrollAreas = Array.from(source.querySelectorAll<HTMLElement>(".overflow-x-auto"));
  const extraWidth = Math.max(0, ...scrollAreas.map((node) => node.scrollWidth - node.clientWidth));
  snapshot.style.width = `${Math.ceil(source.getBoundingClientRect().width + extraWidth)}px`;
  snapshot.style.maxWidth = "none";
  snapshot.querySelectorAll<HTMLElement>(".overflow-x-auto").forEach((node) => {
    node.style.overflow = "visible";
  });
  // Do not duplicate document IDs while the temporary snapshot is attached.
  snapshot.removeAttribute("aria-labelledby");
  snapshot.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  host.append(snapshot);
  document.body.append(host);

  try {
    const { toBlob } = await import("html-to-image");
    await document.fonts.ready;
    await Promise.all(Array.from(snapshot.querySelectorAll("img"), (img) => img.decode()));
    const width = Math.ceil(snapshot.getBoundingClientRect().width);
    const height = Math.ceil(snapshot.getBoundingClientRect().height);
    // Normal blocks use 2x resolution; cap large tables to avoid excessive canvas memory.
    const pixelRatio = Math.min(2, 16000 / width, 16000 / height, Math.sqrt(16000000 / (width * height)));
    if (pixelRatio < 1) {
      throw new Error("PNG is too large. Narrow the displayed period or deck filters.");
    }
    const blob = await toBlob(snapshot, {
      backgroundColor: "#ffffff", pixelRatio, width, height,
      // Next/Image URLs share /_next/image; their query selects the actual class icon.
      includeQueryParams: true
    });
    if (!blob) throw new Error("PNG encoding failed");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = filename;
    link.href = url;
    document.body.append(link);
    link.click();
    link.remove();
    // Give the browser time to start the download before releasing the Blob.
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } finally {
    host.remove();
  }
}
