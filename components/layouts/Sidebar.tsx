"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/providers/ThemeProvider";
import { PlatformGlyph, PLATFORM_COLOR, type Platform } from "@/components/icons/PlatformGlyph";

interface NavItem {
  href: string;
  label: string;
}

interface PlatformNavItem extends NavItem {
  platform: Platform;
}

const REPORTING_ITEMS: NavItem[] = [
  { href: "/", label: "Overview" },
  { href: "/posts", label: "Post performance" },
  { href: "/top-posts", label: "Top posts" },
  { href: "/period-comparison", label: "Period comparison" },
];

const PLATFORM_ITEMS: PlatformNavItem[] = [
  { href: "/platforms/youtube", label: "YouTube", platform: "youtube" },
  { href: "/platforms/tiktok", label: "TikTok", platform: "tiktok" },
  { href: "/platforms/twitter", label: "X / Twitter", platform: "twitter" },
  { href: "/platforms/instagram", label: "Instagram", platform: "instagram" },
];

/**
 * Workspace links. `adminOnly` hides the row from viewers — they'd just hit
 * 403s on every mutation over there, so the cleaner UX is to not show it.
 */
const WORKSPACE_ITEMS: (NavItem & { adminOnly?: boolean })[] = [
  { href: "/accounts", label: "Accounts", adminOnly: true },
  { href: "/profiles", label: "Profiles", adminOnly: true },
  { href: "/settings", label: "Settings" },
];

// Pages that support profile+date filtering in the querystring
const PROFILE_PAGES = new Set([
  "/",
  "/posts",
  "/top-posts",
  "/period-comparison",
  "/platforms/youtube",
  "/platforms/twitter",
  "/platforms/instagram",
  "/platforms/tiktok",
]);

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isAdmin } = useAuth();
  const { theme } = useTheme();
  const profileParam = searchParams.get("profile");

  function buildHref(href: string): string {
    if (!PROFILE_PAGES.has(href)) return href;
    const params = new URLSearchParams();
    if (profileParam) params.set("profile", profileParam);
    const sd = searchParams.get("startDate");
    const ed = searchParams.get("endDate");
    if (sd) params.set("startDate", sd);
    if (ed) params.set("endDate", ed);
    const qs = params.toString();
    return qs ? `${href}?${qs}` : href;
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const initials = (user?.name ?? "??")
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside
      style={{
        width: 232,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        background: "var(--bg-elev)",
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        height: "100vh",
      }}
    >
      {/* Logo row */}
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          borderBottom: "1px solid var(--border)",
          gap: 10,
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flex: 1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={theme === "dark" ? "/logos/clutch-white.png" : "/logos/clutch-black.png"}
            alt="Clutch Group"
            style={{ height: 22, width: "auto", display: "block" }}
          />
          <span style={{ flex: 1 }} />
          <span
            className="mono"
            style={{
              fontSize: 9,
              color: "var(--fg-muted)",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              paddingLeft: 10,
              borderLeft: "1px solid var(--border)",
            }}
          >
            Social
          </span>
        </Link>
      </div>

      {/* Nav groups */}
      <nav style={{ flex: 1, padding: "14px 10px", overflow: "auto" }}>
        <NavGroup label="Reporting">
          {REPORTING_ITEMS.map((item) => (
            <NavRow
              key={item.href}
              href={buildHref(item.href)}
              label={item.label}
              active={isActive(item.href)}
            />
          ))}
        </NavGroup>

        <NavGroup label="Platforms">
          {PLATFORM_ITEMS.map((item) => (
            <NavRow
              key={item.href}
              href={buildHref(item.href)}
              label={item.label}
              active={isActive(item.href)}
              leading={
                <span style={{ color: PLATFORM_COLOR[item.platform], display: "flex" }}>
                  <PlatformGlyph platform={item.platform} size={13} />
                </span>
              }
            />
          ))}
        </NavGroup>

        <NavGroup label="Workspace">
          {WORKSPACE_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <NavRow
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActive(item.href)}
            />
          ))}
          {isAdmin && (
            <NavRow
              href="/users"
              label="Users"
              active={isActive("/users")}
            />
          )}
        </NavGroup>
      </nav>

      {/* User footer */}
      <div style={{ padding: 14, borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "var(--accent)",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontWeight: 700,
              fontSize: 11,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--fg)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.name ?? "—"}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--fg-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.email ?? ""}
            </div>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            width: "100%",
            padding: "6px 10px",
            borderRadius: 7,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--fg-muted)",
            fontSize: 11,
            fontWeight: 600,
            textAlign: "left",
          }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          padding: "0 10px 6px",
          fontSize: 10,
          fontWeight: 600,
          color: "var(--fg-subtle)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function NavRow({
  href,
  label,
  active,
  leading,
}: {
  href: string;
  label: string;
  active: boolean;
  leading?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 10px",
        borderRadius: 7,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? "var(--fg)" : "var(--fg-muted)",
        background: active ? "var(--bg-sunken)" : "transparent",
        textDecoration: "none",
        marginBottom: 1,
        position: "relative",
      }}
    >
      {leading ?? (
        <span
          style={{
            width: 13,
            height: 13,
            display: "inline-block",
            borderRadius: 3,
            background: active ? "var(--accent)" : "var(--border-strong)",
          }}
        />
      )}
      {label}
      {active && (
        <span
          style={{
            position: "absolute",
            left: -10,
            top: 6,
            bottom: 6,
            width: 2,
            borderRadius: 2,
            background: "var(--accent)",
          }}
        />
      )}
    </Link>
  );
}
