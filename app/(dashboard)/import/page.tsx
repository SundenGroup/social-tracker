"use client";

import Header from "@/components/layouts/Header";
import ImportForm from "@/components/forms/ImportForm";

export default function ImportPage() {
  return (
    <>
      <Header title="Import Historical Data" />

      {/* Instructions */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-clutch-black">
          File Format Requirements
        </h2>
        <p className="mb-3 text-xs text-clutch-grey/70">
          Upload a CSV or Excel file with your historical social media data.
          The file must include the following columns:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-clutch-grey/50">
                <th className="pb-2 pr-4 font-medium">Column</th>
                <th className="pb-2 pr-4 font-medium">Required</th>
                <th className="pb-2 pr-4 font-medium">Format</th>
                <th className="pb-2 font-medium">Example</th>
              </tr>
            </thead>
            <tbody className="text-clutch-grey/70">
              <tr className="border-b border-gray-50">
                <td className="py-1.5 pr-4 font-medium text-clutch-black">Platform</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">youtube, twitter, instagram, tiktok</td>
                <td className="py-1.5">youtube</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-1.5 pr-4 font-medium text-clutch-black">PostId</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">Platform-specific ID</td>
                <td className="py-1.5">abc123</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-1.5 pr-4 font-medium text-clutch-black">Title</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">Post title or text</td>
                <td className="py-1.5">My Video Title</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-1.5 pr-4 font-medium text-clutch-black">PublishedDate</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">YYYY-MM-DD</td>
                <td className="py-1.5">2024-01-15</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-1.5 pr-4 font-medium text-clutch-black">Views</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">Non-negative integer</td>
                <td className="py-1.5">1000</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-1.5 pr-4 font-medium text-clutch-black">Likes</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">Non-negative integer</td>
                <td className="py-1.5">50</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-1.5 pr-4 font-medium text-clutch-black">Comments</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">Non-negative integer</td>
                <td className="py-1.5">10</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-1.5 pr-4 font-medium text-clutch-black">Shares</td>
                <td className="py-1.5 pr-4">Yes</td>
                <td className="py-1.5 pr-4">Non-negative integer</td>
                <td className="py-1.5">5</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4 font-medium text-clutch-black">PostType</td>
                <td className="py-1.5 pr-4">No</td>
                <td className="py-1.5 pr-4">video, text, image, carousel, short, live</td>
                <td className="py-1.5">video</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] text-clutch-grey/40">
          Column names are case-insensitive. Duplicates are handled automatically (existing posts will be updated).
          You must have a social account configured for each platform you import data for.
        </p>
      </div>

      {/* Import Form */}
      <div className="mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">Upload File</h2>
        <ImportForm />
      </div>
    </>
  );
}
