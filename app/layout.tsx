import type { Metadata } from "next";
import Providers from "@/components/providers/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clutch Social Tracker",
  description: "Social Media Performance Tracker for PUBG Esports",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
