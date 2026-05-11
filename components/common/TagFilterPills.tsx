"use client";

import { useEffect, useRef, useState } from "react";

interface TagFilterPillsProps {
  /** All tags available in the current scope (from useProfiles()). */
  availableTags: string[];
  /** Tags that should always render as visible chips (defaultTags +
   *  alwaysOn rule tags). Anything in `availableTags` but not in this
   *  list is moved behind a "More tags" menu with checkboxes. Defaults
   *  to all available tags when omitted. */
  primaryTags?: string[];
  /** Map from canonical lowercase tag → display label (e.g. "PEC").
   *  Renderers fall back to CSS-capitalize when a tag isn't in the
   *  map. */
  tagDisplayNames?: Record<string, string>;
  /** Whether any post in scope has an empty tags array. With one tag
   *  and 100% coverage we hide the pills entirely (toggle is a no-op). */
  hasUntaggedPostsInScope: boolean;
  /** Currently-selected tag set. Empty array = "all tags" (no filter). */
  tags: string[];
  /** Replace the selection. */
  setTags: (next: string[]) => void;
}

/**
 * Tag-filter pill strip used across the dashboard, posts, top-posts,
 * platform pages, and period-comparison.
 *
 * Multi-select semantics mirror the ProfileSelector: primary tags
 * render as toggle chips (click to add/remove from selection), and
 * any secondary tags live behind a "More tags" dropdown with
 * checkbox rows (also multi-toggle). An empty selection is "All tags".
 *
 * Display:
 *   - "All tags" chip — active when selection is empty, clearing
 *     clicks reset to empty.
 *   - Primary chips — independent toggles. Multiple can be active.
 *   - "More tags ▾" — opens a checkbox menu of every non-primary tag.
 *     Tags currently selected from the dropdown also surface as
 *     active chips so the user can see what's filtered without
 *     opening the menu.
 *
 * Hide rules:
 *   - 0 tags in scope → render nothing.
 *   - 1 tag with 100% coverage → render nothing (filter is a no-op).
 *
 * Labels respect `tagDisplayNames` — canonical "pec" with display
 * label "PEC" renders as PEC and disables the capitalise-first CSS
 * that would otherwise render it as "Pec".
 */
export default function TagFilterPills({
  availableTags,
  primaryTags,
  tagDisplayNames,
  hasUntaggedPostsInScope,
  tags,
  setTags,
}: TagFilterPillsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  const displayMap = tagDisplayNames ?? {};
  const labelFor = (t: string): string => displayMap[t] || t;
  const isCustomCased = (t: string): boolean =>
    !!displayMap[t] && displayMap[t] !== t;

  const selectedSet = new Set(tags);
  const toggle = (t: string) => {
    if (selectedSet.has(t)) {
      setTags(tags.filter((x) => x !== t));
    } else {
      setTags([...tags, t]);
    }
  };
  const clearAll = () => setTags([]);

  // Single-tag mode: keep the lightweight one-chip toggle.
  if (availableTags.length === 1) {
    const only = availableTags[0];
    const active = selectedSet.has(only);
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <PillButton
          label={labelFor(only)}
          customCased={isCustomCased(only)}
          active={active}
          onClick={() => (active ? clearAll() : setTags([only]))}
        />
      </div>
    );
  }

  // Multi-tag mode. Split into primary chips + secondary dropdown.
  const primarySet = new Set(primaryTags ?? availableTags);
  const primary = availableTags.filter((t) => primarySet.has(t));
  const secondary = availableTags.filter((t) => !primarySet.has(t));

  // Surface any selected secondary tags as chips outside the dropdown
  // so the user can see what's filtered without opening the menu.
  const surfacedSecondary = tags.filter((t) => !primarySet.has(t) && availableTags.includes(t));

  const secondarySelectedCount = surfacedSecondary.length;

  return (
    <div
      style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}
      ref={menuRef}
    >
      <PillButton
        label="All tags"
        customCased={false}
        active={tags.length === 0}
        onClick={clearAll}
      />
      {primary.map((t) => (
        <PillButton
          key={t}
          label={labelFor(t)}
          customCased={isCustomCased(t)}
          active={selectedSet.has(t)}
          onClick={() => toggle(t)}
        />
      ))}
      {surfacedSecondary.map((t) => (
        <PillButton
          key={t}
          label={labelFor(t)}
          customCased={isCustomCased(t)}
          active={true}
          onClick={() => toggle(t)}
        />
      ))}
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
              gap: 6,
            }}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
          >
            More tags
            {secondarySelectedCount > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 10,
                  background: "var(--accent)",
                  color: "#fff",
                }}
              >
                {secondarySelectedCount}
              </span>
            )}
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
                minWidth: 220,
                maxHeight: 360,
                overflowY: "auto",
                background: "var(--bg-elev)",
                border: "1px solid var(--border-strong)",
                borderRadius: 10,
                padding: 6,
                boxShadow: "0 8px 28px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
              {secondary.map((t) => {
                const checked = selectedSet.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(t)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      textAlign: "left",
                      padding: "7px 10px",
                      borderRadius: 6,
                      border: "none",
                      background: checked ? "var(--bg-sunken)" : "transparent",
                      color: "var(--fg)",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <Checkbox checked={checked} />
                    <span
                      style={{
                        flex: 1,
                        fontWeight: 500,
                        textTransform: isCustomCased(t) ? "none" : "capitalize",
                      }}
                    >
                      {labelFor(t)}
                    </span>
                  </button>
                );
              })}
              {secondarySelectedCount > 0 && (
                <>
                  <div style={{ height: 1, background: "var(--border)", margin: "4px 6px" }} />
                  <button
                    type="button"
                    onClick={() => {
                      // Clear only secondary selections; keep primary
                      // chips the user toggled.
                      setTags(tags.filter((t) => primarySet.has(t)));
                    }}
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
                    Clear other tags
                  </button>
                </>
              )}
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
        textTransform: customCased ? "none" : "capitalize",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

/**
 * Checkbox glyph mirroring the one in ProfileSelector — inline SVG
 * tick stays crisp at 14×14 and centers reliably across system fonts.
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
