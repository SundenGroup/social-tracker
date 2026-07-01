"use client";

import { use } from "react";
import { useAccount } from "@/hooks/useAccounts";
import AccountForm from "@/components/forms/AccountForm";
import LoadingSpinner from "@/components/common/LoadingSpinner";

export default function EditAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { account, isLoading, error } = useAccount(id);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="rounded-lg bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] p-4 text-sm text-[var(--bad)]">
        {error || "Connection not found"}
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold text-[var(--fg)]">
        Edit connection
      </h1>
      <div className="mx-auto max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] p-6">
        <AccountForm account={account} />
      </div>
    </>
  );
}
