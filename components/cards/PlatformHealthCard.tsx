"use client";

import Link from "next/link";

interface PlatformHealthCardProps {
  platform: string;
  engagements: number;
  engagementRate: number;
  followers: number;
  followerGrowth: number;
  totalPosts: number;
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

export default function PlatformHealthCard({
  platform,
  engagements,
  engagementRate,
  followers,
  followerGrowth,
  totalPosts,
}: PlatformHealthCardProps) {
  const color = PLATFORM_COLORS[platform] ?? "#666";

  return (
    <Link
      href={`/platforms/${platform}`}
      className="block rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-bold capitalize text-clutch-black">
          {platform}
        </span>
      </div>

      <div className="mb-2 text-lg font-bold text-clutch-black">
        {engagementRate}%
        <span className="ml-1 text-xs font-normal text-clutch-grey/50">eng. rate</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs font-semibold text-clutch-black">{formatCompact(engagements)}</p>
          <p className="text-[10px] text-clutch-grey/50">Engagements</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-clutch-black">{formatCompact(followers)}</p>
          <p className="text-[10px] text-clutch-grey/50">Followers</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-clutch-black">{totalPosts}</p>
          <p className="text-[10px] text-clutch-grey/50">Posts</p>
        </div>
      </div>

      {followerGrowth !== 0 && (
        <div className="mt-2 text-center">
          <span
            className={`text-xs font-medium ${
              followerGrowth > 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {followerGrowth > 0 ? "+" : ""}
            {formatCompact(followerGrowth)} followers
          </span>
        </div>
      )}
    </Link>
  );
}
