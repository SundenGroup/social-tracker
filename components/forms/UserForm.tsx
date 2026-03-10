"use client";

import { useState } from "react";

interface UserData {
  id?: string;
  name: string;
  email: string;
  role: string;
  isActive?: boolean;
}

interface UserFormProps {
  user?: UserData;
  onSubmit: (data: UserData) => Promise<void>;
  isLoading?: boolean;
}

export default function UserForm({ user, onSubmit, isLoading }: UserFormProps) {
  const isEdit = !!user?.id;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState(user?.role ?? "viewer");
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

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
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

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
          Viewers can access dashboards and export data. Admins can manage accounts and users.
        </p>
      </div>

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
          {isLoading ? "Saving..." : isEdit ? "Update User" : "Create User"}
        </button>
      </div>
    </form>
  );
}
