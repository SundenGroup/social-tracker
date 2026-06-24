"use client";

import { useEffect, useRef, useState } from "react";
import { UNTAGGED_FILTER, NO_EXTRAS_FILTER, SPONSORED_FILTER } from "@/lib/tagging";
import { Chevron } from "@/components/icons/PlatformGlyph";

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
  /** Opt-in: show a low-key "Sponsored" option in the dropdown. Used on
   *  the post list so an accidentally-flagged sponsored post is always
   *  findable. Off everywhere else to keep the filter unobtrusive. */
  showSponsoredFilter?: boolean;
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
  showSponsoredFilter = false,
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

  // Normally we hide the strip when there's nothing useful to filter.
  // But when the sponsored option is opted in, always render so that
  // recovery affordance stays reachable regardless of tag coverage.
  if (availableTags.length === 0 && !showSponsoredFilter) return null;
  if (availableTags.length === 1 && !hasUntaggedPostsInScope && !showSponsoredFilter) return null;

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

  // Single-tag mode: keep the lightweight one-chip toggle. (Skipped
  // when the sponsored option is on — we need the full dropdown UI.)
  if (availableTags.length === 1 && !showSponsoredFilter) {
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

  // "No tag" goes at the bottom of the dropdown — useful for accounts
  // without any default tag. We only show it when the scope has
  // untagged posts; otherwise the filter is a no-op.
  const showUntaggedOption = hasUntaggedPostsInScope;
  const untaggedSelected = tags.includes(UNTAGGED_FILTER);

  // Low-key "Sponsored" filter (opt-in per page). Recovery affordance
  // for accidentally-flagged posts; bypasses the org hide setting.
  const showSponsoredOption = showSponsoredFilter;
  const sponsoredSelected = tags.includes(SPONSORED_FILTER);

  // "Only X" / no-extras option sits at the top of the menu. Hidden
  // when there are no secondary tags in scope (filter is a no-op) or
  // no primary tags exist (nothing to say "only" about). The label
  // uses the actual primary tag name when there's a single one, and
  // falls back to "Only defaults" otherwise.
  const showNoExtrasOption = secondary.length > 0 && primary.length > 0;
  const noExtrasSelected = tags.includes(NO_EXTRAS_FILTER);
  const noExtrasLabel = (() => {
    if (primary.length === 1) return `Only ${labelFor(primary[0])}`;
    if (primary.length === 2) return `Only ${labelFor(primary[0])} & ${labelFor(primary[1])}`;
    return "Only defaults";
  })();
  const noExtrasCustomCased = primary.length === 1 && isCustomCased(primary[0]);

  // Surface any selected secondary tags (and the sentinels) as chips
  // outside the dropdown so the user can see what's filtered without
  // opening the menu.
  const surfacedSecondary = tags.filter((t) => {
    if (t === UNTAGGED_FILTER || t === NO_EXTRAS_FILTER || t === SPONSORED_FILTER) return false;
    return !primarySet.has(t) && availableTags.includes(t);
  });

  const secondarySelectedCount =
    surfacedSecondary.length +
    (untaggedSelected ? 1 : 0) +
    (noExtrasSelected ? 1 : 0) +
    (sponsoredSelected ? 1 : 0);

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
      {untaggedSelected && (
        <PillButton
          label="No tag"
          customCased={true}
          active={true}
          onClick={() => toggle(UNTAGGED_FILTER)}
        />
      )}
      {noExtrasSelected && (
        <PillButton
          label={noExtrasLabel}
          customCased={noExtrasCustomCased}
          active={true}
          onClick={() => toggle(NO_EXTRAS_FILTER)}
        />
      )}
      {sponsoredSelected && (
        <PillButton
          label="Sponsored"
          customCased={true}
          active={true}
          onClick={() => toggle(SPONSORED_FILTER)}
        />
      )}
      {surfacedSecondary.map((t) => (
        <PillButton
          key={t}
          label={labelFor(t)}
          customCased={isCustomCased(t)}
          active={true}
          onClick={() => toggle(t)}
        />
      ))}
      {(secondary.length > 0 || showUntaggedOption || showNoExtrasOption || showSponsoredOption) && (
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="More tags"
            title="More tags"
            style={{
              // Square-ish icon button that matches the height of the
              // chip pills next to it. Counted-state badge sits inline
              // so users still see how many extra tags are active.
              padding: "7px 9px",
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
            <Chevron size={12} dir={menuOpen ? "up" : "down"} />
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
              {showNoExtrasOption && (
                <button
                  type="button"
                  role="option"
                  aria-selected={noExtrasSelected}
                  onClick={() => toggle(NO_EXTRAS_FILTER)}
                  title="Posts that only carry default tags — nothing further categorised."
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    textAlign: "left",
                    padding: "7px 10px",
                    borderRadius: 6,
                    border: "none",
                    background: noExtrasSelected ? "var(--bg-sunken)" : "transparent",
                    color: "var(--fg)",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  <Checkbox checked={noExtrasSelected} />
                  <span
                    style={{
                      flex: 1,
                      fontWeight: 500,
                      fontStyle: "italic",
                      color: "var(--fg-muted)",
                      textTransform: noExtrasCustomCased ? "none" : "capitalize",
                    }}
                  >
                    {noExtrasLabel}
                  </span>
                </button>
              )}
              {showNoExtrasOption && secondary.length > 0 && (
                <div style={{ height: 1, background: "var(--border)", margin: "4px 6px" }} />
              )}
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
              {showUntaggedOption && (
                <>
                  {secondary.length > 0 && (
                    <div style={{ height: 1, background: "var(--border)", margin: "4px 6px" }} />
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={untaggedSelected}
                    onClick={() => toggle(UNTAGGED_FILTER)}
                    title="Posts with no tags applied."
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      textAlign: "left",
                      padding: "7px 10px",
                      borderRadius: 6,
                      border: "none",
                      background: untaggedSelected ? "var(--bg-sunken)" : "transparent",
                      color: "var(--fg)",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <Checkbox checked={untaggedSelected} />
                    <span
                      style={{
                        flex: 1,
                        fontWeight: 500,
                        fontStyle: "italic",
                        color: "var(--fg-muted)",
                      }}
                    >
                      No tag
                    </span>
                  </button>
                </>
              )}
              {showSponsoredOption && (
                <>
                  {(secondary.length > 0 || showUntaggedOption || showNoExtrasOption) && (
                    <div style={{ height: 1, background: "var(--border)", margin: "4px 6px" }} />
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={sponsoredSelected}
                    onClick={() => toggle(SPONSORED_FILTER)}
                    title="Show only posts flagged as sponsored — handy for spotting an accidental flag."
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      textAlign: "left",
                      padding: "7px 10px",
                      borderRadius: 6,
                      border: "none",
                      background: sponsoredSelected ? "var(--bg-sunken)" : "transparent",
                      color: "var(--fg)",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <Checkbox checked={sponsoredSelected} />
                    <span
                      style={{
                        flex: 1,
                        fontWeight: 500,
                        fontStyle: "italic",
                        color: "var(--fg-muted)",
                      }}
                    >
                      Sponsored
                    </span>
                  </button>
                </>
              )}
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
