"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useProfiles } from "@/hooks/useProfiles";
import { Chevron } from "@/components/icons/PlatformGlyph";

export default function ProfileSelector() {
  const { data: session } = useSession();
  const { profiles, selectedProfileId, setSelectedProfileId, isLoading } = useProfiles();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (isLoading) return null;
  if (profiles.length === 0) return null;

  const selected = profiles.find((p) => p.id === selectedProfileId);
  const viewerScopes =
    session?.user?.role === "viewer" ? session.user.profileIds ?? [] : [];
  // Label for the "show all" case. For multi-scope viewers it's their personal
  // aggregate; for admins/unscoped viewers it's the whole org.
  const allLabel = viewerScopes.length > 1 ? "All my profiles" : "All profiles";
  const label = selected?.name ?? allLabel;
  // Viewers scoped to exactly one profile can't pick — render a static pill
  // that shows which profile their account is locked to.
  const isLocked = viewerScopes.length === 1;

  if (isLocked) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--bg-sunken)",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--fg-muted)",
        }}
        title="Your account is scoped to this profile"
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
        {label}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid var(--border-strong)",
          background: "var(--bg-elev)",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--fg)",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />
        {label}
        <Chevron size={13} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            minWidth: 220,
            background: "var(--bg-elev)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            padding: 6,
            boxShadow: "0 8px 28px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)",
          }}
        >
          <button
            onClick={() => {
              setSelectedProfileId(null);
              setOpen(false);
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "7px 10px",
              borderRadius: 6,
              background: !selectedProfileId ? "var(--bg-sunken)" : "transparent",
              border: "none",
              fontSize: 13,
              color: "var(--fg)",
            }}
          >
            {allLabel}
          </button>
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelectedProfileId(p.id);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "7px 10px",
                borderRadius: 6,
                background: p.id === selectedProfileId ? "var(--bg-sunken)" : "transparent",
                border: "none",
                fontSize: 13,
                color: "var(--fg)",
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
