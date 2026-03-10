import * as XLSX from "xlsx";

export interface ExportRow {
  postId: string;
  platform: string;
  postType: string;
  title: string;
  contentUrl: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
  engagementRate: number;
}

const COLUMN_LABELS: Record<string, string> = {
  postId: "Post ID",
  platform: "Platform",
  postType: "Content Type",
  title: "Title",
  contentUrl: "URL",
  publishedAt: "Published Date",
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  impressions: "Impressions",
  reach: "Reach",
  engagementRate: "Engagement Rate (%)",
};

/**
 * Generate CSV string from export rows.
 */
export function generateCSV(
  rows: ExportRow[],
  columns: string[]
): string {
  const headers = columns.map((c) => COLUMN_LABELS[c] ?? c);

  const escape = (val: unknown): string => {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    const rec = row as unknown as Record<string, unknown>;
    lines.push(columns.map((c) => escape(rec[c])).join(","));
  }
  return lines.join("\n");
}

/**
 * Generate an Excel workbook buffer.
 * If rows span multiple platforms, creates one sheet per platform plus a summary.
 */
export function generateExcel(
  rows: ExportRow[],
  columns: string[]
): Buffer {
  const wb = XLSX.utils.book_new();

  const headers = columns.map((c) => COLUMN_LABELS[c] ?? c);

  // Group by platform
  const byPlatform = new Map<string, ExportRow[]>();
  for (const row of rows) {
    const key = row.platform;
    if (!byPlatform.has(key)) byPlatform.set(key, []);
    byPlatform.get(key)!.push(row);
  }

  // Create summary sheet
  const summaryData = Array.from(byPlatform.entries()).map(
    ([platform, platformRows]) => {
      const totalViews = platformRows.reduce((s, r) => s + r.views, 0);
      const totalLikes = platformRows.reduce((s, r) => s + r.likes, 0);
      const totalComments = platformRows.reduce((s, r) => s + r.comments, 0);
      const totalShares = platformRows.reduce((s, r) => s + r.shares, 0);
      const totalImpressions = platformRows.reduce((s, r) => s + r.impressions, 0);
      const engagements = totalLikes + totalComments + totalShares;
      const base = totalViews || totalImpressions || 1;
      return {
        Platform: platform.charAt(0).toUpperCase() + platform.slice(1),
        "Total Posts": platformRows.length,
        "Total Views": totalViews,
        "Total Likes": totalLikes,
        "Total Comments": totalComments,
        "Total Shares": totalShares,
        "Total Impressions": totalImpressions,
        "Avg Engagement Rate (%)": Number(
          ((engagements / base) * 100).toFixed(2)
        ),
      };
    }
  );

  const summaryWs = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

  // Create per-platform sheets (or single "All" sheet)
  if (byPlatform.size <= 1) {
    const wsData = rows.map((row) => {
      const rec = row as unknown as Record<string, unknown>;
      const obj: Record<string, unknown> = {};
      columns.forEach((c, i) => {
        obj[headers[i]] = rec[c];
      });
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Data");
  } else {
    for (const [platform, platformRows] of byPlatform) {
      const wsData = platformRows.map((row) => {
        const rec = row as unknown as Record<string, unknown>;
        const obj: Record<string, unknown> = {};
        columns.forEach((c, i) => {
          obj[headers[i]] = rec[c];
        });
        return obj;
      });
      const ws = XLSX.utils.json_to_sheet(wsData);
      const sheetName = platform.charAt(0).toUpperCase() + platform.slice(1);
      XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    }
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}
