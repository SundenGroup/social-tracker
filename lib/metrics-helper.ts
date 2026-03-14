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
