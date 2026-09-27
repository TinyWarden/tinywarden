import type { Metadata } from "next";
import { locale, messages } from "@/i18n/messages";
import "./globals.css";

export const metadata: Metadata = messages.metadata;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={locale}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-6">
          {messages.navigation.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}
