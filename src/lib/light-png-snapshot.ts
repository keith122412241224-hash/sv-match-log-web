/** Preserve the on-screen dimensions while exporting with the original light palette.
 * The live DOM never changes theme, even while an asynchronous export is running.
 */
export function createLightPngSnapshot(source: HTMLElement) {
  const snapshot = source.cloneNode(true) as HTMLElement;
  const host = document.createElement("div");
  const computed = getComputedStyle(source);
  host.inert = true;
  host.setAttribute("aria-hidden", "true");
  host.dataset.theme = "light";
  snapshot.dataset.theme = "light";
  Object.assign(host.style, { position: "fixed", left: "-100000px", top: "0", pointerEvents: "none", fontFamily: computed.fontFamily });
  // Matrix column widths are responsive custom properties inherited from the scroll container.
  for (const name of ["--matrix-cell-width", "--matrix-label-width"]) {
    snapshot.style.setProperty(name, computed.getPropertyValue(name));
  }
  Object.assign(snapshot.style, { width: `${source.getBoundingClientRect().width}px`, maxWidth: "none" });
  const images = source.querySelectorAll("img");
  snapshot.querySelectorAll("img").forEach((img, index) => {
    // html-to-image historically embeds src (not the responsive currentSrc).
    // Preserve that exact asset resolution as well as each icon's query string.
    img.src = images[index].src;
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.loading = "eager";
  });
  host.append(snapshot);
  document.body.append(host);
  return { snapshot, remove: () => host.remove() };
}
