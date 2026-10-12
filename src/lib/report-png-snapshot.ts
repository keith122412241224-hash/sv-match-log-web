/** Only used by Analysis/period-report exports; never mutates the visible source. */
export function createReportPngSnapshot(source: HTMLElement, minimumWidth = 0) {
  const snapshot = source.cloneNode(true) as HTMLElement;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.dataset.reportPng = "";
  host.inert = true;
  Object.assign(host.style, {
    position: "fixed", left: "-100000px", top: "0", pointerEvents: "none",
    fontFamily: getComputedStyle(source).fontFamily
  });
  // Copy selected responsive URLs before removing excluded nodes (which may contain images).
  const images = source.querySelectorAll("img");
  snapshot.querySelectorAll("img").forEach((img, index) => {
    img.src = images[index].currentSrc || images[index].src;
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.loading = "eager";
  });
  snapshot.querySelectorAll("[data-png-exclude]").forEach(node => node.remove());
  snapshot.removeAttribute("id");
  snapshot.removeAttribute("aria-labelledby");
  snapshot.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
  const areas = Array.from(source.querySelectorAll<HTMLElement>(".overflow-x-auto"));
  const extra = Math.max(0, ...areas.map(node => node.scrollWidth - node.clientWidth));
  // Bound layout width; long unbroken names wrap instead of creating enormous canvases.
  Object.assign(snapshot.style, {
    width: `${Math.min(1600, Math.max(minimumWidth, Math.ceil(source.getBoundingClientRect().width + extra)))}px`,
    maxWidth: "none", height: "auto", maxHeight: "none", overflow: "visible",
    overflowWrap: "anywhere"
  });
  snapshot.querySelectorAll<HTMLElement>(".overflow-x-auto").forEach(node => {
    Object.assign(node.style, { overflow: "visible", height: "auto", maxHeight: "none" });
  });
  snapshot.querySelectorAll<HTMLElement>(".truncate, .whitespace-nowrap, [class*='line-clamp-']").forEach(node => {
    Object.assign(node.style, {
      whiteSpace: "normal", overflow: "visible", textOverflow: "clip",
      overflowWrap: "anywhere", maxHeight: "none", webkitLineClamp: "unset"
    });
    // Inline icon/name wrappers and card heading wrappers must also be allowed to shrink.
    for (let parent = node.parentElement; parent && parent !== snapshot; parent = parent.parentElement) {
      if (["SPAN", "DIV", "H3", "ARTICLE"].includes(parent.tagName)) {
        Object.assign(parent.style, { minWidth: "0", maxWidth: "100%" });
      }
    }
  });
  snapshot.querySelectorAll<HTMLElement>("th, td").forEach(node => {
    const numeric = /^\d+(?:[.,]\d+)*%?$/.test(node.textContent?.trim() ?? "");
    Object.assign(node.style, {
      whiteSpace: node.tagName === "TH" || numeric ? "nowrap" : "normal",
      overflowWrap: "anywhere"
    });
  });
  host.append(snapshot);
  document.body.append(host);
  return { snapshot, remove: () => host.remove() };
}

/** Never let html-to-image silently scale/crop an oversized or horizontally overflowing DOM. */
export function reportPngSize(snapshot: HTMLElement) {
  const width = Math.ceil(snapshot.getBoundingClientRect().width);
  const height = Math.ceil(snapshot.getBoundingClientRect().height);
  if (!width || !height || snapshot.scrollWidth > width + 1 || snapshot.scrollHeight > height + 1
    || width > 4096 || height > 4096 || width * height > 8000000) {
    throw new Error("PNGの出力サイズが上限を超えています。対象データを絞り込んで再度お試しください。");
  }
  const pixelRatio = Math.min(2, 4096 / width, 4096 / height, Math.sqrt(8000000 / (width * height)));
  return { width, height, pixelRatio };
}
