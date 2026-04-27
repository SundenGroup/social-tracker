"use client";

interface TagFilterPillsProps {
  /** All tags available in the current scope (from useProfiles()). */
  availableTags: string[];
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
 * Hide rules (caller can also short-circuit by not rendering when these
 * apply, but the component returns `null` for either case to be safe):
 *   - no tags in scope → hide
 *   - one tag with 100% coverage → hide (toggle is a no-op)
 *
 * Render rules:
 *   - one tag with mixed coverage → single togglable pill
 *   - 2+ tags → "All tags / tag1 / tag2…" radio strip
 */
export default function TagFilterPills({
  availableTags,
  hasUntaggedPostsInScope,
  tag,
  setTag,
}: TagFilterPillsProps) {
  if (availableTags.length === 0) return null;
  if (availableTags.length === 1 && !hasUntaggedPostsInScope) return null;

  const options = availableTags.length === 1
    ? [{ label: availableTags[0], value: availableTags[0] }]
    : [
        { label: "All tags", value: null as string | null },
        ...availableTags.map((t) => ({ label: t, value: t })),
      ];

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((opt) => {
        const active = (tag ?? null) === opt.value;
        const onClick = () => {
          if (availableTags.length === 1) {
            // Single-tag mode: clicking applies the filter, clicking
            // again clears it (acts as a toggle).
            setTag(active ? null : opt.value);
          } else {
            setTag(opt.value);
          }
        };
        return (
          <button
            key={opt.value ?? "__all_tags__"}
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
              textTransform: opt.value ? "capitalize" : undefined,
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
