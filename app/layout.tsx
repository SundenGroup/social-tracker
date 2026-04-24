import type { Metadata, Viewport } from "next";
import Script from "next/script";
import Providers from "@/components/providers/Providers";
import { THEME_INIT_SCRIPT } from "@/components/providers/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clutch Social",
  description: "Social performance tracker for PUBG Esports partners",
};

// Responsive viewport — previously missing, which broke mobile layouts on
// iOS/Android (pages rendered at desktop width and shrank to fit).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

// Umami visitor analytics — self-hosted at stats.clutch.game. The script
// only loads in production when NEXT_PUBLIC_UMAMI_WEBSITE_ID is set, so
// dev + preview builds don't pollute the dashboard. Umami is cookie-free
// and privacy-respecting, so no consent banner is required.
const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
const UMAMI_SRC =
  process.env.NEXT_PUBLIC_UMAMI_SRC ?? "https://stats.clutch.game/script.js";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" data-direction="modern" suppressHydrationWarning>
      <head>
        {/* Blocking script: set data-theme/direction from localStorage BEFORE first paint
            so there's no flash of wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        {UMAMI_WEBSITE_ID && (
          <Script
            src={UMAMI_SRC}
            data-website-id={UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
            async
            defer
          />
        )}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
