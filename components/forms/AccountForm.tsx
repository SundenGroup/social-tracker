"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { socialAccountSchema } from "@/lib/validators";
import { useToast } from "@/components/common/Toast";
import { useProfiles } from "@/hooks/useProfiles";
import type { SocialAccountResponse, TagRule } from "@/types";

interface AccountFormProps {
  account?: SocialAccountResponse;
}

const PLATFORMS = [
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "X / Twitter" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "vk", label: "VK" },
] as const;

export default function AccountForm({ account }: AccountFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { profiles } = useProfiles();
  const isEditing = !!account;

  const [profileId, setProfileId] = useState(account?.profileId ?? "");
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

  // Auto-tagging configuration. We keep the rule fields as raw text
  // strings in form state (not pre-split string[]) so the user can
  // freely type commas, spaces, and additional tokens without the
  // input "snapping back" on each keystroke. Splitting + canonicalising
  // happens at submit time.
  const [defaultTagsText, setDefaultTagsText] = useState<string>(
    (account?.defaultTags ?? []).join(", ")
  );
  interface RuleFormState {
    tag: string;
    hashtagsText: string;
    mentionsText: string;
    keywordsText: string;
    alwaysOn: boolean;
  }
  const [tagRules, setTagRules] = useState<RuleFormState[]>(
    (account?.tagRules ?? []).map((r) => ({
      // Prefer the user-typed displayTag for the editable field —
      // canonical lowercase `tag` is the storage form, displayTag is
      // what the user actually wrote. Falls back to `tag` for legacy
      // rules saved before displayTag existed.
      tag: r.displayTag ?? r.tag,
      hashtagsText: (r.hashtags ?? []).join(", "),
      mentionsText: (r.mentions ?? []).join(", "),
      keywordsText: (r.keywords ?? []).join(", "),
      alwaysOn: r.alwaysOn ?? false,
    }))
  );

  const updateRule = (idx: number, patch: Partial<RuleFormState>) => {
    setTagRules((rules) => rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addRule = () => {
    setTagRules((rules) => [
      ...rules,
      { tag: "", hashtagsText: "", mentionsText: "", keywordsText: "", alwaysOn: false },
    ]);
  };
  const removeRule = (idx: number) => {
    setTagRules((rules) => rules.filter((_, i) => i !== idx));
  };

  // Helper: split a comma- or whitespace-separated string into a
  // canonicalised string[]. Used at submit time only.
  const splitTokens = (s: string): string[] =>
    s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

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

    // Build the tag config payload only when editing — creation flow
    // doesn't surface the rule editor (no point setting rules before
    // any posts exist). Raw text fields are split + canonicalised here
    // at submit time (not on every keystroke).
    const cleanDefaultTags = splitTokens(defaultTagsText).map((t) => t.toLowerCase());
    const cleanTagRules: TagRule[] = tagRules
      .map((r) => {
        const trimmed = r.tag.trim();
        const canonical = trimmed.toLowerCase();
        return {
          tag: canonical,
          // Preserve the user's original casing so the chip can show
          // "PEC" instead of "pec". Only send it when it actually
          // differs from the canonical form — otherwise it's noise.
          ...(trimmed && trimmed !== canonical ? { displayTag: trimmed } : {}),
          hashtags: splitTokens(r.hashtagsText).map((h) => h.replace(/^#+/, "").toLowerCase()),
          mentions: splitTokens(r.mentionsText).map((m) => m.replace(/^@+/, "").toLowerCase()),
          keywords: splitTokens(r.keywordsText).map((k) => k.toLowerCase()),
          alwaysOn: r.alwaysOn,
        };
      })
      .filter((r) => r.tag.length > 0);

    const payload = {
      platform,
      accountId,
      accountName,
      contentFilter,
      ...(profileId && { profileId }),
      ...(apiKey && { apiKey }),
      ...(authToken && { authToken }),
      ...(isEditing && { defaultTags: cleanDefaultTags }),
      ...(isEditing && { tagRules: cleanTagRules }),
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
      router.push("/connections");
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
        <div className="rounded-lg bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] p-3 text-sm text-[var(--bad)]">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--fg)]">
          Platform
        </label>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        >
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--fg)]">
          Account ID / Handle
        </label>
        <input
          type="text"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          required
          className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          placeholder="e.g. UC_x5XG1OV2P6uZZ5FSM9Ttw"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--fg)]">
          Account Name
        </label>
        <input
          type="text"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          required
          className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          placeholder="e.g. PUBG Esports"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--fg)]">
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
              className="accent-[var(--accent)]"
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
              className="accent-[var(--accent)]"
            />
            Video Only
          </label>
        </div>
      </div>

      {profiles.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--fg)]">
            Profile
          </label>
          <select
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          >
            <option value="">No Profile</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.isDefault ? " (Default)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Auto-tagging — only on edit. Creating a fresh account has no
          posts yet, so configuring rules upfront would be useless;
          surface it after creation when there's content to tag. */}
      {isEditing && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] p-4">
          <h3 className="mb-1 text-sm font-bold text-[var(--fg)]">Auto-tagging</h3>
          <p className="mb-4 text-xs text-[var(--fg-muted)]">
            Tag posts automatically by hashtag, mention or keyword. Saving
            triggers a one-pass over every existing post on this account so
            historical data picks up new rules immediately.
          </p>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-[var(--fg)]">
              Default tags <span className="text-[var(--fg-subtle)] font-normal">(applied to every post from this account)</span>
            </label>
            <input
              type="text"
              value={defaultTagsText}
              onChange={(e) => setDefaultTagsText(e.target.value)}
              placeholder="e.g. esports"
              className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <p className="mt-1 text-[10px] text-[var(--fg-subtle)]">
              Comma- or space-separated. Use this for accounts that are 100%
              one category (e.g. dedicated esports accounts get just &quot;esports&quot;).
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-xs font-medium text-[var(--fg)]">
                Auto-tag rules
              </label>
              <button
                type="button"
                onClick={addRule}
                className="text-xs font-medium text-[var(--accent)] hover:underline"
              >
                + Add rule
              </button>
            </div>
            {tagRules.length === 0 && (
              <p className="text-xs text-[var(--fg-subtle)]">
                No rules. Click <em>+ Add rule</em> to tag posts that match a hashtag, mention, or keyword.
              </p>
            )}
            <div className="space-y-3">
              {tagRules.map((rule, idx) => (
                <div key={idx} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={rule.tag}
                      onChange={(e) => updateRule(idx, { tag: e.target.value })}
                      placeholder="Tag name (e.g. esports)"
                      className="flex-1 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                    <button
                      type="button"
                      onClick={() => removeRule(idx)}
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--bg-sunken)]"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <input
                      type="text"
                      value={rule.hashtagsText}
                      onChange={(e) => updateRule(idx, { hashtagsText: e.target.value })}
                      placeholder="hashtags (e.g. esports, pubgesports)"
                      className="rounded-lg border border-[var(--border-strong)] px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                    <input
                      type="text"
                      value={rule.mentionsText}
                      onChange={(e) => updateRule(idx, { mentionsText: e.target.value })}
                      placeholder="mentions (e.g. pubgesports)"
                      className="rounded-lg border border-[var(--border-strong)] px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                    <input
                      type="text"
                      value={rule.keywordsText}
                      onChange={(e) => updateRule(idx, { keywordsText: e.target.value })}
                      placeholder="keywords (e.g. tournament, finals)"
                      className="rounded-lg border border-[var(--border-strong)] px-3 py-2 text-xs focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--fg-subtle)]">
                    Match any of: hashtag, mention, or keyword (case-insensitive). At least one is required.
                  </p>
                  <label className="mt-2 flex items-center gap-2 text-xs text-[var(--fg)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule.alwaysOn}
                      onChange={(e) => updateRule(idx, { alwaysOn: e.target.checked })}
                      className="accent-clutch-red"
                    />
                    <span>
                      <span className="font-medium">Always on</span>
                      <span className="text-[var(--fg-muted)]"> — preselect this tag as the default filter on the dashboard. Users can still toggle it off.</span>
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {needsApiKey && (
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--fg)]">
            API key <span className="text-[var(--fg-subtle)] font-normal">(optional)</span>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            placeholder={
              isEditing
                ? "Leave blank to keep the current key"
                : "Leave blank to use the server-wide default"
            }
          />
          <p className="mt-1 text-xs text-[var(--fg-subtle)]">
            The server already has a YouTube Data API v3 key configured. Only paste
            one here if you want this account to use its own dedicated key (e.g. to
            isolate quota).
          </p>
        </div>
      )}

      {needsCookies && (
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--fg)]">
            Session Cookies
          </label>
          <textarea
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 font-mono text-xs focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
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
          className="rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm font-medium text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-sunken)] disabled:opacity-50"
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
