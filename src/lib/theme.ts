export const THEME_STORAGE_KEY = "svml.theme.v1";
export type ThemePreference = "light" | "dark" | "system";

export function themePreference(value: unknown): ThemePreference {
  return value === "dark" || value === "system" ? value : "light";
}

export function isObsPath(pathname: string) {
  return /^\/admin\/obs(?:\/|$)/.test(pathname);
}

export function resolvedTheme(preference: ThemePreference, systemDark: boolean, pathname: string) {
  return !isObsPath(pathname) && (preference === "dark" || (preference === "system" && systemDark)) ? "dark" : "light";
}

// Synchronous head script: resolve the saved preference before the first body paint.
// Keep self-contained so it also works before React and with unavailable storage.
export const THEME_BOOTSTRAP = `(()=>{let p="light";try{const v=localStorage.getItem("${THEME_STORAGE_KEY}");if(v==="dark"||v==="system")p=v}catch{}const r=document.documentElement;r.dataset.themePreference=p;r.dataset.theme=!/^\\/admin\\/obs(?:\\/|$)/.test(location.pathname)&&(p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))?"dark":"light"})()`;
