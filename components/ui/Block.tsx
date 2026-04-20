"use client";

import { useTheme } from "@/components/providers/ThemeProvider";

interface BlockProps {
  eyebrow?: string;
  title?: string;
  sub?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  /** No padding on the body — the child manages its own */
  flush?: boolean;
  className?: string;
}

/**
 * Section wrapper: eyebrow label + title + optional subtitle, framed.
 * Switches look between modern (soft card) and courtside (hard-edge, serif title).
 */
export function Block({ eyebrow, title, sub, rightSlot, children, flush, className }: BlockProps) {
  const { direction } = useTheme();
  const isCourt = direction === "courtside";

  return (
    <section
      className={className}
      style={{
        background: "var(--bg-elev)",
        border: isCourt ? "1px solid var(--fg)" : "1px solid var(--border)",
        borderRadius: isCourt ? 0 : 16,
        padding: flush ? 0 : 20,
      }}
    >
      {(eyebrow || title || rightSlot) && (
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: flush ? 0 : 16,
            padding: flush ? "20px 20px 16px" : 0,
            paddingBottom: isCourt ? 10 : undefined,
            borderBottom: isCourt ? "1px solid var(--fg)" : undefined,
          }}
        >
          <div>
            {eyebrow && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: isCourt ? "0.2em" : "0.14em",
                  textTransform: "uppercase",
                  color: "var(--fg-subtle)",
                }}
              >
                {eyebrow}
              </div>
            )}
            {title && (
              <h2
                className={isCourt ? "serif" : undefined}
                style={{
                  margin: "4px 0 0",
                  fontSize: isCourt ? 28 : 16,
                  fontWeight: isCourt ? 400 : 700,
                  letterSpacing: isCourt ? "-0.02em" : "-0.01em",
                  lineHeight: 1.1,
                }}
              >
                {title}
              </h2>
            )}
            {sub && (
              <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 4 }}>{sub}</div>
            )}
          </div>
          {rightSlot && <div>{rightSlot}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
