"use client";

import { useState } from "react";
import Modal from "@/components/common/Modal";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-select a platform, or leave undefined for cross-platform */
  platform?: string;
  startDate: string;
  endDate: string;
}

const METRIC_OPTIONS = [
  { key: "postId", label: "Post ID" },
  { key: "platform", label: "Platform" },
  { key: "postType", label: "Content Type" },
  { key: "title", label: "Title" },
  { key: "contentUrl", label: "URL" },
  { key: "publishedAt", label: "Published Date" },
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "impressions", label: "Impressions" },
  { key: "reach", label: "Reach" },
  { key: "engagementRate", label: "Engagement Rate (%)" },
];

export default function ExportModal({
  isOpen,
  onClose,
  platform,
  startDate,
  endDate,
}: ExportModalProps) {
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [customRange, setCustomRange] = useState(false);
  const [exportStart, setExportStart] = useState(startDate);
  const [exportEnd, setExportEnd] = useState(endDate);
  const [selectedPlatform, setSelectedPlatform] = useState(platform ?? "");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(
    METRIC_OPTIONS.map((m) => m.key)
  );
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMetric = (key: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAll = () => setSelectedMetrics(METRIC_OPTIONS.map((m) => m.key));
  const selectNone = () => setSelectedMetrics([]);

  const handleExport = async () => {
    if (selectedMetrics.length === 0) {
      setError("Select at least one column");
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const body = {
        platform: selectedPlatform || undefined,
        startDate: customRange ? exportStart : startDate,
        endDate: customRange ? exportEnd : endDate,
        metrics: selectedMetrics,
      };

      const res = await fetch(`/api/exports/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error ?? "Export failed");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        `export.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="Export Data">
      <div className="space-y-4">
        {/* Format selector */}
        <div>
          <label className="mb-1 block text-xs font-medium text-clutch-grey">
            Format
          </label>
          <div className="flex gap-2">
            {(["csv", "xlsx"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
                  format === f
                    ? "bg-clutch-red text-white"
                    : "border border-gray-300 text-clutch-grey hover:bg-gray-50"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Platform selector */}
        {!platform && (
          <div>
            <label className="mb-1 block text-xs font-medium text-clutch-grey">
              Platform
            </label>
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">All Platforms</option>
              <option value="youtube">YouTube</option>
              <option value="twitter">Twitter</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
            </select>
          </div>
        )}

        {/* Date range */}
        <div>
          <label className="mb-1 flex items-center gap-2 text-xs font-medium text-clutch-grey">
            <input
              type="checkbox"
              checked={customRange}
              onChange={(e) => setCustomRange(e.target.checked)}
              className="rounded"
            />
            Custom date range
          </label>
          {customRange && (
            <div className="mt-2 flex gap-2">
              <input
                type="date"
                value={exportStart}
                onChange={(e) => setExportStart(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={exportEnd}
                onChange={(e) => setExportEnd(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          )}
          {!customRange && (
            <p className="mt-1 text-[10px] text-clutch-grey/50">
              Using dashboard range: {startDate} to {endDate}
            </p>
          )}
        </div>

        {/* Column selector */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-clutch-grey">
              Columns
            </label>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-[10px] text-clutch-red hover:underline">
                All
              </button>
              <button onClick={selectNone} className="text-[10px] text-clutch-grey/50 hover:underline">
                None
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {METRIC_OPTIONS.map((m) => (
              <label
                key={m.key}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedMetrics.includes(m.key)}
                  onChange={() => toggleMetric(m.key)}
                  className="rounded"
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-clutch-grey hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || selectedMetrics.length === 0}
            className="rounded-lg bg-clutch-red px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {isExporting ? "Exporting..." : `Download ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
