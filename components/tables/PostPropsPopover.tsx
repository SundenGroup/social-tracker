"use client";

import { useEffect, useRef, useState } from "react";
import { useProfiles } from "@/hooks/useProfiles";

interface PostPropsPopoverProps {
  postId: string;
  isSponsored: boolean;
  manualTags: string[];
  /** Auto tags applied via account rules — read-only, shown for context. */
  autoTags: string[];
  /** Suggestions for tag autocomplete: org-wide tag list. */
  availableTags: string[];
  /** Called after a successful PATCH. Receives the new isSponsored +
   *  manualTags so the parent can update its row in place. */
  onSaved?: (next: { isSponsored: boolean; manualTags: string[]; tags: string[] }) => void;
}

/**
 * Per-post properties popover. Replaces the previous standalone
 * sponsored-toggle icon with a single trigger that opens an
 * inline editor for both `isSponsored` and `manualTags`. Auto tags
 * (from the account's tag rules) are listed read-only above the
 * editable manual tags so the user knows where each tag came from.
 *
 * Lives in the dashboard / platform leaderboards. Saves via PATCH
 * /api/posts/[id] which calls recomputePostTags() server-side and
 * returns the freshly-unioned `tags` array.
 */
export default function PostPropsPopover({
  postId,
  isSponsored,
  manualTags,
  autoTags,
  availableTags,
  onSaved,
}: PostPropsPopoverProps) {
  const { tagDisplayNames } = useProfiles();
  // Helpers — render the user-typed case (e.g. "PAS") when the rule
  // has a displayTag set, otherwise fall back to CSS capitalize on
  // the canonical lowercase form.
  const tagLabel = (t: string) => tagDisplayNames[t] ?? t;
  const tagCustomCased = (t: string) => !!tagDisplayNames[t] && tagDisplayNames[t] !== t;
  const [open, setOpen] = useState(false);
  const [draftSponsored, setDraftSponsored] = useState(isSponsored);
  const [draftTags, setDraftTags] = useState<string[]>(manualTags);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  // Flip the popover above the trigger when there isn't enough room
  // below — rows at the bottom of the table would otherwise have the
  // popover render off-screen. Recomputed every time we open.
  const [openUpward, setOpenUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Reset drafts whenever the popover opens, in case the parent state
  // moved on while we were closed. Also choose orientation based on
  // available viewport space — for rows near the bottom of the table
  // the popover would otherwise spill below the fold.
  useEffect(() => {
    if (open) {
      setDraftSponsored(isSponsored);
      setDraftTags(manualTags);
      setTagInput("");
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        // Approximate popover height; we don't have a ref to measure
        // before render. The actual content can be smaller (no auto
        // tags, no suggestions) but assuming the maximum keeps the
        // flip stable across renders.
        const APPROX_POPOVER_HEIGHT = 360;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        setOpenUpward(spaceBelow < APPROX_POPOVER_HEIGHT && spaceAbove > spaceBelow);
      }
    }
  }, [open, isSponsored, manualTags]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function addTag(raw: string) {
    const cleaned = raw.trim().toLowerCase();
    if (!cleaned) return;
    if (cleaned.length > 50) return;
    setDraftTags((tags) => (tags.includes(cleaned) ? tags : [...tags, cleaned]));
    setTagInput("");
  }
  function removeTag(t: string) {
    setDraftTags((tags) => tags.filter((x) => x !== t));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isSponsored: draftSponsored,
          manualTags: draftTags,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        onSaved?.({
          isSponsored: json.data?.isSponsored ?? draftSponsored,
          manualTags: json.data?.manualTags ?? draftTags,
          tags: json.data?.tags ?? draftTags,
        });
        setOpen(false);
      }
    } catch {
      // silently ignore — keep popover open so user can retry
    } finally {
      setSaving(false);
    }
  }

  // Visual badge colour: yellow if sponsored, accent if any manualTags,
  // muted otherwise. Combined badges signal "this post has been edited."
  const hasState = isSponsored || manualTags.length > 0;
  const triggerColor = isSponsored ? "#E09B00" : hasState ? "var(--accent)" : "var(--fg-subtle)";
  const triggerOpacity = hasState ? 1 : 0.45;

  // Suggestions: org's known tags minus the ones already on this post.
  const suggestions = availableTags.filter((t) => !draftTags.includes(t)).slice(0, 8);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Edit post properties"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 2,
          background: "transparent",
          border: "none",
          color: triggerColor,
          opacity: triggerOpacity,
          cursor: "pointer",
        }}
      >
        {/* Tag-shaped icon. Filled when post has any manual state. */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill={hasState ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            ...(openUpward
              ? { bottom: "calc(100% + 4px)" }
              : { top: "calc(100% + 4px)" }),
            right: 0,
            zIndex: 50,
            minWidth: 280,
            padding: 12,
            background: "var(--bg-elev)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            boxShadow: "0 8px 28px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)",
            color: "var(--fg)",
            fontSize: 12,
            textAlign: "left",
          }}
        >
          {/* Sponsored toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={draftSponsored}
              onChange={(e) => setDraftSponsored(e.target.checked)}
              style={{ accentColor: "#E09B00" }}
            />
            <span>Sponsored post</span>
          </label>

          {/* Auto tags (read-only) */}
          {autoTags.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--fg-subtle)", marginBottom: 4 }}>
                Auto tags
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {autoTags.map((t) => (
                  <span
                    key={`auto-${t}`}
                    title="Auto-tagged via account rules"
                    style={{
                      padding: "2px 8px",
                      borderRadius: 12,
                      background: "var(--bg-sunken)",
                      color: "var(--fg-muted)",
                      fontSize: 11,
                      fontWeight: 500,
                      textTransform: tagCustomCased(t) ? "none" : "capitalize",
                    }}
                  >
                    {tagLabel(t)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Manual tags (editable) */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--fg-subtle)", marginBottom: 4 }}>
              Tags
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
              {draftTags.map((t) => (
                <span
                  key={t}
                  style={{
                    padding: "2px 6px 2px 8px",
                    borderRadius: 12,
                    background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                    color: "var(--accent)",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: tagCustomCased(t) ? "none" : "capitalize",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {tagLabel(t)}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "inherit",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: 13,
                      lineHeight: 1,
                    }}
                    aria-label={`Remove tag ${t}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagInput);
                } else if (e.key === "Backspace" && tagInput === "" && draftTags.length > 0) {
                  removeTag(draftTags[draftTags.length - 1]);
                }
              }}
              placeholder="Add tag…"
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--fg)",
                fontSize: 12,
                outline: "none",
              }}
            />
            {suggestions.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addTag(s)}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 12,
                      border: "1px dashed var(--border-strong)",
                      background: "transparent",
                      color: "var(--fg-muted)",
                      fontSize: 10,
                      fontWeight: 500,
                      cursor: "pointer",
                      textTransform: tagCustomCased(s) ? "none" : "capitalize",
                    }}
                  >
                    + {tagLabel(s)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--bg-elev)",
                color: "var(--fg-muted)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "none",
                background: "var(--fg)",
                color: "var(--bg-elev)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
