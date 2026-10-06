import sharp from "sharp";
import { MAX_IMAGE_BYTES } from "./model";

export type DisplayImage = { bytes: Uint8Array; type: string; trimmed: boolean };

/** Display derivative only. Storage originals and work documents are never changed. */
export async function trimTransparentImage(original: DisplayImage): Promise<DisplayImage> {
  const image = sharp(original.bytes, { limitInputPixels: 24000000, animated: false, failOn: "warning" });
  const metadata = await image.metadata();
  if (!metadata.hasAlpha || !["png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) return original;
  // Orient before measuring and extracting. ushort retains even very faint 16-bit alpha.
  const oriented = metadata.depth === "ushort" ? image.autoOrient().toColourspace("rgb16") : image.autoOrient();
  const { data, info } = await oriented.clone().extractChannel("alpha").raw({ depth: "ushort" }).toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data.readUInt16LE((y * info.width + x) * 2) === 0) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = y;
  }
  // Empty images and full-frame artwork must remain valid, unchanged images.
  if (right < left || (left === 0 && top === 0 && right === info.width - 1 && bottom === info.height - 1)) return original;
  const cropped = oriented.clone().extract({ left, top, width: right - left + 1, height: bottom - top + 1 });
  const png = await cropped.clone().png().toBuffer();
  if (png.length <= MAX_IMAGE_BYTES) return { bytes: png, type: "image/png", trimmed: true };
  if (metadata.depth === "ushort") return original; // WEBP cannot preserve 16-bit alpha.
  const webp = await cropped.clone().webp({ lossless: true }).toBuffer();
  if (webp.length <= MAX_IMAGE_BYTES) return { bytes: webp, type: "image/webp", trimmed: true };
  // Keep a usable original if a lossless derivative exceeds the response budget.
  return original;
}

/** Bounded, disposable derivative cache. Auth and the current object path are checked
 * by the route on every request, including cache hits. Immutable object UUIDs also
 * prevent a replacement from receiving the previous image's derivative. */
export function createDisplayImageCache(maxBytes = 32 * 1024 * 1024, maxEntries = 64, ttl = 10 * 60 * 1000) {
  const cache = new Map<string, { image: DisplayImage; expires: number }>();
  const pending = new Map<string, Promise<DisplayImage>>();
  const waiting: (() => void)[] = [];
  let size = 0, active = 0;
  const remove = (key: string) => { const entry = cache.get(key); if (entry) { size -= entry.image.bytes.length; cache.delete(key); } };
  return async (key: string, read: () => Promise<DisplayImage>): Promise<DisplayImage> => {
    for (const [id, entry] of cache) if (entry.expires <= Date.now()) remove(id);
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit.image; }
    const running = pending.get(key);
    if (running) return running;
    const job = (async () => {
      if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve));
      else active++;
      try {
        const original = await read();
        let result: DisplayImage;
        try { result = await trimTransparentImage(original); }
        catch { return original; } // Derivation must not break an existing work; retry next time.
        if (result.bytes.length <= maxBytes) {
          while (cache.size && (size + result.bytes.length > maxBytes || cache.size >= maxEntries)) remove(cache.keys().next().value!);
          cache.set(key, { image: result, expires: Date.now() + ttl }); size += result.bytes.length;
        }
        return result;
      } finally { const next = waiting.shift(); if (next) next(); else active--; }
    })();
    pending.set(key, job);
    try { return await job; } finally { pending.delete(key); }
  };
}

export const getDisplayImage = createDisplayImageCache();
