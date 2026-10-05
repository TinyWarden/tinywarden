import type { Metadata } from "next";
import { locale, messages } from "@/i18n/messages";
import { FleetStatusBoundary } from "@/components/operator/fleet-status";
import "./globals.css";

export const metadata: Metadata = { ...messages.metadata, icons: { icon: "/brand/favicon.svg" } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={locale}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-6">
          {messages.navigation.skipToContent}
        </a>
        <FleetStatusBoundary>{children}</FleetStatusBoundary>
      </body>
    </html>
  );
}
