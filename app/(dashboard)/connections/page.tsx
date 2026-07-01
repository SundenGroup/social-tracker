"use client";

import { useState } from "react";
import Link from "next/link";
import Header from "@/components/layouts/Header";
import { useAccounts } from "@/hooks/useAccounts";
import { useToast } from "@/components/common/Toast";
import Modal from "@/components/common/Modal";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { PlatformGlyph, PLATFORM_COLOR } from "@/components/icons/PlatformGlyph";
import type { SocialAccountResponse } from "@/types";

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  twitter: "X / Twitter",
  instagram: "Instagram",
  tiktok: "TikTok",
  vk: "VK",
};

/** How each platform's data actually arrives. API platforms sync from
 *  the server; scraper platforms are pushed by the remote scrape host. */
const SYNC_SOURCE: Record<string, string> = {
  youtube: "API",
  twitter: "API",
  vk: "API + scraper",
  instagram: "Remote scraper",
  tiktok: "Remote scraper",
};

export default function ConnectionsPage() {
  const { accounts, isLoading, error, deleteAccount } = useAccounts();
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<SocialAccountResponse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteAccount(deleteTarget.id);
      toast("success", "Connection removed");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  const freshness = (lastSyncedAt: string | null) => {
    if (!lastSyncedAt) return { label: "Never synced", color: "var(--bad)" };
    const hours = (Date.now() - new Date(lastSyncedAt).getTime()) / 3600000;
    const label =
      hours < 1.5 ? "Just now" :
      hours < 24 ? `${Math.round(hours)}h ago` :
      `${Math.round(hours / 24)}d ago`;
    return { label, color: hours < 30 ? "var(--good)" : hours < 72 ? "#E09B00" : "var(--bad)" };
  };

  return (
    <>
      <Header title="Connections" subtitle="Social accounts this workspace tracks">
        <Link
          href="/connections/new"
          style={{
            padding: "7px 14px",
            borderRadius: 8,
            background: "var(--accent)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Add connection
        </Link>
      </Header>

      <div className="page-pad" style={{ padding: "24px 28px 48px" }}>
        {isLoading && (
          <div style={{ display: "flex", minHeight: 300, alignItems: "center", justifyContent: "center" }}>
            <LoadingSpinner size="lg" />
          </div>
        )}

        {error && (
          <div
            style={{
              background: "color-mix(in srgb, var(--bad) 8%, transparent)",
              color: "var(--bad)",
              border: "1px solid color-mix(in srgb, var(--bad) 40%, transparent)",
              borderRadius: 10,
              padding: 14,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {!isLoading && !error && accounts.length === 0 && (
          <div
            style={{
              border: "1px dashed var(--border-strong)",
              borderRadius: 14,
              padding: 48,
              textAlign: "center",
              color: "var(--fg-muted)",
              fontSize: 13,
            }}
          >
            No connections yet. Add your first social account to get started.
          </div>
        )}

        {!isLoading && !error && accounts.length > 0 && (
          <div className="hscroll" style={{ background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ minWidth: 760 }}>
              {/* Header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "170px minmax(160px, 1fr) 140px 130px 120px 110px 110px",
                  gap: 12,
                  padding: "10px 16px",
                  background: "var(--bg-sunken)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: "var(--fg-subtle)",
                }}
              >
                <div>Platform</div>
                <div>Account</div>
                <div>Profile</div>
                <div>Data source</div>
                <div>Last synced</div>
                <div>Status</div>
                <div style={{ textAlign: "right" }}>Actions</div>
              </div>

              {accounts.map((account) => {
                const fresh = freshness(account.lastSyncedAt);
                return (
                  <div
                    key={account.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "170px minmax(160px, 1fr) 140px 130px 120px 110px 110px",
                      gap: 12,
                      padding: "12px 16px",
                      alignItems: "center",
                      borderTop: "1px solid var(--border)",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--fg)" }}>
                      <span style={{ color: PLATFORM_COLOR[account.platform] ?? "var(--fg-muted)" }}>
                        <PlatformGlyph platform={account.platform} size={15} />
                      </span>
                      {PLATFORM_LABELS[account.platform] ?? account.platform}
                    </div>
                    <div style={{ color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {account.accountName}
                      <div style={{ fontSize: 10, color: "var(--fg-subtle)" }}>@{account.accountId}</div>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>{account.profileName ?? "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                      {SYNC_SOURCE[account.platform] ?? "—"}
                    </div>
                    <div style={{ fontSize: 12, color: fresh.color }}>{fresh.label}</div>
                    <div>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 700,
                          background:
                            account.syncStatus === "success"
                              ? "color-mix(in srgb, var(--good) 14%, transparent)"
                              : account.syncStatus === "failed"
                                ? "color-mix(in srgb, var(--bad) 12%, transparent)"
                                : "color-mix(in srgb, #E09B00 16%, transparent)",
                          color:
                            account.syncStatus === "success"
                              ? "var(--good)"
                              : account.syncStatus === "failed"
                                ? "var(--bad)"
                                : "#E09B00",
                        }}
                      >
                        {account.syncStatus}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                      <Link
                        href={`/connections/${account.id}`}
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-muted)", textDecoration: "none" }}
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => setDeleteTarget(account)}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--bad)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remove connection"
        actions={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm font-medium text-[var(--fg-muted)] hover:bg-[var(--bg-sunken)]"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isDeleting ? "Removing..." : "Remove"}
            </button>
          </>
        }
      >
        <p>
          Are you sure you want to remove{" "}
          <strong>{deleteTarget?.accountName}</strong>? This will also delete all
          associated posts and metrics. This action cannot be undone.
        </p>
      </Modal>
    </>
  );
}
