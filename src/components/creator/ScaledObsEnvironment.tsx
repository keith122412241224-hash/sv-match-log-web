"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Measure the untransformed content, then reserve its scaled height in normal flow.
// Neither observed box depends on the reserved outer height (no observer feedback).
export function ScaledObsEnvironment({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const outer = host.current, inner = content.current;
    if (!outer || !inner) return;
    const measure = () => {
      const width = outer.clientWidth, height = inner.offsetHeight;
      setSize(old => old.width === width && old.height === height ? old : { width, height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(outer); observer.observe(inner); measure();
    return () => observer.disconnect();
  }, []);
  const scale = size.width / 1152;
  return <div ref={host} data-obs-environment-wrapper style={{ width: "100%", height: size.height * scale, position: "relative" }}>
    <div ref={content} data-obs-environment-content style={{ width: 1152, position: "absolute", inset: "0 auto auto 0", transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
  </div>;
}
