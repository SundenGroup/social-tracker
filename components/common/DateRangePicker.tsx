"use client";

import { useState, useCallback } from "react";

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

  // Detect active preset on mount based on current dates
  const detectPreset = useCallback(() => {
    const today = new Date().toISOString().split("T")[0];
    if (end !== today) return null;
    for (const p of PRESETS) {
      const from = new Date(Date.now() - p.days * 86400000).toISOString().split("T")[0];
      if (start === from) return p.days;
    }
    return null;
  }, [start, end]);

  // Initialize active preset detection
  if (activePreset === null && detectPreset() !== null) {
    setActivePreset(detectPreset());
  }

  function applyPreset(days: number) {
    const to = new Date().toISOString().split("T")[0];
    const from = new Date(Date.now() - days * 86400000)
      .toISOString()
      .split("T")[0];
    setStart(from);
    setEnd(to);
    setActivePreset(days);
    onChange(from, to);
  }

  function handleChange(newStart: string, newEnd: string) {
    setStart(newStart);
    setEnd(newEnd);
    setActivePreset(null);
    onChange(newStart, newEnd);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {PRESETS.map((p) => {
          const isActive = activePreset === p.days;
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
        onChange={(e) => handleChange(e.target.value, end)}
        className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-clutch-blue focus:outline-none"
      />
      <span className="text-xs text-clutch-grey/50">to</span>
      <input
        type="date"
        value={end}
        onChange={(e) => handleChange(start, e.target.value)}
        className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-clutch-blue focus:outline-none"
      />
    </div>
  );
}
