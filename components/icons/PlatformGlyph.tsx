import type { SVGProps } from "react";

export type Platform = "youtube" | "tiktok" | "twitter" | "instagram";

interface PlatformGlyphProps extends Omit<SVGProps<SVGSVGElement>, "className"> {
  platform: Platform | string;
  size?: number;
  /** Use white fills on a colored background instead of brand colors */
  invert?: boolean;
  className?: string;
}

/**
 * Platform glyphs — simplified, recognizable, original geometry.
 * Sized to work from 10–36px.
 */
export function PlatformGlyph({ platform, size = 14, invert = false, className, ...rest }: PlatformGlyphProps) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", className, ...rest };

  if (platform === "youtube") {
    return (
      <svg {...common} aria-label="YouTube">
        <rect x="2" y="5" width="20" height="14" rx="4" fill={invert ? "currentColor" : "#FF0033"} />
        <path d="M10 9.2v5.6l5-2.8z" fill={invert ? "#000" : "#fff"} />
      </svg>
    );
  }

  if (platform === "tiktok") {
    return (
      <svg {...common} aria-label="TikTok">
        <path
          d="M14 3v10.2a3.5 3.5 0 11-3.5-3.5c.4 0 .8.07 1.2.2V6.4a7 7 0 106.8 7V9.1a6.4 6.4 0 003.5 1V6.7a3.9 3.9 0 01-3.5-3.7H14z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (platform === "twitter" || platform === "x") {
    return (
      <svg {...common} aria-label="X">
        <path
          d="M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.5L4.8 21H1.6l7.5-8.6L1.2 3h6.6l4.5 5.9L17.5 3zm-1.1 16.1h1.8L7.6 4.8H5.7l10.7 14.3z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (platform === "instagram") {
    return (
      <svg {...common} aria-label="Instagram">
        <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  return null;
}

export const PLATFORM_COLOR: Record<string, string> = {
  youtube: "#FF0033",
  tiktok: "var(--tt)",
  twitter: "#1DA1F2",
  x: "#1DA1F2",
  instagram: "#E4405F",
};

export const PLATFORM_LABEL: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  twitter: "X",
  x: "X",
  instagram: "Instagram",
};

export const PLATFORM_SHORT: Record<string, string> = {
  youtube: "YT",
  tiktok: "TT",
  twitter: "X",
  x: "X",
  instagram: "IG",
};

// Small SVG helper for the UI icons used throughout
function Ico({ d, size = 16, stroke = 1.75, className }: { d: string; size?: number; stroke?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

export const Chevron = ({ size = 14, dir = "down" }: { size?: number; dir?: "up" | "down" | "left" | "right" }) => (
  <Ico
    size={size}
    d={
      dir === "down"
        ? "M6 9l6 6 6-6"
        : dir === "right"
        ? "M9 6l6 6-6 6"
        : dir === "left"
        ? "M15 6l-6 6 6 6"
        : "M6 15l6-6 6 6"
    }
  />
);

export const SearchIcon = ({ size = 16 }: { size?: number }) => <Ico size={size} d="M21 21l-4.35-4.35M11 18a7 7 0 110-14 7 7 0 010 14z" />;
export const FilterIcon = ({ size = 14 }: { size?: number }) => <Ico size={size} d="M3 5h18M6 12h12M10 19h4" />;
export const DownloadIcon = ({ size = 14 }: { size?: number }) => <Ico size={size} d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />;
export const RefreshIcon = ({ size = 14 }: { size?: number }) => <Ico size={size} d="M21 12a9 9 0 10-3 6.7M21 4v5h-5" />;
export const ArrowUpIcon = ({ size = 12 }: { size?: number }) => <Ico size={size} d="M12 19V5M5 12l7-7 7 7" />;
export const ArrowDownIcon = ({ size = 12 }: { size?: number }) => <Ico size={size} d="M12 5v14M5 12l7 7 7-7" />;
export const SunIcon = ({ size = 14 }: { size?: number }) => (
  <Ico size={size} d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z" />
);
export const MoonIcon = ({ size = 14 }: { size?: number }) => <Ico size={size} d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />;
export const SparkleIcon = ({ size = 14 }: { size?: number }) => <Ico size={size} d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />;

export const PlayIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M6 4l14 8-14 8V4z" />
  </svg>
);
export const ImageIcon = ({ size = 12 }: { size?: number }) => <Ico size={size} d="M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6" />;
export const CarouselIcon = ({ size = 12 }: { size?: number }) => <Ico size={size} d="M4 7h12v10H4zM18 9v6M21 10v4" />;

export function PostTypeIcon({ type, size = 12 }: { type?: string | null; size?: number }) {
  const t = (type ?? "").toLowerCase();
  if (t.includes("video") || t.includes("short") || t.includes("long") || t.includes("reel")) return <PlayIcon size={size} />;
  if (t.includes("carousel")) return <CarouselIcon size={size} />;
  return <ImageIcon size={size} />;
}

export function Dot({ size = 6, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden>
      <circle cx="5" cy="5" r="5" fill={color} />
    </svg>
  );
}
