import { cn } from "@/lib/utils";

export function BrandMark({ className, imageClassName }: { className?: string; imageClassName?: string }) {
  return (
    <span className={cn("grid place-items-center overflow-hidden rounded-md bg-white ring-1 ring-slate-200", className)}>
      <img
        alt=""
        aria-hidden="true"
        className={cn("h-full w-full object-contain", imageClassName)}
        src="/icon/sv-match-log-icon.png"
      />
    </span>
  );
}
