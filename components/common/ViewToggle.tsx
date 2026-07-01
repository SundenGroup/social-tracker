"use client";

/**
 * Small segmented control for switching page views (Table ⇄ Gallery).
 * Used by /posts and /content, which each absorbed their former
 * standalone "Top …" sibling page as a view.
 */
export default function ViewToggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  options: Array<{ key: string; label: string }>;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        background: "var(--bg-sunken)",
        padding: 3,
        borderRadius: 9,
        border: "1px solid var(--border)",
      }}
    >
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background: active ? "var(--fg)" : "transparent",
              color: active ? "var(--bg-elev)" : "var(--fg-muted)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
