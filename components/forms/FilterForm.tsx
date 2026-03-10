"use client";

import { useState } from "react";

interface FilterFormProps {
  onApply: (filters: {
    startDate: string;
    endDate: string;
    platforms: string[];
    contentFilter: "all" | "video_only";
  }) => void;
  initialFilters?: {
    startDate?: string;
    endDate?: string;
    platforms?: string[];
    contentFilter?: "all" | "video_only";
  };
}

const PLATFORMS = [
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "X / Twitter" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
];

export default function FilterForm({ onApply, initialFilters }: FilterFormProps) {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .split("T")[0];

  const [startDate, setStartDate] = useState(
    initialFilters?.startDate ?? thirtyDaysAgo
  );
  const [endDate, setEndDate] = useState(initialFilters?.endDate ?? today);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    initialFilters?.platforms ?? PLATFORMS.map((p) => p.value)
  );
  const [contentFilter, setContentFilter] = useState<"all" | "video_only">(
    initialFilters?.contentFilter ?? "all"
  );

  function togglePlatform(value: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(value)
        ? prev.filter((p) => p !== value)
        : [...prev, value]
    );
  }

  function handleApply() {
    onApply({
      startDate,
      endDate,
      platforms: selectedPlatforms,
      contentFilter,
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-clutch-grey/60">
          From
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-clutch-blue focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-clutch-grey/60">
          To
        </label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-clutch-blue focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-clutch-grey/60">
          Platforms
        </label>
        <div className="flex gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => togglePlatform(p.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedPlatforms.includes(p.value)
                  ? "bg-clutch-blue text-white"
                  : "bg-gray-100 text-clutch-grey hover:bg-gray-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-clutch-grey/60">
          Content
        </label>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
          <button
            type="button"
            onClick={() => setContentFilter("all")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              contentFilter === "all"
                ? "bg-white text-clutch-black shadow-sm"
                : "text-clutch-grey"
            }`}
          >
            All Content
          </button>
          <button
            type="button"
            onClick={() => setContentFilter("video_only")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              contentFilter === "video_only"
                ? "bg-white text-clutch-black shadow-sm"
                : "text-clutch-grey"
            }`}
          >
            Video Only
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleApply}
        className="rounded-lg bg-clutch-blue px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-clutch-blue/90"
      >
        Apply
      </button>
    </div>
  );
}
