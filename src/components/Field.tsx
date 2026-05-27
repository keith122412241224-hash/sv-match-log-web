import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import type { ReactNode } from "react";

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-ink">{children}</label>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none transition focus:border-slate-700 focus:ring-2 focus:ring-slate-200",
        props.className
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none transition focus:border-slate-700 focus:ring-2 focus:ring-slate-200",
        props.className
      )}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-28 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none transition focus:border-slate-700 focus:ring-2 focus:ring-slate-200",
        props.className
      )}
    />
  );
}
