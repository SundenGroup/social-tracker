"use client";

interface PostGalleryItem {
  id: string;
  thumbnailUrl: string | null;
  title: string | null;
  metric: number;
  metricLabel: string;
  contentUrl: string;
}

interface PostGalleryProps {
  items: PostGalleryItem[];
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function PostGallery({ items }: PostGalleryProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-clutch-grey/50">
        No posts to display
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => (
        <a
          key={item.id}
          href={item.contentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md"
        >
          <div className="aspect-square bg-gray-100">
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt={item.title ?? ""}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-clutch-grey/30">
                No image
              </div>
            )}
          </div>
          <div className="p-2">
            <p className="truncate text-xs font-medium text-clutch-black">
              {item.title || "Untitled"}
            </p>
            <p className="text-xs text-clutch-grey/50">
              {formatCompact(item.metric)} {item.metricLabel}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}
