"use client";

import { useState } from "react";
import { ClassIcon } from "@/components/ClassIcon";
import { SHADOWVERSE_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function ClassPicker({
  name = "class_name",
  defaultValue = SHADOWVERSE_CLASSES[0],
  compact = false
}: {
  name?: string;
  defaultValue?: string;
  compact?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="grid gap-2">
      <input name={name} type="hidden" value={value} />
      <div className={compact ? "flex flex-wrap gap-1.5" : "grid grid-cols-4 gap-2 sm:grid-cols-7"}>
        {SHADOWVERSE_CLASSES.map((className) => (
          <button
            aria-label={className}
            className={cn(
              "grid place-items-center rounded-md border bg-white transition",
              compact ? "size-10 p-1" : "min-h-14 p-2",
              value === className ? "border-ink ring-2 ring-slate-300" : "border-slate-300 hover:border-slate-500"
            )}
            key={className}
            onClick={() => setValue(className)}
            title={className}
            type="button"
          >
            <ClassIcon className={className} size={compact ? 26 : 32} />
          </button>
        ))}
      </div>
    </div>
  );
}
