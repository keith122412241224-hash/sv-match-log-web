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

const jstDateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

export function formatJstDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return jstDateTimeFormatter.format(date);
}

export function getMostRecentlyCreatedId<T extends { id: string; created_at: string }>(items: T[]) {
  return items.reduce((latest, item) => {
    if (!latest) {
      return item;
    }

    return new Date(item.created_at).getTime() > new Date(latest.created_at).getTime() ? item : latest;
  }, null as T | null)?.id ?? "";
}
