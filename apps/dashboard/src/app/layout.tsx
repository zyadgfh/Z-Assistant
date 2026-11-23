import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maya AI — لوحة المساعد الصوتي",
  description: "لوحة تحكم Maya AI: الأجهزة، الأوامر الصوتية، الإعدادات، وسجل التدقيق.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
