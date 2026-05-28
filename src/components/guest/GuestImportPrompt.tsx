"use client";

import { useEffect, useMemo, useState } from "react";
import { importGuestMatches } from "@/app/actions";
import { GUEST_MATCHES_STORAGE_KEY, type StoredGuestMatch } from "@/lib/guest-storage";

export function GuestImportPrompt({ importCount }: { importCount?: number | null }) {
  const [matches, setMatches] = useState<StoredGuestMatch[]>([]);

  useEffect(() => {
    if (typeof importCount === "number" && importCount > 0) {
      window.localStorage.removeItem(GUEST_MATCHES_STORAGE_KEY);
      setMatches([]);
      return;
    }

    const raw = window.localStorage.getItem(GUEST_MATCHES_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setMatches(parsed);
      }
    } catch {
      window.localStorage.removeItem(GUEST_MATCHES_STORAGE_KEY);
    }
  }, [importCount]);

  const payload = useMemo(() => JSON.stringify(matches), [matches]);

  if (matches.length === 0) {
    return typeof importCount === "number" && importCount > 0 ? (
      <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
        ゲスト戦績 {importCount} 件を正式データとして保存しました。
      </p>
    ) : null;
  }

  return (
    <section className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-4">
      {importCount === 0 ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          ゲスト戦績を取り込めませんでした。時間をおいて再度お試しください。
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <h2 className="font-bold text-amber-950">ゲスト入力した戦績があります</h2>
          <p className="mt-1 text-sm leading-6 text-amber-950">
            この端末に保存されているゲスト戦績 {matches.length} 件を、ログイン中の正式データとして保存できます。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={importGuestMatches}>
            <input name="guest_matches_json" type="hidden" value={payload} />
            <button className="min-h-11 rounded-md bg-ink px-4 text-sm font-bold text-white" type="submit">
              正式データに取り込む
            </button>
          </form>
          <button
            className="min-h-11 rounded-md border border-amber-300 bg-white px-4 text-sm font-bold text-amber-950"
            onClick={() => {
              window.localStorage.removeItem(GUEST_MATCHES_STORAGE_KEY);
              setMatches([]);
            }}
            type="button"
          >
            破棄
          </button>
        </div>
      </div>
    </section>
  );
}
