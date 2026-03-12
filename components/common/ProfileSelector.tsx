"use client";

import { useProfiles } from "@/hooks/useProfiles";

export default function ProfileSelector() {
  const { profiles, selectedProfileId, setSelectedProfileId, isLoading } = useProfiles();

  if (isLoading || profiles.length <= 1) return null;

  return (
    <select
      value={selectedProfileId ?? ""}
      onChange={(e) => setSelectedProfileId(e.target.value || null)}
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-clutch-blue focus:outline-none focus:ring-1 focus:ring-clutch-blue"
    >
      <option value="">All Profiles</option>
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
