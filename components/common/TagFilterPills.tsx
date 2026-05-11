"use client";

import { useEffect, useRef, useState } from "react";

interface TagFilterPillsProps {
  /** All tags available in the current scope (from useProfiles()). */
  availableTags: string[];
  /** Tags that should always render as visible chips (defaultTags +
   *  alwaysOn rule tags). Anything in `availableTags` but not in this
   *  list is moved behind a "More tags" menu. Defaults to all available
   *  tags when omitted — preserves pre-dropdown behaviour for callers
   *  that haven't migrated yet. */
  primaryTags?: string[];
  /** Map from canonical lowercase tag → display label (e.g. "PEC").
   *  Renderers fall back to CSS-capitalize when a tag isn't in the
   *  map. */
  tagDisplayNames?: Record<string, string>;
  /** Whether any post in scope has an empty tags array. With one tag
   *  and 100% coverage we hide the pills entirely (toggle is a no-op). */
  hasUntaggedPostsInScope: boolean;
  /** Selected tag — null means "all tags" (no tag filter applied). */
  tag: string | null;
  /** Setter from the page's useState. */
  setTag: (next: string | null) => void;
}

/**
 * Tag-filter pill strip used across the dashboard, posts, top-posts,
 * platform pages, and period-comparison.
 *
 * Behaviour:
 *   - 0 tags in scope → render nothing
 *   - 1 tag with 100% coverage → render nothing (toggle is no-op)
 *   - 1 tag with mixed coverage → single togglable pill
 *   - 2+ tags → "All tags / primary1 / primary2 / [More tags ▾]"
 *     where the dropdown holds anything not in `primaryTags`. If
 *     `primaryTags` is empty or every tag is primary, no dropdown
 *     is rendered.
 *
 * Labels respect `tagDisplayNames` — a canonical "pec" with a display
 * label of "PEC" renders as PEC and disables the capitalise-first CSS
 * that would otherwise render it as "Pec".
 */
export default function TagFilterPills({
  availableTags,
  primaryTags,
  tagDisplayNames,
  hasUntaggedPostsInScope,
  tag,
  setTag,
}: TagFilterPillsProps) {
  // Local state for the secondary-tags dropdown open/close.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  if (availableTags.length === 0) return null;
  if (availableTags.length === 1 && !hasUntaggedPostsInScope) return null;

  // Helper: resolve display label, with capitalise-first fallback so
  // legacy lowercase tags don't look raw.
  const displayMap = tagDisplayNames ?? {};
  const labelFor = (t: string): string => {
    const explicit = displayMap[t];
    if (explicit) return explicit;
    return t; // raw; CSS handles styling for unmapped tags
  };
  const isCustomCased = (t: string): boolean =>
    !!displayMap[t] && displayMap[t] !== t;

  // Single-tag mode: same as before — one togglable pill.
  if (availableTags.length === 1) {
    const only = availableTags[0];
    const active = tag === only;
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <PillButton
          label={labelFor(only)}
          customCased={isCustomCased(only)}
          active={active}
          onClick={() => setTag(active ? null : only)}
        />
      </div>
    );
  }

  // Multi-tag mode: split into primary (chips) + secondary (dropdown).
  // When `primaryTags` is undefined we keep the legacy "every tag is a
  // chip" behaviour so callers that haven't migrated still work.
  const primarySet = new Set(primaryTags ?? availableTags);
  const primary = availableTags.filter((t) => primarySet.has(t));
  const secondary = availableTags.filter((t) => !primarySet.has(t));

  // If the currently-selected tag is in the secondary set, surface it
  // as an extra chip so the user can see what's filtered without
  // opening the dropdown.
  const surfacedSecondary =
    tag && !primarySet.has(tag) && availableTags.includes(tag) ? tag : null;

  return (
    <div
      style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}
      ref={menuRef}
    >
      <PillButton
        label="All tags"
        customCased={false}
        active={tag === null}
        onClick={() => setTag(null)}
      />
      {primary.map((t) => (
        <PillButton
          key={t}
          label={labelFor(t)}
          customCased={isCustomCased(t)}
          active={tag === t}
          onClick={() => setTag(t)}
        />
      ))}
      {surfacedSecondary && (
        <PillButton
          label={labelFor(surfacedSecondary)}
          customCased={isCustomCased(surfacedSecondary)}
          active={true}
          onClick={() => setTag(null)}
        />
      )}
      {secondary.length > 0 && (
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-elev)",
              color: "var(--fg-muted)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
          >
            More tags
            <span aria-hidden style={{ fontSize: 9, lineHeight: 1 }}>▾</span>
          </button>
          {menuOpen && (
            <div
              role="listbox"
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                zIndex: 50,
                minWidth: 180,
                maxHeight: 320,
                overflowY: "auto",
                background: "var(--bg-elev)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 4,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              }}
            >
              {secondary.map((t) => {
                const active = tag === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setTag(t);
                      setMenuOpen(false);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "7px 10px",
                      borderRadius: 6,
                      border: "none",
                      background: active ? "var(--accent)" : "transparent",
                      color: active ? "#fff" : "var(--fg)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      textTransform: isCustomCased(t) ? "none" : "capitalize",
                    }}
                  >
                    {labelFor(t)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PillButtonProps {
  label: string;
  customCased: boolean;
  active: boolean;
  onClick: () => void;
}

function PillButton({ label, customCased, active, onClick }: PillButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 12px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: active ? "var(--accent)" : "var(--bg-elev)",
        color: active ? "#fff" : "var(--fg-muted)",
        fontSize: 12,
        fontWeight: 600,
        // Skip capitalize when we have a user-supplied case ("PEC")
        // so we don't munge it back to "Pec". Otherwise capitalise so
        // canonical lowercase like "esports" renders as "Esports".
        textTransform: customCased ? "none" : "capitalize",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
