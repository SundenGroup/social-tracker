"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccounts } from "@/hooks/useAccounts";
import { useToast } from "@/components/common/Toast";
import Modal from "@/components/common/Modal";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import type { SocialAccountResponse } from "@/types";

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  twitter: "X / Twitter",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export default function AccountsPage() {
  const { accounts, isLoading, error, deleteAccount } = useAccounts();
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<SocialAccountResponse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteAccount(deleteTarget.id);
      toast("success", "Account deleted");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
        {error}
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-clutch-black">Accounts</h1>
        <Link
          href="/accounts/new"
          className="rounded-lg bg-clutch-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-clutch-red/90"
        >
          Add Account
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-sm text-clutch-grey/60">
            No accounts yet. Add your first social account to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-5 py-3 font-medium text-clutch-grey/60">Platform</th>
                <th className="px-5 py-3 font-medium text-clutch-grey/60">Account Name</th>
                <th className="px-5 py-3 font-medium text-clutch-grey/60">Profile</th>
                <th className="px-5 py-3 font-medium text-clutch-grey/60">Content Filter</th>
                <th className="px-5 py-3 font-medium text-clutch-grey/60">Last Synced</th>
                <th className="px-5 py-3 font-medium text-clutch-grey/60">Status</th>
                <th className="px-5 py-3 font-medium text-clutch-grey/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.map((account) => {
                const syncColor =
                  account.syncStatus === "success"
                    ? "text-green-600"
                    : account.syncStatus === "failed"
                      ? "text-red-600"
                      : "text-yellow-600";

                return (
                  <tr key={account.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-medium">
                      {PLATFORM_LABELS[account.platform] ?? account.platform}
                    </td>
                    <td className="px-5 py-3">{account.accountName}</td>
                    <td className="px-5 py-3 text-clutch-grey/60">
                      {(account as unknown as { profileName?: string }).profileName ?? "—"}
                    </td>
                    <td className="px-5 py-3 capitalize">
                      {account.contentFilter.replace("_", " ")}
                    </td>
                    <td className="px-5 py-3 text-clutch-grey/60">
                      {account.lastSyncedAt
                        ? new Date(account.lastSyncedAt).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold ${syncColor}`}>
                        {account.syncStatus}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-3">
                        <Link
                          href={`/accounts/${account.id}`}
                          className="text-xs font-medium text-clutch-blue hover:underline"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => setDeleteTarget(account)}
                          className="text-xs font-medium text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Account"
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
          Are you sure you want to delete{" "}
          <strong>{deleteTarget?.accountName}</strong>? This will also delete all
          associated posts and metrics. This action cannot be undone.
        </p>
      </Modal>
    </>
  );
}
