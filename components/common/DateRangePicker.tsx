"use client";

import { useState, useEffect, useCallback } from "react";

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

const PRESETS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
];

function fmtRange(a: string, b: string) {
  try {
    const ad = new Date(a);
    const bd = new Date(b);
    const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const sameYear = ad.getFullYear() === bd.getFullYear();
    return `${m(ad)} → ${m(bd)}${sameYear ? "" : `, ${bd.getFullYear()}`}`;
  } catch {
    return `${a} → ${b}`;
  }
}

export default function DateRangePicker({
  startDate,
  endDate,
  onChange,
}: DateRangePickerProps) {
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setStart(startDate);
    setEnd(endDate);
  }, [startDate, endDate]);

  const hasUnappliedChanges = start !== startDate || end !== endDate;

  const detectPreset = useCallback(() => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    if (endDate !== yesterday) return null;
    for (const p of PRESETS) {
      const from = new Date(Date.now() - p.days * 86400000).toISOString().split("T")[0];
      if (startDate === from) return p.days;
    }
    return null;
  }, [startDate, endDate]);

  useEffect(() => {
    const d = detectPreset();
    setActivePreset(d);
  }, [detectPreset]);

  function applyPreset(days: number) {
    const to = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const from = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
    setStart(from);
    setEnd(to);
    setActivePreset(days);
    setEditing(false);
    onChange(from, to);
  }

  function applyRange() {
    setActivePreset(null);
    setEditing(false);
    onChange(start, end);
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {/* Preset pills (segmented control) */}
      <div
        style={{
          display: "flex",
          background: "var(--bg-sunken)",
          padding: 3,
          borderRadius: 9,
          border: "1px solid var(--border)",
        }}
      >
        {PRESETS.map((p) => {
          const isActive = activePreset === p.days && !hasUnappliedChanges;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.days)}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                border: "none",
                background: isActive ? "var(--fg)" : "transparent",
                color: isActive ? "var(--bg-elev)" : "var(--fg-muted)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Range summary chip / editor */}
      {editing ? (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            style={{
              padding: "4px 8px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-elev)",
              color: "var(--fg)",
            }}
          />
          <span style={{ color: "var(--fg-subtle)", fontSize: 12 }}>→</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            style={{
              padding: "4px 8px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-elev)",
              color: "var(--fg)",
            }}
          />
          <button
            type="button"
            onClick={applyRange}
            disabled={!hasUnappliedChanges}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: "var(--fg)",
              color: "var(--bg-elev)",
              border: "none",
              fontSize: 11,
              fontWeight: 600,
              opacity: hasUnappliedChanges ? 1 : 0.5,
            }}
          >
            Apply
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mono tnum"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--fg-muted)",
            background: "var(--bg-elev)",
          }}
        >
          {fmtRange(startDate, endDate)}
        </button>
      )}
    </div>
  );
}
