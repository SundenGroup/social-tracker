"use client";

import Header from "@/components/layouts/Header";
import ImportForm from "@/components/forms/ImportForm";

export default function ImportPage() {
  return (
    <>
      <Header title="Import Historical Data" />

      {/* Instructions */}
      <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] p-5">
        <h2 className="mb-3 text-sm font-bold text-[var(--fg)]">
          File Format Requirements
        </h2>
        <p className="mb-3 text-xs text-[var(--fg-muted)]">
          Upload a CSV or Excel file with your historical social media data.
          The file must include the following columns:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--fg-subtle)]">
                <th className="pb-2 pr-4 font-medium">Column</th>
                <th className="pb-2 pr-4 font-medium">Required</th>
                <th className="pb-2 pr-4 font-medium">Format</th>
                <th className="pb-2 font-medium">Example</th>
              </tr>
            </thead>
            <tbody className="text-[var(--fg-muted)]">
              <tr className="border-b border-[var(--border)]">
                <td className="py-1.5 pr-4 font-medium text-[var(--fg)]">Platform</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">youtube, twitter, instagram, tiktok</td>
                <td className="py-1.5">youtube</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-1.5 pr-4 font-medium text-[var(--fg)]">PostId</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">Platform-specific ID</td>
                <td className="py-1.5">abc123</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-1.5 pr-4 font-medium text-[var(--fg)]">Title</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">Post title or text</td>
                <td className="py-1.5">My Video Title</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-1.5 pr-4 font-medium text-[var(--fg)]">PublishedDate</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">YYYY-MM-DD</td>
                <td className="py-1.5">2024-01-15</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-1.5 pr-4 font-medium text-[var(--fg)]">Views</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">Non-negative integer</td>
                <td className="py-1.5">1000</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-1.5 pr-4 font-medium text-[var(--fg)]">Likes</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">Non-negative integer</td>
                <td className="py-1.5">50</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-1.5 pr-4 font-medium text-[var(--fg)]">Comments</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">Non-negative integer</td>
                <td className="py-1.5">10</td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-1.5 pr-4 font-medium text-[var(--fg)]">Shares</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">Non-negative integer</td>
                <td className="py-1.5">5</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4 font-medium text-[var(--fg)]">PostType</td>
                <td className="py-1.5 pr-4">No</td>
                <td className="py-1.5 pr-4">video, text, image, carousel, slideshow, short, live</td>
                <td className="py-1.5">video</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] text-[var(--fg-subtle)]">
          Column names are case-insensitive. Duplicates are handled automatically (existing posts will be updated).
          You must have a social account configured for each platform you import data for.
        </p>
      </div>

      {/* Import Form */}
      <div className="mx-auto max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] p-6">
        <h2 className="mb-4 text-sm font-bold text-[var(--fg)]">Upload File</h2>
        <ImportForm />
      </div>
    </>
  );
}
