import { UUID, type CreatorImage, type TierWork } from "./model";

export const CREATOR_PAGE_SIZE = 30;
export type CreatorPage<T> = { items: T[]; nextCursor: string | null };
export type TierSummary = Omit<TierWork, "document"> & { title: string; correlationId: string | null };
export type ImagePage = CreatorPage<CreatorImage> & { displayNames: Record<string, string> };
export type TierSelection = { work: TierWork; images: CreatorImage[]; correlationId: string | null };

// Preserve PostgreSQL microseconds; converting the boundary to JS Date loses them.
export function parseCreatorCursor(value: string | null) {
  if (value === null) return null;
  if (value.length > 150) throw Error("ページ指定が不正です。");
  const parts = value.split("|");
  const [time, id] = parts;
  if (parts.length !== 2 || !UUID.test(id) || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(time) || !Number.isFinite(Date.parse(time)) || new Date(`${time.slice(0,10)}T00:00:00Z`).toISOString().slice(0, 10) !== time.slice(0, 10)) throw Error("ページ指定が不正です。");
  return { time, id };
}

export type CreatorListKind = "images" | "works" | "correlations" | "obs-sets";
export async function creatorRead<T>(kind: CreatorListKind | "work" | "correlation" | "obs-set", value?: string | null): Promise<T> {
  const query = new URLSearchParams({ kind });
  if (value) query.set(["work", "correlation", "obs-set"].includes(kind) ? "id" : "cursor", value);
  const response = await fetch(`/admin/creator/api?${query}`, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "一覧を取得できませんでした。再試行してください。");
  return result;
}

export function mergeCreatorImages(...groups: CreatorImage[][]): CreatorImage[] {
  const images = new Map<string, CreatorImage>();
  for (const image of groups.flat()) if ((images.get(image.id)?.revision ?? 0) <= image.revision) images.set(image.id, image);
  return [...images.values()];
}
