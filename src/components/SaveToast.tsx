"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

export type SaveNotification = { id: number; kind: "success" | "error"; message?: string };

export function SaveToast({ notification, onDismiss }: {
  notification: SaveNotification | null; onDismiss: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    function position() {
      const toast = container.current;
      if (!toast || !notification) {
        document.documentElement.style.removeProperty("--save-toast-clearance");
        return;
      }
      toast.style.bottom = "max(1rem, env(safe-area-inset-bottom))";
      const box = toast.getBoundingClientRect();
      const buttons = [...(toast.closest("form")?.querySelectorAll<HTMLButtonElement>('button[type="submit"]') ?? [])]
        .map(button => button.getBoundingClientRect()).filter(button => button.height > 0 && button.bottom > 0 && button.top < innerHeight);
      if (buttons.some(button => box.top < button.bottom && box.bottom > button.top)) {
        // A click can leave the save controls near the viewport edge. Keep the
        // notification above the whole save group in that case, without scrolling.
        toast.style.bottom = `${innerHeight - Math.min(...buttons.map(button => button.top)) + 8}px`;
      }
      // Keep the navigation badge above this notification without moving the Toast.
      document.documentElement.style.setProperty("--save-toast-clearance", `${innerHeight - toast.getBoundingClientRect().top + 8}px`);
    }
    position();
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("resize", position);
      document.documentElement.style.removeProperty("--save-toast-clearance");
    };
  }, [notification]);
  useEffect(() => {
    if (notification?.kind !== "success") return;
    const timeout = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timeout);
  }, [notification, onDismiss]);
  // Keep the chosen viewport position during scrolling; only a new notification
  // or viewport resize recalculates it. Transparent areas never capture clicks.
  return <div ref={container} className="pointer-events-none fixed inset-x-2 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto w-auto max-w-md">
    <div role="status" aria-atomic="true">
      {notification?.kind === "success" ? <div key={notification.id} className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-lg"><CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />{notification.message ?? "戦績を保存しました"}</div> : null}
    </div>
    <div role="alert" aria-atomic="true">
      {notification?.kind === "error" ? <div key={notification.id} className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 shadow-lg"><CircleAlert aria-hidden="true" className="size-5 shrink-0" /><span className="min-w-0 flex-1 break-words">戦績の保存に失敗しました。入力画面のエラー詳細を確認してください。</span><button type="button" aria-label="通知を閉じる" onClick={onDismiss} className="pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded focus-visible:ring-2"><X aria-hidden="true" size={18} /></button></div> : null}
    </div>
  </div>;
}
