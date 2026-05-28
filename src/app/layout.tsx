import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://sv-match-log-web.vercel.app").replace(/\/$/, "");
const GOOGLE_SITE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SV Match Log Web | シャドバWB向け戦績管理ツール",
    template: "%s | SV Match Log Web"
  },
  description: "Shadowverse: Worlds Beyondの戦績入力、勝率分析、対面勝率、相性表作成ができる無料Webツールです。",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "SV Match Log Web",
    description: "Shadowverse: Worlds Beyond向けの無料戦績管理Webツール。戦績入力から勝率分析、対面勝率、相性表まで対応。",
    url: SITE_URL,
    siteName: "SV Match Log Web",
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: "/icon/sv-match-log-icon.png",
        width: 512,
        height: 512,
        alt: "SV Match Log Web"
      }
    ]
  },
  twitter: {
    card: "summary",
    title: "SV Match Log Web",
    description: "Shadowverse: Worlds Beyond向けの無料戦績管理Webツール。",
    images: ["/icon/sv-match-log-icon.png"]
  },
  verification: GOOGLE_SITE_VERIFICATION
    ? {
        google: GOOGLE_SITE_VERIFICATION
      }
    : undefined,
  icons: {
    icon: "/icon/sv-match-log-icon.png",
    apple: "/icon/sv-match-log-icon.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
