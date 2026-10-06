import type { CreatorImage } from "./model";

/** Derived names only: never write these back to the image or document. */
export function correlationDisplayNames(images: CreatorImage[], decks: { id: string; name: string }[]) {
  const byId = new Map(decks.map(deck => [deck.id, deck.name]));
  return Object.fromEntries(images.map(image => [image.id, (image.archetype_id && byId.get(image.archetype_id)) || image.name]));
}

export const correlationEdgeLabel = (label: string) => label.trim() === "有利" ? "" : label;

/** Reserve two lines inside the existing node rectangle, including in PNG/OBS. */
export function correlationNameStyle(name: string, width: number, height: number) {
  const labelHeight = Math.min(64, height * 0.45);
  const units = Array.from(name).reduce((sum, char) => sum + (char.charCodeAt(0) < 128 ? 0.75 : 1), 0);
  const availableWidth = Math.max(1, width - 8);
  const oneLineFont = availableWidth / Math.max(1, units);
  const fontSize = Math.max(1, Math.min(24, (labelHeight - 4) / 2.4, oneLineFont >= 20 ? oneLineFont : availableWidth * 1.65 / Math.max(1, units)));
  return { labelHeight, fontSize };
}
