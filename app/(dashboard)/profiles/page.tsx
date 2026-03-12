"use client";

import { useState } from "react";
import Link from "next/link";
import { useProfiles } from "@/hooks/useProfiles";
import { useToast } from "@/components/common/Toast";
import Modal from "@/components/common/Modal";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import type { ProfileResponse } from "@/types";

export default function ProfilesPage() {
  const { profiles, isLoading, refetch } = useProfiles();
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<ProfileResponse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<ProfileResponse | null>(null);
  const [editName, setEditName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/profiles/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error || "Failed to delete profile");
        return;
      }
      toast("success", "Profile deleted");
      refetch();
    } catch {
      toast("error", "Failed to delete profile");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/profiles/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error || "Failed to update profile");
        return;
      }
      toast("success", "Profile updated");
      refetch();
      setEditTarget(null);
    } catch {
      toast("error", "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-clutch-black">Profiles</h1>
        <Link
          href="/profiles/new"
          className="rounded-lg bg-clutch-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-clutch-red/90"
        >
          Add Profile
        </Link>
      </div>

      {profiles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-sm text-clutch-grey/60">
            No profiles yet. Create one to group your social accounts.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-5 py-3 font-medium text-clutch-grey/60">Name</th>
                <th className="px-5 py-3 font-medium text-clutch-grey/60">Accounts</th>
                <th className="px-5 py-3 font-medium text-clutch-grey/60">Type</th>
                <th className="px-5 py-3 font-medium text-clutch-grey/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {profiles.map((profile) => (
                <tr key={profile.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium">{profile.name}</td>
                  <td className="px-5 py-3">{profile.accountCount ?? 0}</td>
                  <td className="px-5 py-3">
                    {profile.isDefault && (
                      <span className="rounded-full bg-clutch-blue/10 px-2 py-0.5 text-xs font-semibold text-clutch-blue">
                        Default
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setEditTarget(profile);
                          setEditName(profile.name);
                        }}
                        className="text-xs font-medium text-clutch-blue hover:underline"
                      >
                        Rename
                      </button>
                      {!profile.isDefault && (
                        <button
                          onClick={() => setDeleteTarget(profile)}
                          className="text-xs font-medium text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Profile"
        actions={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-clutch-grey hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </>
        }
      >
        <p>
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
          Its accounts will be moved to the default profile.
        </p>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Rename Profile"
        actions={
          <>
            <button
              onClick={() => setEditTarget(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-clutch-grey hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => handleEdit(new Event("click") as unknown as React.FormEvent)}
              disabled={isSaving || !editName.trim()}
              className="rounded-lg bg-clutch-red px-4 py-2 text-sm font-semibold text-white hover:bg-clutch-red/90 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </>
        }
      >
        <form onSubmit={handleEdit}>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-clutch-blue focus:outline-none focus:ring-1 focus:ring-clutch-blue"
            placeholder="Profile name"
            autoFocus
          />
        </form>
      </Modal>
    </>
  );
}
