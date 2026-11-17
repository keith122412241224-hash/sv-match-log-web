import type { ReactNode } from "react";

// OBS output is intentionally independent of the browser's saved site theme.
export default function ObsLayout({ children }: { children: ReactNode }) {
  return <div data-theme="light">{children}</div>;
}
