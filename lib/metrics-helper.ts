import { prisma } from "@/lib/db";
import type { MetricType } from "@prisma/client";

interface LatestMetric {
  postId: string;
  metricType: MetricType;
  metricValue: bigint;
}

/**
 * Fetch only the latest metric snapshot per post per metric type.
 * Uses a raw SQL query with DISTINCT ON to avoid loading all historical snapshots.
 */
export async function getLatestMetrics(postIds: string[]): Promise<Map<string, Map<string, number>>> {
  if (postIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<LatestMetric[]>`
    SELECT DISTINCT ON ("postId", "metricType")
      "postId", "metricType", "metricValue"
    FROM "PostMetric"
    WHERE "postId" = ANY(${postIds})
    ORDER BY "postId", "metricType", "metricDate" DESC
  `;

  // Build map: postId -> metricType -> value
  const result = new Map<string, Map<string, number>>();
  for (const row of rows) {
    let postMap = result.get(row.postId);
    if (!postMap) {
      postMap = new Map();
      result.set(row.postId, postMap);
    }
    postMap.set(row.metricType, Number(row.metricValue));
  }

  return result;
}

/**
 * Helper to get a metric value from the metrics map.
 */
export function metricValue(
  metricsMap: Map<string, Map<string, number>>,
  postId: string,
  type: string
): number {
  return metricsMap.get(postId)?.get(type) ?? 0;
}

/**
 * Like `getLatestMetrics`, but bounded by a date. Picks the most
 * recent snapshot per (post, metricType) whose `metricDate` is on or
 * before `asOf`.
 *
 * Why we need this: PostMetric stores cumulative daily snapshots. For
 * historical exports the right value is "engagement as of the report
 * end date" — not the sum of every snapshot in the window (which would
 * double-count cumulative values), and not always today's value (which
 * might over-report what was visible at the time). When the report
 * spans into the future or beyond our daily-sync coverage, this just
 * returns the most recent snapshot we have.
 */
export async function getLatestMetricsAsOf(
  postIds: string[],
  asOf: Date
): Promise<Map<string, Map<string, number>>> {
  if (postIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<LatestMetric[]>`
    SELECT DISTINCT ON ("postId", "metricType")
      "postId", "metricType", "metricValue"
    FROM "PostMetric"
    WHERE "postId" = ANY(${postIds})
      AND "metricDate" <= ${asOf}
    ORDER BY "postId", "metricType", "metricDate" DESC
  `;

  const result = new Map<string, Map<string, number>>();
  for (const row of rows) {
    let postMap = result.get(row.postId);
    if (!postMap) {
      postMap = new Map();
      result.set(row.postId, postMap);
    }
    postMap.set(row.metricType, Number(row.metricValue));
  }
  return result;
}
