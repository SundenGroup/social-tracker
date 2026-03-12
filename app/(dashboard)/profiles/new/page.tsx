"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/common/Toast";
import { useProfiles } from "@/hooks/useProfiles";

export default function NewProfilePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { refetch } = useProfiles();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Profile name is required");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create profile");
        return;
      }

      toast("success", "Profile created");
      await refetch();
      router.push("/profiles");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-clutch-black">New Profile</h1>
      </div>

      <div className="mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-clutch-black">
              Profile Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-clutch-blue focus:outline-none focus:ring-1 focus:ring-clutch-blue"
              placeholder="e.g. PUBG Esports Global"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/profiles")}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-clutch-grey hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded-lg bg-clutch-red px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-clutch-red/90 disabled:opacity-50"
            >
              {isLoading ? "Creating..." : "Create Profile"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
