import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Salon Note | LINE自動応答の管理",
  description: "美容室のよくある質問とお客様対応を、ひとつの画面で。",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
