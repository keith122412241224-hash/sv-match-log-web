import { BrandMark } from "@/components/BrandMark";

export default function Loading() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 font-bold text-ink">
            <BrandMark className="size-9" />
            <span className="hidden sm:inline">SV Match Log Web</span>
            <span className="sm:hidden">SVML</span>
          </div>
          <div className="h-10 w-24 rounded-md bg-slate-100" />
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3">
          {["/", "/matches", "/decks", "/analysis", "/matrix"].map((href) => (
            <div className="h-10 w-24 shrink-0 rounded-md bg-slate-100" key={href} />
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid gap-6">
          <section>
            <div className="h-8 w-40 rounded bg-slate-200" />
            <div className="mt-2 h-5 w-72 max-w-full rounded bg-slate-100" />
          </section>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div className="h-24 rounded-md border border-slate-200 bg-white p-4" key={index}>
                <div className="h-4 w-20 rounded bg-slate-100" />
                <div className="mt-4 h-7 w-16 rounded bg-slate-200" />
              </div>
            ))}
          </section>
          <section className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="h-5 w-36 rounded bg-slate-200" />
            </div>
            <div className="grid gap-3 p-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div className="h-11 rounded bg-slate-50" key={index} />
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
