"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { importGuestMatches } from "@/app/actions";
import { GUEST_MATCHES_STORAGE_KEY, identifyGuestMatches, removeImportedGuestMatches } from "@/lib/guest-storage";

export function GuestImportPrompt() {
  const [count, setCount] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);

  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(GUEST_MATCHES_STORAGE_KEY) ?? "[]");
      if (!Array.isArray(parsed)) throw new Error();
      setCount(parsed.length);
    } catch {
      setMessage("端末の戦績を読み込めませんでした。データは削除していません。");
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage("");
    try {
      const submitted = identifyGuestMatches(window.localStorage.getItem(GUEST_MATCHES_STORAGE_KEY) ?? "[]");
      window.localStorage.setItem(GUEST_MATCHES_STORAGE_KEY, submitted);
      const form = new FormData();
      form.set("guest_matches_json", submitted);
      const result = await importGuestMatches(form);
      if (result.ok && result.importedIds.length > 0) {
        const latest = window.localStorage.getItem(GUEST_MATCHES_STORAGE_KEY) ?? "[]";
        const remaining = removeImportedGuestMatches(latest, submitted, result.importedIds);
        window.localStorage.setItem(GUEST_MATCHES_STORAGE_KEY, remaining);
        setCount(JSON.parse(remaining).length);
      }
      setMessage(result.message);
    } catch {
      setMessage("取り込み結果を確認できませんでした。端末の戦績は保持しています。再試行する前にホームの保存済み戦績を確認してください。");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  if (count === 0) return message ? <p role="status" className="rounded-md border border-slate-200 bg-white p-3 text-sm">{message}</p> : null;

  return (
    <section className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-4">
      {message ? <p role="status" className="text-sm font-semibold text-amber-950">{message}</p> : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <h2 className="font-bold text-amber-950">ゲスト入力した戦績があります</h2>
          <p className="mt-1 text-sm leading-6 text-amber-950">この端末に保存されているゲスト戦績 {count} 件を、ログイン中の正式データとして保存できます。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form onSubmit={submit}>
            <button className="min-h-11 rounded-md bg-ink px-4 text-sm font-bold text-white" disabled={pending} type="submit">
              {pending ? "取り込み中..." : "正式データに取り込む"}
            </button>
          </form>
          <button className="min-h-11 rounded-md border border-amber-300 bg-white px-4 text-sm font-bold text-amber-950" disabled={pending} type="button"
            onClick={() => { window.localStorage.removeItem(GUEST_MATCHES_STORAGE_KEY); setCount(0); setMessage(""); }}>
            破棄
          </button>
        </div>
      </div>
    </section>
  );
}
