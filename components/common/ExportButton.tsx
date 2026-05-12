"use client";

import { useState } from "react";
import { DownloadIcon } from "@/components/icons/PlatformGlyph";
import ExportModal from "@/components/modals/ExportModal";

interface ExportButtonProps {
  startDate: string;
  endDate: string;
  /** Pre-select a platform when the button lives on a platform page. */
  platform?: string;
  /** Current tag-filter selection from the host page. Forwarded so
   *  the export respects "PEC", "Only X", "No tag" etc. — without
   *  this, exports ignore the user's tag filter entirely. */
  tags?: string[];
  /** Visual variant — "solid" is dark filled (header primary action),
   *  "outline" is the lighter pill that matches other top-bar chips. */
  variant?: "solid" | "outline";
  label?: string;
}

/**
 * Opens the Export modal (CSV / XLSX with column + platform + date picker).
 * Drop anywhere a Header's children slot accepts top-bar controls.
 */
export default function ExportButton({
  startDate,
  endDate,
  platform,
  tags,
  variant = "outline",
  label = "Export",
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);

  const styles: React.CSSProperties =
    variant === "solid"
      ? {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px",
          borderRadius: 8,
          background: "var(--fg)",
          color: "var(--bg-elev)",
          border: "none",
          fontSize: 12,
          fontWeight: 600,
        }
      : {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px",
          borderRadius: 8,
          background: "var(--bg-elev)",
          color: "var(--fg-muted)",
          border: "1px solid var(--border)",
          fontSize: 12,
          fontWeight: 600,
        };

  return (
    <>
      <button onClick={() => setOpen(true)} style={styles} title="Export data">
        <DownloadIcon />
        {label}
      </button>
      <ExportModal
        isOpen={open}
        onClose={() => setOpen(false)}
        platform={platform}
        startDate={startDate}
        endDate={endDate}
        tags={tags}
      />
    </>
  );
}
