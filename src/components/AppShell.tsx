import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Grid3X3, Home, ListPlus, LockKeyhole, LogOut, Swords } from "lucide-react";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";
import { BrandMark } from "@/components/BrandMark";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const navItems = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/matches", label: "戦績入力", icon: ListPlus },
  { href: "/decks", label: "デッキ管理", icon: Swords },
  { href: "/analysis", label: "分析", icon: BarChart3 },
  { href: "/matrix", label: "相性表", icon: Grid3X3 }
];

export async function AppShell({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  const items = adminUser ? [...navItems, { href: "/admin", label: "管理", icon: LockKeyhole }] : navItems;

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-ink">
            <BrandMark className="size-9" />
            <span className="hidden sm:inline">SV Match Log Web</span>
            <span className="sm:hidden">SVML</span>
          </Link>
          <form action={signOut}>
            <button className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-muted hover:bg-slate-100" type="submit">
              <LogOut size={17} aria-hidden="true" />
              <span className="hidden sm:inline">ログアウト</span>
            </button>
          </form>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold text-muted hover:bg-slate-100 hover:text-ink"
                href={item.href}
                key={item.href}
              >
                <Icon size={17} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
