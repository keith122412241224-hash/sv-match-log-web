"use client";

import { ImageIcon } from "lucide-react";
import { useState } from "react";

export function GuideScreenshot({
  src,
  alt,
  label
}: {
  src?: string;
  alt: string;
  label: string;
}) {
  const [failed, setFailed] = useState(!src);

  return (
    <figure className="overflow-hidden rounded-md border border-slate-200 bg-white">
      {!failed && src ? (
        <img
          alt={alt}
          className="aspect-[16/10] w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
          src={src}
        />
      ) : (
        <div className="grid aspect-[16/10] place-items-center bg-slate-50 px-4 text-center">
          <div>
            <ImageIcon className="mx-auto text-slate-300" size={36} aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-muted">{label}</p>
          </div>
        </div>
      )}
      <figcaption className="border-t border-slate-100 px-3 py-2 text-xs font-semibold text-muted">{alt}</figcaption>
    </figure>
  );
}
