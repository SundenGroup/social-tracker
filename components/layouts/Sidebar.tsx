"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useProfiles } from "@/hooks/useProfiles";
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
  icon?: React.ReactNode;
}

interface PlatformNavItem extends NavItem {
  platform: Platform;
}

/* Minimal 13px line icons so each Reporting item is visually distinct
   (the old placeholder was an identical gray square on every row). */
const navIcon = (d: string) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const REPORTING_ITEMS: NavItem[] = [
  // Overview: 2x2 dashboard grid
  { href: "/", label: "Overview", icon: navIcon("M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z") },
  // Posts: list rows — every individual post
  { href: "/posts", label: "Posts", icon: navIcon("M4 6h16M4 12h16M4 18h10") },
  // Cross-platform: stacked layers — one piece across platforms
  { href: "/content", label: "Cross-platform", icon: navIcon("M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5") },
  // Compare periods: opposing arrows
  { href: "/period-comparison", label: "Compare periods", icon: navIcon("M8 7h13M8 7l3-3M8 7l3 3M16 17H3M16 17l-3-3M16 17l-3 3") },
  // Ask: sparkle — natural-language Q&A over the workspace data
  { href: "/ask", label: "Ask", icon: navIcon("M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z") },
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
  "/content",
  "/period-comparison",
  "/ask",
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
  const { activePlatforms, initialized: profilesInitialized } = useProfiles();
  const isMobile = useIsMobile(900);
  const profileParam = searchParams.get("profile");

  // Filter the Platforms nav group to only platforms with active connections
  // in the current scope (selected profile, or org-wide for "All profiles").
  // Until profiles have loaded once, show everything so the nav doesn't
  // collapse on first paint.
  const visiblePlatformItems = !profilesInitialized
    ? PLATFORM_ITEMS
    : PLATFORM_ITEMS.filter((item) => activePlatforms.includes(item.platform));

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
              leading={
                item.icon ? (
                  <span style={{ display: "flex", color: "currentColor", opacity: 0.75 }}>{item.icon}</span>
                ) : undefined
              }
            />
          ))}
        </NavGroup>

        <SavedViewsGroup />

        {/* Hide the whole Platforms group if the current profile scope
            has zero connected platforms — avoids a dangling heading. */}
        {visiblePlatformItems.length > 0 && (
          <NavGroup label="Platforms">
            {visiblePlatformItems.map((item) => (
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
        )}

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

interface SavedViewRow {
  id: string;
  name: string;
  url: string;
}

/**
 * Personal bookmarks of filtered views. The saved URL carries the
 * profile + date scope; clicking restores it exactly. Hidden entirely
 * until the user saves their first view (plus the save affordance).
 */
function SavedViewsGroup() {
  const pathname = usePathname();
  const [views, setViews] = useState<SavedViewRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/saved-views")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setViews(j.data ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function saveCurrent() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const url = window.location.pathname + window.location.search;
    const res = await fetch("/api/saved-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed, url }),
    });
    if (res.ok) {
      const j = await res.json();
      setViews((prev) => [j.data, ...prev]);
      setName("");
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setViews((prev) => prev.filter((v) => v.id !== id));
    await fetch(`/api/saved-views/${id}`, { method: "DELETE" }).catch(() => {});
  }

  if (!loaded) return null;

  return (
    <NavGroup label="Saved views">
      {views.map((v) => (
        <div key={v.id} className="saved-view-row" style={{ position: "relative" }}>
          <NavRow
            href={v.url}
            label={v.name}
            active={typeof window !== "undefined" && pathname + window.location.search === v.url}
            leading={
              <span style={{ display: "flex", opacity: 0.75 }}>{navIcon("M5 4h14v17l-7-4-7 4V4z")}</span>
            }
          />
          <button
            onClick={(e) => {
              e.preventDefault();
              remove(v.id);
            }}
            title="Delete saved view"
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              width: 18,
              height: 18,
              borderRadius: 5,
              border: "none",
              background: "transparent",
              color: "var(--fg-subtle)",
              fontSize: 12,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      ))}

      {saving ? (
        <div style={{ display: "flex", gap: 6, padding: "4px 10px" }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveCurrent();
              if (e.key === "Escape") setSaving(false);
            }}
            placeholder="Name this view…"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "5px 8px",
              borderRadius: 6,
              border: "1px solid var(--border-strong)",
              background: "var(--bg)",
              color: "var(--fg)",
              fontSize: 12,
              outline: "none",
            }}
          />
          <button
            onClick={saveCurrent}
            style={{
              padding: "0 10px",
              borderRadius: 6,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Save
          </button>
        </div>
      ) : (
        <button
          onClick={() => setSaving(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "7px 10px",
            borderRadius: 7,
            fontSize: 12.5,
            fontWeight: 500,
            color: "var(--fg-subtle)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ width: 13, textAlign: "center" }}>＋</span>
          Save current view
        </button>
      )}
    </NavGroup>
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
