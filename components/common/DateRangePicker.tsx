"use client";

import { useState } from "react";

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

  function applyPreset(days: number) {
    const to = new Date().toISOString().split("T")[0];
    const from = new Date(Date.now() - days * 86400000)
      .toISOString()
      .split("T")[0];
    setStart(from);
    setEnd(to);
    onChange(from, to);
  }

  function handleChange(newStart: string, newEnd: string) {
    setStart(newStart);
    setEnd(newEnd);
    onChange(newStart, newEnd);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.days)}
            className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-clutch-grey transition-colors hover:bg-gray-200"
          >
            {p.label}
          </button>
        ))}
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
