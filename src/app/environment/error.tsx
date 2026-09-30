"use client";
export default function EnvironmentError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-7xl space-y-4 p-6"><h1 className="text-xl font-bold">環境データ</h1><p role="alert">環境データを取得できませんでした。</p><button onClick={reset} className="min-h-11 rounded-md border border-slate-300 px-4">再試行</button></main>;
}
