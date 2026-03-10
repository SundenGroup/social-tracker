import type { SocialAccountResponse } from "@/types";

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  youtube: { label: "YouTube", color: "bg-red-100 text-red-700" },
  twitter: { label: "X / Twitter", color: "bg-sky-100 text-sky-700" },
  instagram: { label: "Instagram", color: "bg-pink-100 text-pink-700" },
  tiktok: { label: "TikTok", color: "bg-gray-100 text-gray-700" },
};

interface AccountCardProps {
  account: SocialAccountResponse;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function AccountCard({ account, onEdit, onDelete }: AccountCardProps) {
  const platform = PLATFORM_CONFIG[account.platform] ?? {
    label: account.platform,
    color: "bg-gray-100 text-gray-700",
  };

  const syncColor =
    account.syncStatus === "success"
      ? "text-green-600"
      : account.syncStatus === "failed"
        ? "text-red-600"
        : "text-yellow-600";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${platform.color}`}
        >
          {platform.label}
        </span>
        <span className={`text-xs font-medium ${syncColor}`}>
          {account.syncStatus}
        </span>
      </div>
      <h3 className="mb-1 text-sm font-bold text-clutch-black">
        {account.accountName}
      </h3>
      <p className="mb-3 text-xs text-clutch-grey/60">@{account.accountId}</p>
      <div className="flex items-center justify-between text-xs text-clutch-grey/50">
        <span>
          {account.lastSyncedAt
            ? `Synced ${new Date(account.lastSyncedAt).toLocaleDateString()}`
            : "Never synced"}
        </span>
        <div className="flex gap-2">
          {onEdit && (
            <button
              onClick={onEdit}
              className="font-medium text-clutch-blue hover:underline"
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="font-medium text-red-500 hover:underline"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
