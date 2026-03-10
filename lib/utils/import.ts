import * as XLSX from "xlsx";
import csvParser from "csv-parser";
import { Readable } from "stream";

export interface ImportRow {
  platform: string;
  postId: string;
  title: string;
  publishedDate: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  postType: string;
}

export interface ImportError {
  row: number;
  column: string;
  error: string;
}

export interface ParseResult {
  rows: ImportRow[];
  errors: ImportError[];
}

const VALID_PLATFORMS = ["youtube", "twitter", "instagram", "tiktok"];
const VALID_POST_TYPES = ["video", "image", "carousel", "text", "short", "live", "story"];

const COLUMN_MAP: Record<string, string> = {
  platform: "platform",
  postid: "postId",
  post_id: "postId",
  title: "title",
  publisheddate: "publishedDate",
  published_date: "publishedDate",
  published: "publishedDate",
  date: "publishedDate",
  views: "views",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  posttype: "postType",
  post_type: "postType",
  type: "postType",
};

function normalizeColumnName(col: string): string {
  const key = col.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return COLUMN_MAP[key] ?? key;
}

function parseNonNegativeInt(val: unknown): number | null {
  if (val === undefined || val === null || val === "") return 0;
  const n = Number(val);
  if (isNaN(n) || n < 0 || !Number.isFinite(n)) return null;
  return Math.floor(n);
}

function validateRow(
  raw: Record<string, unknown>,
  rowNum: number
): { row: ImportRow | null; errors: ImportError[] } {
  const errors: ImportError[] = [];

  // Normalize keys
  const normalized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    normalized[normalizeColumnName(key)] = typeof val === "string" ? val.trim() : val;
  }

  const platform = String(normalized.platform ?? "").toLowerCase();
  if (!VALID_PLATFORMS.includes(platform)) {
    errors.push({ row: rowNum, column: "Platform", error: `Invalid platform: "${normalized.platform}"` });
  }

  const postId = String(normalized.postId ?? "").trim();
  if (!postId) {
    errors.push({ row: rowNum, column: "PostId", error: "PostId is required" });
  }

  const title = String(normalized.title ?? "").trim();

  const publishedDate = String(normalized.publishedDate ?? "").trim();
  const parsedDate = new Date(publishedDate);
  if (!publishedDate || isNaN(parsedDate.getTime())) {
    errors.push({ row: rowNum, column: "PublishedDate", error: `Invalid date: "${publishedDate}"` });
  }

  const views = parseNonNegativeInt(normalized.views);
  if (views === null) {
    errors.push({ row: rowNum, column: "Views", error: `Invalid views: "${normalized.views}"` });
  }

  const likes = parseNonNegativeInt(normalized.likes);
  if (likes === null) {
    errors.push({ row: rowNum, column: "Likes", error: `Invalid likes: "${normalized.likes}"` });
  }

  const comments = parseNonNegativeInt(normalized.comments);
  if (comments === null) {
    errors.push({ row: rowNum, column: "Comments", error: `Invalid comments: "${normalized.comments}"` });
  }

  const shares = parseNonNegativeInt(normalized.shares);
  if (shares === null) {
    errors.push({ row: rowNum, column: "Shares", error: `Invalid shares: "${normalized.shares}"` });
  }

  let postType = String(normalized.postType ?? "video").toLowerCase();
  if (!VALID_POST_TYPES.includes(postType)) {
    postType = "video"; // Default
  }

  if (errors.length > 0) {
    return { row: null, errors };
  }

  return {
    row: {
      platform,
      postId,
      title: title || "Untitled",
      publishedDate: parsedDate.toISOString().split("T")[0],
      views: views!,
      likes: likes!,
      comments: comments!,
      shares: shares!,
      postType,
    },
    errors: [],
  };
}

/**
 * Parse an Excel file buffer into validated rows.
 */
export function parseExcelBuffer(buffer: Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: [{ row: 0, column: "", error: "No sheets found in file" }] };
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]);
  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const result = validateRow(rawRows[i], i + 2); // +2 for 1-indexed + header row
    if (result.row) rows.push(result.row);
    errors.push(...result.errors);
  }

  return { rows, errors };
}

/**
 * Parse a CSV buffer into validated rows.
 */
export async function parseCSVBuffer(buffer: Buffer): Promise<ParseResult> {
  return new Promise((resolve) => {
    const rows: ImportRow[] = [];
    const errors: ImportError[] = [];
    let rowNum = 1;

    const stream = Readable.from(buffer);
    stream
      .pipe(csvParser())
      .on("data", (data: Record<string, unknown>) => {
        rowNum++;
        const result = validateRow(data, rowNum);
        if (result.row) rows.push(result.row);
        errors.push(...result.errors);
      })
      .on("end", () => {
        resolve({ rows, errors });
      })
      .on("error", (err) => {
        errors.push({ row: 0, column: "", error: `CSV parse error: ${err.message}` });
        resolve({ rows, errors });
      });
  });
}
