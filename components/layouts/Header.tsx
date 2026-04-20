"use client";

import { useTheme } from "@/components/providers/ThemeProvider";
import { MoonIcon, SunIcon, DownloadIcon } from "@/components/icons/PlatformGlyph";
import ProfileSelector from "@/components/common/ProfileSelector";

interface HeaderProps {
  title: string;
  subtitle?: string;
  /** Controls rendered on the right side of the top bar (e.g. DateRangePicker) */
  children?: React.ReactNode;
  /** Hide the profile selector (e.g. for admin pages where it doesn't apply) */
  hideProfile?: boolean;
  /** Hide the export button (not all pages have exports) */
  hideExport?: boolean;
  onExport?: () => void;
}

/**
 * Redesigned top bar:
 *   left  → h1 + subtitle + ProfileSelector
 *   right → custom controls (date range pills) + theme toggle + export button
 */
export default function Header({ title, subtitle, children, hideProfile, hideExport, onExport }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div
      style={{
        padding: "18px 28px 14px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div>
            <h1
              className="display"
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: "var(--fg)",
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{subtitle}</div>
            )}
          </div>
          {!hideProfile && (
            <>
              <div style={{ width: 1, height: 22, background: "var(--border)" }} />
              <ProfileSelector />
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {children}
          <button
            onClick={toggleTheme}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            title={theme === "light" ? "Dark mode" : "Light mode"}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-elev)",
              display: "grid",
              placeItems: "center",
              color: "var(--fg-muted)",
            }}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
          {!hideExport && onExport && (
            <button
              onClick={onExport}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                borderRadius: 8,
                background: "var(--fg)",
                color: "var(--bg-elev)",
                border: "none",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <DownloadIcon /> Export
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
