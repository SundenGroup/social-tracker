"use client";

interface PlatformRow {
  platform: string;
  views: number;
  impressions: number;
  reach: number;
  engagements: number;
  engagementRate: number;
  followers: number;
  followerGrowth: number;
  totalPosts: number;
  accountName: string | null;
}

interface PlatformComparisonTableProps {
  platforms: PlatformRow[];
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "#FF0000",
  twitter: "#1DA1F2",
  instagram: "#E4405F",
  tiktok: "#000000",
};

export default function PlatformComparisonTable({ platforms }: PlatformComparisonTableProps) {
  if (platforms.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-clutch-grey/50">
        No platform data available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-clutch-grey/50">
            <th className="pb-2 pr-4 font-medium">Platform</th>
            <th className="pb-2 pr-4 font-medium text-right">Views / Impressions</th>
            <th className="pb-2 pr-4 font-medium text-right">Engagements</th>
            <th className="pb-2 pr-4 font-medium text-right">Eng. Rate</th>
            <th className="pb-2 pr-4 font-medium text-right">Followers</th>
            <th className="pb-2 pr-4 font-medium text-right">Growth</th>
            <th className="pb-2 font-medium text-right">Posts</th>
          </tr>
        </thead>
        <tbody>
          {platforms.map((p) => {
            const primaryReach = p.views || p.impressions || p.reach;
            return (
              <tr key={p.platform} className="border-b border-gray-50">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: PLATFORM_COLORS[p.platform] ?? "#666" }}
                    />
                    <span className="font-medium capitalize text-clutch-black">
                      {p.platform}
                    </span>
                  </div>
                  {p.accountName && (
                    <span className="ml-5 text-[10px] text-clutch-grey/40">
                      {p.accountName}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 text-right font-medium">
                  {formatCompact(primaryReach)}
                </td>
                <td className="py-3 pr-4 text-right">{formatCompact(p.engagements)}</td>
                <td className="py-3 pr-4 text-right">{p.engagementRate}%</td>
                <td className="py-3 pr-4 text-right">{formatCompact(p.followers)}</td>
                <td className="py-3 pr-4 text-right">
                  <span
                    className={
                      p.followerGrowth > 0
                        ? "text-green-600"
                        : p.followerGrowth < 0
                          ? "text-red-600"
                          : "text-clutch-grey/50"
                    }
                  >
                    {p.followerGrowth > 0 ? "+" : ""}
                    {formatCompact(p.followerGrowth)}
                  </span>
                </td>
                <td className="py-3 text-right">{p.totalPosts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[10px] text-clutch-grey/40">
        Note: Metrics vary by platform. YouTube reports &quot;views&quot;, Twitter reports &quot;impressions&quot;,
        Instagram reports &quot;reach&quot;. Use engagement rate for the most comparable cross-platform metric.
      </p>
    </div>
  );
}
