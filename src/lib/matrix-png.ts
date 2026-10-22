export const MATRIX_PNG_TOO_LARGE = "画像サイズが大きすぎるため保存できません。表示するデッキ数を減らして、もう一度お試しください。";

/** Match html-to-image's border-box measurement and the existing pixelRatio: 2. */
export function matrixPngSize(node: HTMLElement, mobile: boolean) {
  const style = getComputedStyle(node);
  const border = (value: string) => Number.parseFloat(value) || 0;
  const width = node.clientWidth + border(style.borderLeftWidth) + border(style.borderRightWidth);
  const height = node.clientHeight + border(style.borderTopWidth) + border(style.borderBottomWidth);
  return validateMatrixPngSize(width, height, mobile);
}

export function validateMatrixPngSize(width: number, height: number, mobile: boolean) {
  const pixelRatio = 2;
  const canvasWidth = Math.ceil(width * pixelRatio), canvasHeight = Math.ceil(height * pixelRatio);
  // Mobile: conservative 4096-axis / 8MP budget, including iOS's smaller canvas limits.
  // Desktop: html-to-image's 16384-axis limit, with a separate 64MP allocation budget.
  // Neither budget guarantees available device memory; encoding failures remain retryable.
  const maxSide = mobile ? 4096 : 16384, maxPixels = mobile ? 8_000_000 : 64_000_000;
  if (![width, height].every(value => Number.isFinite(value) && value > 0)
    || canvasWidth > maxSide || canvasHeight > maxSide || canvasWidth * canvasHeight > maxPixels) {
    throw new RangeError(MATRIX_PNG_TOO_LARGE);
  }
  return { width, height, pixelRatio, canvasWidth, canvasHeight };
}

/** Convert locally without fetching a data URL or sending image bytes to a service. */
export function matrixPngFile(dataUrl: string, filename: string) {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) throw new Error("PNG encoding failed");
  const binary = atob(dataUrl.slice(prefix.length));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (bytes.length < 8 || bytes[0] !== 137 || String.fromCharCode(...bytes.slice(1, 4)) !== "PNG") throw new Error("PNG encoding failed");
  return new File([bytes], filename, { type: "image/png" });
}
