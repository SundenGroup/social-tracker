import Link from "next/link";

const PLATFORM_CONFIG: Record<
  string,
  { label: string; color: string; href: string }
> = {
  youtube: {
    label: "YouTube",
    color: "border-l-red-500",
    href: "/platforms/youtube",
  },
  twitter: {
    label: "X / Twitter",
    color: "border-l-sky-500",
    href: "/platforms/twitter",
  },
  instagram: {
    label: "Instagram",
    color: "border-l-pink-500",
    href: "/platforms/instagram",
  },
  tiktok: {
    label: "TikTok",
    color: "border-l-gray-800",
    href: "/platforms/tiktok",
  },
};

interface PlatformCardProps {
  platform: string;
  views: number;
  engagements: number;
  topPost: string | null;
  followers?: number;
  followerGrowth?: number;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function PlatformCard({
  platform,
  views,
  engagements,
  topPost,
  followers,
  followerGrowth,
}: PlatformCardProps) {
  const config = PLATFORM_CONFIG[platform] ?? {
    label: platform,
    color: "border-l-gray-400",
    href: "#",
  };

  return (
    <Link href={config.href}>
      <div
        className={`rounded-xl border border-gray-200 border-l-4 ${config.color} bg-white p-5 transition-shadow hover:shadow-md`}
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-clutch-grey/50">
          {config.label}
        </p>
        <div className="mb-3 flex gap-6">
          <div>
            <p className="text-lg font-bold text-clutch-black">
              {formatCompact(views)}
            </p>
            <p className="text-xs text-clutch-grey/50">Views</p>
          </div>
          <div>
            <p className="text-lg font-bold text-clutch-black">
              {formatCompact(engagements)}
            </p>
            <p className="text-xs text-clutch-grey/50">Eng.</p>
          </div>
          {followers != null && followers > 0 && (
            <div>
              <p className="text-lg font-bold text-clutch-black">
                {formatCompact(followers)}
              </p>
              <p className="text-xs text-clutch-grey/50">
                Followers
                {followerGrowth != null && followerGrowth !== 0 && (
                  <span className={`ml-1 ${followerGrowth > 0 ? "text-green-600" : "text-red-500"}`}>
                    {followerGrowth > 0 ? "+" : ""}{formatCompact(followerGrowth)}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
        {topPost && (
          <p className="truncate text-xs text-clutch-grey/60">
            Top: {topPost}
          </p>
        )}
      </div>
    </Link>
  );
}
