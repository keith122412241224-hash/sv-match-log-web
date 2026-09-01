import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }

  return `${Math.round(value * 10) / 10}%`;
}

export function getMostRecentlyCreatedId<T extends { id: string; created_at: string }>(items: T[]) {
  return items.reduce((latest, item) => {
    if (!latest) {
      return item;
    }

    return new Date(item.created_at).getTime() > new Date(latest.created_at).getTime() ? item : latest;
  }, null as T | null)?.id ?? "";
}
