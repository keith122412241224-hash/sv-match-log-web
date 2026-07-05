import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Grid3X3, Home, ListPlus, LockKeyhole, LogOut, Swords } from "lucide-react";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";
import { BrandMark } from "@/components/BrandMark";
import { SubmitButton } from "@/components/SubmitButton";
import { getCurrentUser, getIsAdmin } from "@/lib/data";

const navItems = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/matches", label: "戦績入力", icon: ListPlus },
  { href: "/decks", label: "デッキ管理", icon: Swords },
  { href: "/analysis", label: "分析", icon: BarChart3 },
  { href: "/matrix", label: "相性表", icon: Grid3X3 }
];

export async function AppShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = await getIsAdmin();
  const items = isAdmin ? [...navItems, { href: "/admin", label: "管理", icon: LockKeyhole }] : navItems;

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2 font-bold text-ink">
            <BrandMark className="size-8 sm:size-9" />
            <span className="hidden sm:inline">SV Match Log Web</span>
            <span className="sm:hidden">SVML</span>
          </Link>
          <form action={signOut} className="shrink-0">
            <SubmitButton className="inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-sm font-semibold text-muted hover:bg-slate-100 sm:px-3" pendingLabel="ログアウト中..." type="submit" variant="ghost">
              <LogOut size={17} aria-hidden="true" />
              <span className="hidden sm:inline">ログアウト</span>
            </SubmitButton>
          </form>
        </div>
        <nav
          className="mx-auto grid max-w-7xl gap-1 px-2 pb-2 sm:flex sm:overflow-x-auto sm:px-4 sm:pb-3"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                className="inline-flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[11px] font-semibold leading-none text-muted hover:bg-slate-100 hover:text-ink sm:min-h-10 sm:shrink-0 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm"
                href={item.href}
                key={item.href}
                prefetch
              >
                <Icon className="shrink-0" size={17} aria-hidden="true" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">{children}</main>
    </div>
  );
}
