"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTheme } from "@/components/providers/ThemeProvider";
import { PlatformGlyph, PLATFORM_COLOR, type Platform } from "@/components/icons/PlatformGlyph";

interface SidebarProps {
  /** Whether the mobile drawer is currently open (ignored on desktop). */
  mobileOpen?: boolean;
  /** Called when the sidebar wants to close itself (× button or nav). */
  onClose?: () => void;
}

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
  { href: "/platforms/vk", label: "VK", platform: "vk" },
];

/**
 * Workspace links. `adminOnly` hides the row from viewers — they'd just hit
 * 403s on every mutation over there, so the cleaner UX is to not show it.
 */
const WORKSPACE_ITEMS: (NavItem & { adminOnly?: boolean })[] = [
  { href: "/connections", label: "Connections", adminOnly: true },
  { href: "/profiles", label: "Profiles", adminOnly: true },
  { href: "/settings", label: "Settings", adminOnly: true },
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
  "/platforms/vk",
]);

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isAdmin } = useAuth();
  const { theme } = useTheme();
  const isMobile = useIsMobile(900);
  const profileParam = searchParams.get("profile");

  // Auto-close the drawer whenever the route changes (mobile only).
  // Without this the drawer would stay open after tapping a nav item.
  useEffect(() => {
    if (isMobile && mobileOpen) onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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

  const asideStyle: React.CSSProperties = isMobile
    ? {
        // Mobile — fixed drawer that slides in from the left
        width: 280,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        background: "var(--bg-elev)",
        display: "flex",
        flexDirection: "column",
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        height: "100vh",
        zIndex: 100,
        transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.22s cubic-bezier(.2,.8,.2,1)",
        boxShadow: mobileOpen ? "0 10px 40px rgba(0,0,0,0.25)" : "none",
      }
    : {
        // Desktop — sticky column, unchanged
        width: 232,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        background: "var(--bg-elev)",
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        height: "100vh",
      };

  return (
    <aside style={asideStyle} aria-hidden={isMobile ? !mobileOpen : undefined}>
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
        <Link
          href="/"
          style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flex: 1 }}
        >
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
        {isMobile && (
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              marginLeft: 6,
              width: 30,
              height: 30,
              borderRadius: 7,
              border: "1px solid var(--border)",
              background: "var(--bg-elev)",
              color: "var(--fg-muted)",
              display: "grid",
              placeItems: "center",
              fontSize: 18,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        )}
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

        {/* Workspace group — render only if the current user has anything in it.
            Viewers currently have zero visible items here, so the whole group
            (including the "Workspace" heading) gets dropped for them. */}
        {(() => {
          const visibleWorkspaceItems = WORKSPACE_ITEMS.filter(
            (item) => !item.adminOnly || isAdmin
          );
          const showUsers = isAdmin;
          if (visibleWorkspaceItems.length === 0 && !showUsers) return null;
          return (
            <NavGroup label="Workspace">
              {visibleWorkspaceItems.map((item) => (
                <NavRow
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={isActive(item.href)}
                />
              ))}
              {showUsers && (
                <NavRow
                  href="/users"
                  label="Users"
                  active={isActive("/users")}
                />
              )}
            </NavGroup>
          );
        })()}
      </nav>

      {/* User footer — click avatar/name to open menu */}
      <UserFooter name={user?.name} email={user?.email} initials={initials} />
    </aside>
  );
}

function UserFooter({
  name,
  email,
  initials,
}: {
  name?: string | null;
  email?: string | null;
  initials: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", borderTop: "1px solid var(--border)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: 14,
          width: "100%",
          background: open ? "var(--bg-sunken)" : "transparent",
          border: "none",
          textAlign: "left",
          color: "var(--fg)",
          transition: "background .1s",
        }}
      >
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
            {name ?? "—"}
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
            {email ?? ""}
          </div>
        </div>
        <span
          style={{
            color: "var(--fg-subtle)",
            fontSize: 14,
            fontWeight: 600,
            marginRight: 2,
            transform: open ? "rotate(180deg)" : undefined,
            transition: "transform .15s",
          }}
        >
          ⌄
        </span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            bottom: "calc(100% + 4px)",
            left: 10,
            right: 10,
            background: "var(--bg-elev)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            padding: 6,
            boxShadow: "0 8px 28px rgba(0,0,0,0.14), 0 1px 2px rgba(0,0,0,0.06)",
            zIndex: 50,
          }}
        >
          <MenuRow
            label="My account"
            onClick={() => {
              router.push("/account");
              setOpen(false);
            }}
          />
          <div style={{ height: 1, background: "var(--border)", margin: "4px 2px" }} />
          <MenuRow
            label="Sign out"
            danger
            onClick={() => signOut({ callbackUrl: "/login" })}
          />
        </div>
      )}
    </div>
  );
}

function MenuRow({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      style={{
        display: "block",
        width: "100%",
        padding: "7px 10px",
        borderRadius: 6,
        border: "none",
        background: "transparent",
        color: danger ? "var(--bad)" : "var(--fg)",
        fontSize: 12,
        fontWeight: 600,
        textAlign: "left",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sunken)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {label}
    </button>
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
