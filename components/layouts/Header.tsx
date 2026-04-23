"use client";

import { useTheme } from "@/components/providers/ThemeProvider";
import { MoonIcon, SunIcon, DownloadIcon } from "@/components/icons/PlatformGlyph";
import ProfileSelector from "@/components/common/ProfileSelector";
import { useMobileNav } from "@/components/layouts/MobileNavProvider";

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

function MenuIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

/**
 * Top bar. Responsive layout:
 *   - ≤ 640px: hamburger → drawer, title only, hide profile picker + divider
 *              + export button. Date range pills and theme toggle stay.
 *   - > 640px: full chrome.
 */
export default function Header({ title, subtitle, children, hideProfile, hideExport, onExport }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { setOpen } = useMobileNav();

  return (
    <div
      className="topbar-pad"
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
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 auto" }}>
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="show-sm-flex"
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-elev)",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--fg)",
              flexShrink: 0,
            }}
          >
            <MenuIcon />
          </button>
          <div style={{ minWidth: 0, flex: "0 1 auto" }}>
            <h1
              className="display h-title"
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: "var(--fg)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </h1>
            {subtitle && (
              <div
                className="h-sub"
                style={{
                  fontSize: 12,
                  color: "var(--fg-muted)",
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          {!hideProfile && (
            <>
              <div
                className="hide-sm"
                style={{ width: 1, height: 22, background: "var(--border)" }}
              />
              <div className="hide-sm">
                <ProfileSelector />
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
              flexShrink: 0,
            }}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
          {!hideExport && onExport && (
            <button
              onClick={onExport}
              className="hide-sm"
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
