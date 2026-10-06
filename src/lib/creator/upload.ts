import { MAX_IMAGE_BYTES, validateImageFile } from "./model";

/** AVIF is often downloaded with a .png filename. Convert it before sending it
 * to the existing static-image API; the original local file is never changed. */
export async function prepareCreatorUpload(file: File): Promise<File> {
  validateImageFile(file);
  const header = new Uint8Array(await file.slice(0, 256).arrayBuffer());
  const text = (start: number, end: number) => String.fromCharCode(...header.slice(start, end));
  let avif = false;
  if (text(4, 8) === "ftyp") {
    const boxSize = new DataView(header.buffer).getUint32(0);
    for (let offset = 8; offset + 4 <= Math.min(boxSize, header.length); offset += 4) {
      if (offset !== 12 && ["avif", "avis"].includes(text(offset, offset + 4))) avif = true;
    }
  }
  if (!avif) return file;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(new Blob([file], { type: "image/avif" })); }
  catch { throw Error("AVIF画像を読み込めませんでした。画像をPNGとして書き出してから選択してください。"); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 24000000) throw Error("画像は2400万画素以下にしてください。");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw Error("画像をPNGに変換できませんでした。");
    context.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error("画像をPNGに変換できませんでした。")), "image/png"));
    if (png.size > MAX_IMAGE_BYTES) throw Error("PNG変換後の画像が4MBを超えています。画像を縮小してから選択してください。");
    return new File([png], file.name.replace(/\.[^.]+$/, ".png"), { type: "image/png", lastModified: file.lastModified });
  } finally { bitmap.close(); }
}
