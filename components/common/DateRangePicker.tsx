"use client";

import { useState, useEffect, useCallback } from "react";

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export default function DateRangePicker({
  startDate,
  endDate,
  onChange,
}: DateRangePickerProps) {
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  const [activePreset, setActivePreset] = useState<number | null>(null);

  // Sync local state when props change (e.g. URL navigation)
  useEffect(() => {
    setStart(startDate);
    setEnd(endDate);
  }, [startDate, endDate]);

  // Whether local dates differ from the applied (prop) dates
  const hasUnappliedChanges = start !== startDate || end !== endDate;

  // Detect active preset based on applied dates
  const detectPreset = useCallback(() => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    if (endDate !== yesterday) return null;
    for (const p of PRESETS) {
      const from = new Date(Date.now() - p.days * 86400000).toISOString().split("T")[0];
      if (startDate === from) return p.days;
    }
    return null;
  }, [startDate, endDate]);

  // Initialize active preset detection
  if (activePreset === null && detectPreset() !== null) {
    setActivePreset(detectPreset());
  }

  function applyPreset(days: number) {
    const to = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const from = new Date(Date.now() - days * 86400000)
      .toISOString()
      .split("T")[0];
    setStart(from);
    setEnd(to);
    setActivePreset(days);
    onChange(from, to);
  }

  function applyRange() {
    setActivePreset(null);
    onChange(start, end);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {PRESETS.map((p) => {
          const isActive = activePreset === p.days && !hasUnappliedChanges;
          const isPrimary = p.days <= 30;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.days)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-clutch-black text-white"
                  : isPrimary
                    ? "bg-gray-100 text-clutch-grey hover:bg-gray-200"
                    : "bg-gray-50 text-clutch-grey/60 hover:bg-gray-100"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <input
        type="date"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-clutch-blue focus:outline-none"
      />
      <span className="text-xs text-clutch-grey/50">to</span>
      <input
        type="date"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-clutch-blue focus:outline-none"
      />
      {hasUnappliedChanges && (
        <button
          type="button"
          onClick={applyRange}
          className="rounded-md bg-clutch-blue px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-clutch-blue/90"
        >
          Apply
        </button>
      )}
    </div>
  );
}
