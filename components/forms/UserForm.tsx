"use client";

import { useEffect, useState } from "react";

interface UserData {
  id?: string;
  name: string;
  email: string;
  role: string;
  isActive?: boolean;
  profileId?: string | null;
}

interface UserFormProps {
  user?: UserData;
  onSubmit: (data: UserData) => Promise<void>;
  isLoading?: boolean;
}

interface ProfileOption {
  id: string;
  name: string;
}

export default function UserForm({ user, onSubmit, isLoading }: UserFormProps) {
  const isEdit = !!user?.id;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState(user?.role ?? "viewer");
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  // "all" = no profile scope. Any other value is a concrete profileId.
  const [profileSelection, setProfileSelection] = useState<string>(
    user?.profileId ?? "all"
  );
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the list of profiles this org has, so the admin can pick one to
  // scope a viewer to.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/profiles");
        const json = await res.json();
        if (res.ok) {
          setProfiles(
            (json.data as ProfileOption[]).map((p) => ({ id: p.id, name: p.name }))
          );
        }
      } catch {
        // ignore — profiles are optional
      } finally {
        setProfilesLoading(false);
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim()) {
      setError("Name and email are required");
      return;
    }

    try {
      await onSubmit({
        id: user?.id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        isActive,
        // Admins always see everything — clear any scope on submit.
        // "all" is our sentinel for no-scope.
        profileId: role === "admin" || profileSelection === "all" ? null : profileSelection,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const showProfileField = role === "viewer";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-clutch-grey">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-clutch-red focus:outline-none focus:ring-1 focus:ring-clutch-red"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-clutch-grey">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isEdit}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-clutch-red focus:outline-none focus:ring-1 focus:ring-clutch-red disabled:bg-gray-100 disabled:text-clutch-grey/50"
          required
        />
        {isEdit && (
          <p className="mt-1 text-[10px] text-clutch-grey/50">
            Email cannot be changed
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-clutch-grey">
          Role
        </label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
        </select>
        <p className="mt-1 text-[10px] text-clutch-grey/50">
          Viewers can access dashboards and export data. Admins can manage connections and users.
        </p>
      </div>

      {/* Profile scope — viewers only. Admins always see everything. */}
      {showProfileField && (
        <div>
          <label className="mb-1 block text-xs font-medium text-clutch-grey">
            Profile access
          </label>
          <select
            value={profileSelection}
            onChange={(e) => setProfileSelection(e.target.value)}
            disabled={profilesLoading}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
          >
            <option value="all">All profiles</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-clutch-grey/50">
            {profileSelection === "all"
              ? "Sees data across every profile in the organization."
              : "Locked to this profile only — other profiles' data is invisible to them."}
          </p>
        </div>
      )}

      {isEdit && (
        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-clutch-grey">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            Active
          </label>
          <p className="mt-1 text-[10px] text-clutch-grey/50">
            Inactive users cannot log in
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-clutch-grey hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-clutch-red px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {isLoading ? "Saving..." : isEdit ? "Update user" : "Send invite"}
        </button>
      </div>
    </form>
  );
}
