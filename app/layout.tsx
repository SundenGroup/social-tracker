import type { Metadata } from "next";
import Providers from "@/components/providers/Providers";
import { THEME_INIT_SCRIPT } from "@/components/providers/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clutch Social",
  description: "Social performance tracker for PUBG Esports partners",
};

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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
