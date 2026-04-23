"use client";

import { useTheme } from "@/components/providers/ThemeProvider";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { theme } = useTheme();

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: "40px 20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Brand header — matches the sidebar treatment */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            marginBottom: 28,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={theme === "dark" ? "/logos/clutch-white.png" : "/logos/clutch-black.png"}
            alt="Clutch Group"
            style={{ height: 28, width: "auto", display: "block" }}
          />
          <span
            className="mono"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--fg-muted)",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              paddingLeft: 12,
              borderLeft: "1px solid var(--border)",
            }}
          >
            Social
          </span>
        </div>

        {/* Card */}
        <div
          style={{
            background: "var(--bg-elev)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 32,
            boxShadow: "0 1px 3px rgba(5,9,14,0.04)",
          }}
        >
          {children}
        </div>

        {/* Footer tagline */}
        <div
          style={{
            marginTop: 20,
            textAlign: "center",
            fontSize: 11,
            color: "var(--fg-subtle)",
          }}
        >
          Social performance tracker for esports partners
        </div>
      </div>
    </div>
  );
}
