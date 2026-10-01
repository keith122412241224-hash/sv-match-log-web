"use client";

import { useEffect } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

export type SaveNotification = { id: number; kind: "success" | "error" };

export function SaveToast({ notification, onDismiss }: {
  notification: SaveNotification | null; onDismiss: () => void;
}) {
  useEffect(() => {
    if (notification?.kind !== "success") return;
    const timeout = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timeout);
  }, [notification, onDismiss]);
  return <div className="pointer-events-none fixed inset-x-2 top-[max(1rem,env(safe-area-inset-top))] z-50 mx-auto w-auto max-w-md">
    <div role="status" aria-atomic="true">
      {notification?.kind === "success" ? <div key={notification.id} className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-lg"><CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />戦績を保存しました</div> : null}
    </div>
    <div role="alert" aria-atomic="true">
      {notification?.kind === "error" ? <div key={notification.id} className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 shadow-lg"><CircleAlert aria-hidden="true" className="size-5 shrink-0" /><span className="min-w-0 flex-1 break-words">戦績の保存に失敗しました。入力画面のエラー詳細を確認してください。</span><button type="button" aria-label="通知を閉じる" onClick={onDismiss} className="pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded focus-visible:ring-2"><X aria-hidden="true" size={18} /></button></div> : null}
    </div>
  </div>;
}
