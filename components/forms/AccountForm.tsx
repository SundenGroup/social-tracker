"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { socialAccountSchema } from "@/lib/validators";
import { useToast } from "@/components/common/Toast";
import type { SocialAccountResponse } from "@/types";

interface AccountFormProps {
  account?: SocialAccountResponse;
}

const PLATFORMS = [
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "X / Twitter" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
] as const;

export default function AccountForm({ account }: AccountFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const isEditing = !!account;

  const [platform, setPlatform] = useState<string>(account?.platform ?? "youtube");
  const [accountId, setAccountId] = useState(account?.accountId ?? "");
  const [accountName, setAccountName] = useState(account?.accountName ?? "");
  const [contentFilter, setContentFilter] = useState(
    account?.contentFilter ?? "all"
  );
  const [apiKey, setApiKey] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  async function handleTestConnection() {
    setIsTesting(true);
    try {
      const res = await fetch("/api/accounts/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, apiKey, authToken }),
      });
      const data = await res.json();
      if (data.data?.success) {
        toast("success", data.data.message);
      } else {
        toast("error", data.data?.message || "Connection test failed");
      }
    } catch {
      toast("error", "Failed to test connection");
    } finally {
      setIsTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const payload = {
      platform,
      accountId,
      accountName,
      contentFilter,
      ...(apiKey && { apiKey }),
      ...(authToken && { authToken }),
    };

    const result = socialAccountSchema.safeParse(payload);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }

    setIsLoading(true);
    try {
      const url = isEditing ? `/api/accounts/${account.id}` : "/api/accounts";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save account");
        return;
      }

      toast("success", isEditing ? "Account updated" : "Account created");
      router.push("/accounts");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const needsApiKey = platform === "youtube";
  const needsCookies = platform === "instagram" || platform === "tiktok" || platform === "twitter";

  const cookieHelperTexts: Record<string, string> = {
    instagram:
      "Open Instagram in your browser while logged in. Open DevTools (F12) > Application > Cookies > instagram.com. Copy all cookie values as: name=value; name2=value2",
    tiktok:
      "Open TikTok in your browser while logged in. Open DevTools (F12) > Application > Cookies > tiktok.com. Copy all cookie values as: name=value; name2=value2",
    twitter:
      "Open X/Twitter in your browser while logged in. Open DevTools (F12) > Application > Cookies > x.com. Copy all cookie values as: name=value; name2=value2",
  };
  const cookieHelperText = cookieHelperTexts[platform] ?? "";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-clutch-black">
          Platform
        </label>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-clutch-blue focus:outline-none focus:ring-1 focus:ring-clutch-blue"
        >
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-clutch-black">
          Account ID / Handle
        </label>
        <input
          type="text"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-clutch-blue focus:outline-none focus:ring-1 focus:ring-clutch-blue"
          placeholder="e.g. UC_x5XG1OV2P6uZZ5FSM9Ttw"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-clutch-black">
          Account Name
        </label>
        <input
          type="text"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-clutch-blue focus:outline-none focus:ring-1 focus:ring-clutch-blue"
          placeholder="e.g. PUBG Esports"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-clutch-black">
          Content Filter
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="contentFilter"
              value="all"
              checked={contentFilter === "all"}
              onChange={() => setContentFilter("all")}
              className="accent-clutch-blue"
            />
            All Content
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="contentFilter"
              value="video_only"
              checked={contentFilter === "video_only"}
              onChange={() => setContentFilter("video_only")}
              className="accent-clutch-blue"
            />
            Video Only
          </label>
        </div>
      </div>

      {needsApiKey && (
        <div>
          <label className="mb-1 block text-sm font-medium text-clutch-black">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-clutch-blue focus:outline-none focus:ring-1 focus:ring-clutch-blue"
            placeholder={isEditing ? "Leave blank to keep current" : "Enter API key"}
          />
        </div>
      )}

      {needsCookies && (
        <div>
          <label className="mb-1 block text-sm font-medium text-clutch-black">
            Session Cookies
          </label>
          <textarea
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-clutch-blue focus:outline-none focus:ring-1 focus:ring-clutch-blue"
            placeholder={
              isEditing
                ? "Leave blank to keep current cookies"
                : "sessionid=abc123; csrftoken=xyz789; ds_user_id=12345..."
            }
          />
          <p className="mt-1 text-xs text-gray-500">
            {cookieHelperText}
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={isTesting}
          className="rounded-lg border border-clutch-blue px-4 py-2 text-sm font-medium text-clutch-blue transition-colors hover:bg-clutch-blue/5 disabled:opacity-50"
        >
          {isTesting ? "Testing..." : "Test Connection"}
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 rounded-lg bg-clutch-red px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-clutch-red/90 disabled:opacity-50"
        >
          {isLoading
            ? "Saving..."
            : isEditing
              ? "Update Account"
              : "Create Account"}
        </button>
      </div>
    </form>
  );
}
