import type { ReactNode } from "react";
import publication from "../../docs/legal-publication.json";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { LegalLinks } from "@/components/LegalLinks";
import { ThemeSelect } from "@/components/ThemeProvider";

export const supportEmail = "svmatchlog.support@gmail.com";

export function SupportEmail() {
  return <a className="break-all" href={`mailto:${supportEmail}`}>{supportEmail}</a>;
}

type Section = { title: string; body: ReactNode; id?: string };

export function LegalDocument({ title, intro, sections, dateLabel }: {
  title: string; intro: string; sections: Section[]; dateLabel: string;
}) {
  if (!publication.date && process.env.VERCEL_ENV === "production") {
    throw new Error("本番反映日の日本時間の日付を docs/legal-publication.json に記入してください。");
  }
  return (
    <main className="min-h-screen bg-surface text-ink">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link className="flex items-center gap-2 font-bold" href="/"><BrandMark className="size-10" />SV Match Log</Link>
          <ThemeSelect />
          <Link className="rounded-md px-3 py-2 text-sm font-semibold text-muted hover:bg-slate-100 hover:text-ink" href="/">トップへ</Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-8 sm:py-10">
        <header className="border-b border-slate-200 pb-5">
          <h1 className="text-3xl font-black sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-muted">{intro}</p>
        </header>
        {sections.map(({ title: heading, body, id }) => (
          <section key={heading} id={id} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-ink">{heading}</h2>
            <div className="mt-3 grid gap-3 text-sm leading-7 text-muted [&_a]:font-semibold [&_a]:text-emerald-700 [&_a]:underline [&_a]:underline-offset-2 [&_li]:my-1 [&_ul]:list-disc [&_ul]:pl-5">{body}</div>
          </section>
        ))}
        <p className="text-sm font-semibold text-muted">{dateLabel}：{publication.date ?? "未公開"}</p>
        <LegalLinks />
      </div>
    </main>
  );
}
