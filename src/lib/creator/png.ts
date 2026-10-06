/** Reuse html-to-image, but rasterize only the fixed 1920×1080 artwork. */
export async function saveTierPng(source: HTMLElement) {
  const host = document.createElement("div");
  host.inert = true;
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "fixed", left: "-100000px", top: "0" });
  const snapshot = source.cloneNode(true) as HTMLElement;
  host.append(snapshot); document.body.append(host);
  try {
    await document.fonts.ready;
    await Promise.all(Array.from(snapshot.querySelectorAll("img"), image => image.decode()));
    const { toBlob } = await import("html-to-image");
    const blob = await toBlob(snapshot, { width: 1920, height: 1080, pixelRatio: 1, includeQueryParams: true });
    if (!blob) throw Error("PNG生成に失敗しました。");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `tier-${Date.now()}.png`;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } finally { host.remove(); }
}
