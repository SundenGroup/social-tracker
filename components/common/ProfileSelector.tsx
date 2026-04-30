"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useProfiles } from "@/hooks/useProfiles";
import { Chevron } from "@/components/icons/PlatformGlyph";

export default function ProfileSelector() {
  const { data: session } = useSession();
  const { profiles, selectedProfileIds, setSelectedProfileIds, isLoading } = useProfiles();
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

  const viewerScopes =
    session?.user?.role === "viewer" ? session.user.profileIds ?? [] : [];
  const allLabel = viewerScopes.length > 1 ? "All my profiles" : "All profiles";
  // Viewers scoped to exactly one profile can't pick — render a static
  // pill that shows which profile they're locked to.
  const isLocked = viewerScopes.length === 1;

  // Trigger label:
  //   0 selected → "All profiles" (or "All my profiles")
  //   1 selected → that profile's name
  //   2+ selected → "N profiles"
  const triggerLabel = useMemo(() => {
    if (selectedProfileIds.length === 0) return allLabel;
    if (selectedProfileIds.length === 1) {
      const p = profiles.find((x) => x.id === selectedProfileIds[0]);
      return p?.name ?? allLabel;
    }
    return `${selectedProfileIds.length} profiles`;
  }, [selectedProfileIds, profiles, allLabel]);

  if (isLoading) return null;
  if (profiles.length === 0) return null;

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
        {triggerLabel}
      </div>
    );
  }

  function toggle(id: string) {
    if (selectedProfileIds.includes(id)) {
      setSelectedProfileIds(selectedProfileIds.filter((x) => x !== id));
    } else {
      setSelectedProfileIds([...selectedProfileIds, id]);
    }
  }

  function clearAll() {
    setSelectedProfileIds([]);
  }

  const allSelected = selectedProfileIds.length === 0;

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
        {triggerLabel}
        <Chevron size={13} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            minWidth: 240,
            background: "var(--bg-elev)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            padding: 6,
            boxShadow: "0 8px 28px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)",
          }}
        >
          {/* "All profiles" — clears the selection. Same row visual as
              individual profile rows, but no checkbox; clicking always
              resets to empty. */}
          <button
            onClick={() => {
              clearAll();
              setOpen(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              textAlign: "left",
              padding: "7px 10px",
              borderRadius: 6,
              background: allSelected ? "var(--bg-sunken)" : "transparent",
              border: "none",
              fontSize: 13,
              color: "var(--fg)",
              cursor: "pointer",
            }}
          >
            <Checkbox checked={allSelected} />
            <span style={{ flex: 1 }}>{allLabel}</span>
          </button>

          <div style={{ height: 1, background: "var(--border)", margin: "4px 6px" }} />

          {profiles.map((p) => {
            const checked = selectedProfileIds.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 10px",
                  borderRadius: 6,
                  background: checked ? "var(--bg-sunken)" : "transparent",
                  border: "none",
                  fontSize: 13,
                  color: "var(--fg)",
                  cursor: "pointer",
                }}
              >
                <Checkbox checked={checked} />
                <span style={{ flex: 1 }}>{p.name}</span>
              </button>
            );
          })}

          {selectedProfileIds.length > 0 && (
            <>
              <div style={{ height: 1, background: "var(--border)", margin: "4px 6px" }} />
              <button
                onClick={clearAll}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "center",
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "transparent",
                  border: "none",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--fg-muted)",
                  cursor: "pointer",
                }}
              >
                Clear selection
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Checkbox glyph used in the multi-select dropdown. Uses an inline SVG
 * tick instead of a unicode "✓" character so it stays crisp at 14×14
 * and reliably centers across fonts/platforms (the unicode glyph
 * sits high in most system fonts and looked off-center in the box).
 */
function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: 3,
        border: checked ? "1.5px solid var(--accent)" : "1.5px solid var(--border-strong)",
        background: checked ? "var(--accent)" : "transparent",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path
            d="M2 5.2 L4.2 7.4 L8 3.2"
            stroke="#fff"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}
