"use client";

import { useCallback, useState } from "react";

export function useExport() {
  const [isExporting, setIsExporting] = useState(false);

  const exportToCSV = useCallback(
    (data: Record<string, unknown>[], filename: string) => {
      if (data.length === 0) return;

      setIsExporting(true);
      try {
        const headers = Object.keys(data[0]);
        const csvRows = [
          headers.join(","),
          ...data.map((row) =>
            headers
              .map((h) => {
                const val = row[h];
                const str = val === null || val === undefined ? "" : String(val);
                // Escape quotes and wrap in quotes if contains comma/quote/newline
                if (str.includes(",") || str.includes('"') || str.includes("\n")) {
                  return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
              })
              .join(",")
          ),
        ];

        const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${filename}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  return { exportToCSV, isExporting };
}
