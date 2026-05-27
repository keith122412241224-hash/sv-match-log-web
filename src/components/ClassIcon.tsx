import Image from "next/image";
import { cn } from "@/lib/utils";
import { SHADOWVERSE_CLASSES } from "@/lib/constants";

export type ShadowverseClass = (typeof SHADOWVERSE_CLASSES)[number];

export function isShadowverseClass(value: string): value is ShadowverseClass {
  return SHADOWVERSE_CLASSES.includes(value as ShadowverseClass);
}

export function classIconSrc(className: string) {
  return `/classicon/${encodeURIComponent(className)}.png`;
}

export function ClassIcon({
  className,
  size = 28,
  showLabel = false,
  imageClassName
}: {
  className: string;
  size?: number;
  showLabel?: boolean;
  imageClassName?: string;
}) {
  if (!isShadowverseClass(className)) {
    return showLabel ? <span className="text-xs text-muted">{className}</span> : null;
  }

  return (
    <span className="inline-flex items-center gap-1.5" title={className}>
      <Image
        alt={className}
        className={cn("shrink-0 rounded-full", imageClassName)}
        height={size}
        src={classIconSrc(className)}
        width={size}
      />
      {showLabel ? <span className="sr-only">{className}</span> : null}
    </span>
  );
}

export function ClassIconOnly({ className, size = 28 }: { className: string; size?: number }) {
  return <ClassIcon className={className} size={size} />;
}

export function DeckWithClassIcon({
  name,
  className,
  iconSize = 24,
  compact = false
}: {
  name: string;
  className: string;
  iconSize?: number;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <ClassIcon className={className} size={iconSize} />
      <span className={cn("truncate font-semibold", compact ? "text-xs" : "text-sm")}>{name}</span>
    </span>
  );
}
