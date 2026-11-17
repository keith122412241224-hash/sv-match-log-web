"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { resolvedTheme, themePreference, THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";

const ThemeContext = createContext<{ preference: ThemePreference; setPreference: (value: ThemePreference) => void }>({
  preference: "light", setPreference: () => {}
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [preference, setPreferenceState] = useState<ThemePreference>("light");

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const root = document.documentElement;
    const apply = (value: ThemePreference) => {
      root.dataset.themePreference = value;
      root.dataset.theme = resolvedTheme(value, media.matches, pathname);
      setPreferenceState(value);
    };
    // The root also retains the choice in memory when storage is blocked.
    apply(themePreference(root.dataset.themePreference));
    const systemChanged = () => apply(themePreference(root.dataset.themePreference));
    const storageChanged = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) apply(themePreference(event.newValue));
    };
    media.addEventListener("change", systemChanged);
    window.addEventListener("storage", storageChanged);
    return () => {
      media.removeEventListener("change", systemChanged);
      window.removeEventListener("storage", storageChanged);
    };
  }, [pathname]);

  function setPreference(value: ThemePreference) {
    const next = themePreference(value);
    try { window.localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* Keep the in-memory choice. */ }
    document.documentElement.dataset.themePreference = next;
    document.documentElement.dataset.theme = resolvedTheme(next, window.matchMedia("(prefers-color-scheme: dark)").matches, pathname);
    setPreferenceState(next);
  }

  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>;
}

export function ThemeSelect() {
  const { preference, setPreference } = useContext(ThemeContext);
  return <select aria-label="表示テーマ" title="表示テーマ" value={preference}
    onChange={event => setPreference(themePreference(event.target.value))}
    className="min-h-11 w-20 shrink-0 rounded-md border border-slate-300 bg-white px-1 text-xs text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-28 sm:px-2 sm:text-sm">
    <option value="light">ライト</option>
    <option value="dark">ダーク</option>
    <option value="system">OS連動</option>
  </select>;
}
