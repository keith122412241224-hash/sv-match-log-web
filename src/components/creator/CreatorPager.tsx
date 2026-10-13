"use client";
import { useState } from "react";
import { creatorRead, type CreatorPage } from "@/lib/creator/pagination";
import styles from "./Creator.module.css";

export function useCreatorPage<T, P extends CreatorPage<T>>(kind: "images" | "works", initial: P) {
  const [page, setPage] = useState(initial);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState(0);
  async function load(target: number) {
    const cursor = target === 0 ? null : target === index + 1 ? page.nextCursor : cursors[target];
    if (target < 0 || (target > 0 && !cursor)) return;
    setLoading(true); setError(null); setRetryTarget(target);
    try {
      const next = await creatorRead<P>(kind, cursor);
      setPage(next); setIndex(target);
      setCursors(old => [...old.slice(0, target), cursor]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "一覧を取得できませんでした。");
      throw e;
    } finally { setLoading(false); }
  }
  return { page, setPage, index, loading, error, retryTarget, load };
}

export function CreatorPager({ label, index, hasNext, busy, loading, error, onPage, onRetry }: {
  label: string; index: number; hasNext: boolean; busy: boolean; loading: boolean;
  error: string | null; onPage: (index: number) => void; onRetry: () => void;
}) {
  return <div aria-label={`${label}のページ移動`} aria-busy={loading}>
    <div className={styles.toolbar}>
      <button disabled={busy || index === 0} onClick={() => onPage(index - 1)}>前の{label}</button>
      <span>{index + 1}ページ</span>
      {hasNext && <button disabled={busy} onClick={() => onPage(index + 1)}>次の{label}</button>}
      <button disabled={busy} onClick={() => onPage(0)}>最新の{label}</button>
      {loading && <span role="status">読み込み中…</span>}
    </div>
    {error && <div role="alert"><p>{error}</p><button disabled={busy} onClick={onRetry}>再試行</button></div>}
  </div>;
}
