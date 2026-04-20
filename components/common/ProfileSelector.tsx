"use client";

import { useEffect, useRef, useState } from "react";
import { useProfiles } from "@/hooks/useProfiles";
import { Chevron } from "@/components/icons/PlatformGlyph";

export default function ProfileSelector() {
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
  const label = selected?.name ?? "All profiles";

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
            All profiles
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
