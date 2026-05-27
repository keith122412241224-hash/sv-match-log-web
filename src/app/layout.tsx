import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SV Match Log Web",
  description: "Shadowverse: Worlds Beyond向け戦績管理Webアプリ",
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
