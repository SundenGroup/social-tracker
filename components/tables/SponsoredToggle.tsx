"use client";

interface SponsoredToggleProps {
  postId: string;
  isSponsored: boolean;
  onToggled: () => void;
}

export default function SponsoredToggle({ postId, isSponsored, onToggled }: SponsoredToggleProps) {
  async function handleClick() {
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSponsored: !isSponsored }),
      });
      if (res.ok) onToggled();
    } catch {
      // silently fail
    }
  }

  return (
    <button
      onClick={handleClick}
      title={isSponsored ? "Sponsored (click to remove)" : "Mark as sponsored"}
      className={`inline-flex items-center justify-center rounded p-0.5 transition-colors ${
        isSponsored
          ? "text-amber-600 hover:text-amber-700"
          : "text-gray-300 hover:text-gray-400"
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill={isSponsored ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    </button>
  );
}
