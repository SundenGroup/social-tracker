"use client";

import { useState, useRef, useEffect } from "react";
import { useProfiles } from "@/hooks/useProfiles";

/**
 * Creates a public tokenized report link for the current scope + range
 * and copies it. The link opens /share/<token> — a clean read-only
 * report with a Download-PDF button — viewable without a login.
 */
export default function ShareReportButton({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { selectedProfileIds } = useProfiles();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          profileId: selectedProfileIds.length === 1 ? selectedProfileIds[0] : undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        const url = `${window.location.origin}${json.data.url}`;
        setLink(url);
        await navigator.clipboard.writeText(url).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open && !link) create();
        }}
        style={{
          padding: "7px 12px",
          borderRadius: 8,
          border: "1px solid var(--border-strong)",
          background: "transparent",
          color: "var(--fg-muted)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Share report
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            width: 300,
            background: "var(--bg-elev)",
            border: "1px solid var(--border-strong)",
            borderRadius: 12,
            padding: 14,
            boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
            zIndex: 60,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Public report link</div>
          <div style={{ fontSize: 11, color: "var(--fg-subtle)", lineHeight: 1.5, marginBottom: 10 }}>
            Anyone with the link can view this scope &amp; period — no login. The page has a Download-PDF button.
          </div>
          {busy && <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>Creating link…</div>}
          {link && (
            <>
              <input
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
                style={{
                  width: "100%",
                  padding: "7px 9px",
                  borderRadius: 7,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--fg)",
                  fontSize: 11,
                  marginBottom: 8,
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(link).catch(() => {});
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  {copied ? "Copied ✓" : "Copy link"}
                </button>
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: "1px solid var(--border-strong)", color: "var(--fg-muted)", fontSize: 12, fontWeight: 600, textAlign: "center", textDecoration: "none" }}
                >
                  Open
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
