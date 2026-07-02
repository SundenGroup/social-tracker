"use client";

import { useState, useRef, useEffect } from "react";
import Header from "@/components/layouts/Header";
import AskBlockRenderer from "@/components/ask/AskBlocks";
import { useAsk, type AskEntry } from "@/hooks/useAsk";
import { useProfiles } from "@/hooks/useProfiles";
import { useIsMobile } from "@/hooks/useIsMobile";

/** Must match the desktop sidebar width in Sidebar.tsx — the fixed
 *  composer needs the same offset or it centers on the viewport,
 *  drifting off the content column and covering the sidebar footer. */
const SIDEBAR_W = 232;

const EXAMPLES = [
  "Top 10 posts from last month",
  "Which platform grew the most in the last 30 days?",
  "Best cross-platform content pieces this quarter",
  "How many followers did we gain in June?",
];

const LOADING_LINES = [
  "Reading your question…",
  "Querying the numbers…",
  "Checking across platforms…",
  "Putting the answer together…",
];

/**
 * Ask — natural-language Q&A over the workspace's own data. Questions
 * go to /api/ask which runs scoped query tools and returns typed
 * blocks; every number is hydrated from the database server-side.
 */
export default function AskPage() {
  const { entries, busy, ask, clear } = useAsk();
  const { selectedProfileIds, profiles } = useProfiles();
  const isMobile = useIsMobile();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries]);

  const scopeNote =
    selectedProfileIds.length > 0
      ? profiles
          .filter((p) => selectedProfileIds.includes(p.id))
          .map((p) => p.name)
          .join(", ")
      : "all profiles";

  function submit(q?: string) {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput("");
    ask(question);
  }

  return (
    <>
      <Header title="Ask" subtitle="Ask your data anything">
        {entries.length > 0 && (
          <button
            onClick={clear}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              color: "var(--fg-muted)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            New conversation
          </button>
        )}
      </Header>

      {/* No .page-pad class here — its mobile !important padding would
          erase the 140px bottom clearance the fixed composer needs. */}
      <div style={{ padding: isMobile ? "16px 14px 150px" : "24px 28px 140px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 780, display: "flex", flexDirection: "column", gap: 18 }}>
          {entries.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0 12px" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--fg)", letterSpacing: "-0.02em" }}>
                What do you want to know?
              </div>
              <div style={{ fontSize: 12.5, color: "var(--fg-subtle)", marginTop: 6 }}>
                Answering from <strong style={{ color: "var(--fg-muted)" }}>{scopeNote}</strong> — switch profiles in the sidebar to change scope.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 22 }}>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => submit(ex)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      background: "var(--bg-elev)",
                      color: "var(--fg-muted)",
                      fontSize: 12.5,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {entries.map((entry) => (
            <Exchange key={entry.id} entry={entry} onSuggestion={submit} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer — offset by the sidebar width on desktop so it
          centers on the CONTENT column, not the viewport (and never
          overlaps the sidebar footer at narrow desktop widths). */}
      <div
        style={{
          position: "fixed",
          left: isMobile ? 0 : SIDEBAR_W,
          right: 0,
          bottom: 0,
          padding: isMobile ? "12px 14px 16px" : "14px 28px 20px",
          background: "linear-gradient(transparent, var(--bg) 30%)",
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 780,
            display: "flex",
            gap: 8,
            background: "var(--bg-elev)",
            border: "1px solid var(--border-strong)",
            borderRadius: 14,
            padding: 8,
            boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
            pointerEvents: "auto",
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder='Ask about your data — e.g. "top 10 content posts from May 2026"'
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--fg)",
              fontSize: 13.5,
              lineHeight: 1.5,
              padding: "8px 10px",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={() => submit()}
            disabled={busy || !input.trim()}
            style={{
              padding: "0 18px",
              borderRadius: 10,
              border: "none",
              background: busy || !input.trim() ? "var(--border-strong)" : "var(--accent)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: busy || !input.trim() ? "default" : "pointer",
            }}
          >
            {busy ? "…" : "Ask"}
          </button>
        </div>
      </div>
    </>
  );
}

function Exchange({ entry, onSuggestion }: { entry: AskEntry; onSuggestion: (q: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Question pill */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            maxWidth: "85%",
            padding: "9px 14px",
            borderRadius: "14px 14px 4px 14px",
            background: "var(--accent)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.5,
          }}
        >
          {entry.question}
        </div>
      </div>

      {/* Answer card */}
      <div
        style={{
          background: "var(--bg-elev)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {entry.pending && <PendingIndicator />}
        {entry.error && (
          <div style={{ fontSize: 13, color: "var(--bad)" }}>{entry.error}</div>
        )}
        {entry.answer && (
          <>
            {entry.answer.blocks.map((block, i) => (
              <AskBlockRenderer key={i} block={block} />
            ))}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                borderTop: "1px solid var(--border)",
                paddingTop: 10,
                marginTop: 2,
              }}
            >
              <span style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}>
                {entry.answer.meta.scope}
                {entry.answer.meta.periodLabel ? ` · ${entry.answer.meta.periodLabel}` : ""}
                {entry.answer.meta.mode === "mock" ? " · mock mode" : ""}
              </span>
              {entry.answer.suggestions.length > 0 && (
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {entry.answer.suggestions.slice(0, 3).map((s) => (
                    <button
                      key={s}
                      onClick={() => onSuggestion(s)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        background: "var(--bg-sunken)",
                        color: "var(--fg-muted)",
                        fontSize: 11,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PendingIndicator() {
  const [lineIdx, setLineIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLineIdx((i) => (i + 1) % LOADING_LINES.length), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: "2px solid var(--border-strong)",
          borderTopColor: "var(--accent)",
          animation: "spin 0.8s linear infinite",
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>{LOADING_LINES[lineIdx]}</span>
    </div>
  );
}
