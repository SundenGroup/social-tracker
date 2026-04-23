"use client";

import { useMobileNav } from "@/components/layouts/MobileNavProvider";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cloneElement, isValidElement } from "react";

/**
 * Client-side shell that owns the sidebar/main layout and renders the
 * mobile-drawer backdrop. The sidebar prop is cloned so we can inject the
 * mobileOpen + onClose wiring without the Layout needing to know about it.
 */
export default function DashboardShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const { open, setOpen } = useMobileNav();
  const isMobile = useIsMobile(900);

  // Inject the drawer state into the Sidebar without the (server-rendered)
  // layout having to care. If the caller passed something that isn't a
  // ReactElement, leave it alone.
  const wiredSidebar = isValidElement(sidebar)
    ? cloneElement(sidebar as React.ReactElement<{ mobileOpen?: boolean; onClose?: () => void }>, {
        mobileOpen: open,
        onClose: () => setOpen(false),
      })
    : sidebar;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      {wiredSidebar}
      <div
        className={"mobile-backdrop " + (isMobile && open ? "open" : "")}
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {children}
      </main>
    </div>
  );
}
