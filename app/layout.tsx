import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "活動報名平台｜Event Register System",
    template: "%s｜活動報名平台",
  },
  description: "雜誌式活動展示、網上及親身報名、QR Code 電子入場證與現場登記。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant-HK">
      <body>{children}</body>
    </html>
  );
}
