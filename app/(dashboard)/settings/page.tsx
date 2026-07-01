"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/layouts/Header";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { PlatformGlyph, PLATFORM_COLOR } from "@/components/icons/PlatformGlyph";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/common/Toast";

interface SyncLogEntry {
  id: string;
  socialAccountId: string;
  syncType: string;
  status: string;
  errorMessage: string | null;
  postsSynced: number;
  metricsSynced: number;
  startedAt: string;
  completedAt: string | null;
  accountName?: string;
  platform?: string;
}

interface AccountStatus {
  id: string;
  platform: string;
  accountName: string;
  syncStatus: string;
  lastSyncedAt: string | null;
}

interface HealthData {
  status: string;
  database: boolean;
  lastSync: string | null;
  responseTime: number;
  version: string;
}

interface RefreshProgress {
  isRunning: boolean;
  startedAt: number | null;
  totalPosts: number;
  processedPosts: number;
  metricsUpdated: number;
  currentAccount: string;
  currentPlatform: string;
  errorCount: number;
  errors: string[];
  completedAt: number | null;
  accountsTotal: number;
  accountsProcessed: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
}

/** Platforms whose server-side sync actually works (API-based). TikTok
 *  and Instagram are synced by the remote scrape host — triggering a
 *  server sync for them only produces a failed log, so the UI doesn't
 *  offer it. */
const API_SYNC_PLATFORMS = new Set(["youtube", "twitter", "vk"]);

/* ——— shared style fragments (design tokens; dark-mode safe) ——— */
const card: React.CSSProperties = {
  background: "var(--bg-elev)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 20,
  marginBottom: 18,
};
const cardTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--fg)", marginBottom: 4 };
const cardHint: React.CSSProperties = { fontSize: 11, color: "var(--fg-subtle)", marginBottom: 14 };
const statCell: React.CSSProperties = {
  background: "var(--bg-sunken)",
  borderRadius: 10,
  padding: 12,
  textAlign: "center" as const,
};
const primaryBtn: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 8,
  background: "var(--accent)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
};

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [hideSponsored, setHideSponsored] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgNameInput, setOrgNameInput] = useState("");
  const [savingOrgName, setSavingOrgName] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<RefreshProgress | null>(null);
  const [elapsedDisplay, setElapsedDisplay] = useState(0);
  const refreshPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const apiAccounts = accounts.filter((a) => API_SYNC_PLATFORMS.has(a.platform));
  const scraperAccounts = accounts.filter((a) => !API_SYNC_PLATFORMS.has(a.platform));

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [accountsRes, logsRes, healthRes, settingsRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/sync-logs?limit=50"),
        fetch("/api/health"),
        fetch("/api/settings"),
      ]);

      if (accountsRes.ok) {
        const json = await accountsRes.json();
        setAccounts(json.data ?? []);
      }
      if (logsRes.ok) {
        const json = await logsRes.json();
        setSyncLogs(json.data ?? []);
      }
      if (healthRes.ok) setHealth(await healthRes.json());
      if (settingsRes.ok) {
        const json = await settingsRes.json();
        setHideSponsored(json.data?.hideSponsored ?? false);
        const name = json.data?.organizationName ?? "";
        setOrgName(name);
        setOrgNameInput(name);
      }
    } catch {
      // Silently handle errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSyncOne = async (accountId: string) => {
    setSyncingId(accountId);
    try {
      await fetch(`/api/accounts/${accountId}/sync`, { method: "POST" });
      setTimeout(fetchData, 2000);
    } catch {
      // Handle silently
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      // Only API-capable platforms — TikTok/Instagram sync via the
      // remote scrape host, a server-side trigger can't reach them.
      for (const account of apiAccounts) {
        await fetch(`/api/accounts/${account.id}/sync`, { method: "POST" });
      }
      setTimeout(fetchData, 3000);
    } catch {
      // Handle silently
    } finally {
      setSyncingAll(false);
    }
  };

  const handleToggleSponsored = async () => {
    const newValue = !hideSponsored;
    setHideSponsored(newValue);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hideSponsored: newValue }),
      });
    } catch {
      setHideSponsored(!newValue);
    }
  };

  const handleSaveOrgName = async () => {
    const trimmed = orgNameInput.trim();
    if (trimmed === orgName) return;
    if (trimmed.length < 2) {
      toast("error", "Organization name must be at least 2 characters");
      return;
    }
    setSavingOrgName(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationName: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast("error", json.error ?? "Failed to update organization name");
        return;
      }
      setOrgName(json.data.organizationName);
      setOrgNameInput(json.data.organizationName);
      toast("success", "Organization name updated");
    } catch {
      toast("error", "Failed to update organization name");
    } finally {
      setSavingOrgName(false);
    }
  };

  const pollRefreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/full-refresh");
      if (res.ok) {
        const json = await res.json();
        setRefreshProgress(json.data);
        if (!json.data.isRunning && refreshPollRef.current) {
          clearInterval(refreshPollRef.current);
          refreshPollRef.current = null;
        }
        if (!json.data.isRunning && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    } catch {
      // Silently handle
    }
  }, []);

  const startPolling = useCallback((startedAt?: number) => {
    if (refreshPollRef.current) clearInterval(refreshPollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    pollRefreshStatus();
    refreshPollRef.current = setInterval(pollRefreshStatus, 2000);
    const baseTime = startedAt ?? Date.now();
    setElapsedDisplay(Date.now() - baseTime);
    timerRef.current = setInterval(() => {
      setElapsedDisplay(Date.now() - baseTime);
    }, 1000);
  }, [pollRefreshStatus]);

  const handleStartRefresh = async () => {
    try {
      const res = await fetch("/api/admin/full-refresh", { method: "POST" });
      if (!res.ok) {
        const json = await res.json();
        toast("error", json.error || "Failed to start refresh");
        return;
      }
      startPolling();
    } catch {
      toast("error", "Failed to start refresh");
    }
  };

  useEffect(() => {
    pollRefreshStatus().then(() => {
      setRefreshProgress((prev) => {
        if (prev?.isRunning) startPolling(prev.startedAt ?? undefined);
        return prev;
      });
    });
    return () => {
      if (refreshPollRef.current) clearInterval(refreshPollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pollRefreshStatus, startPolling]);

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const statusPill = (status: string): React.CSSProperties => ({
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    background:
      status === "success"
        ? "color-mix(in srgb, var(--good) 14%, transparent)"
        : status === "failed"
          ? "color-mix(in srgb, var(--bad) 12%, transparent)"
          : "color-mix(in srgb, #E09B00 16%, transparent)",
    color: status === "success" ? "var(--good)" : status === "failed" ? "var(--bad)" : "#E09B00",
  });

  const syncFreshnessColor = (lastSyncedAt: string | null) => {
    if (!lastSyncedAt) return "var(--bad)";
    const hours = (Date.now() - new Date(lastSyncedAt).getTime()) / 3600000;
    if (hours < 30) return "var(--good)";
    if (hours < 72) return "#E09B00";
    return "var(--bad)";
  };

  if (isLoading) {
    return (
      <>
        <Header title="Settings & monitoring" />
        <div style={{ display: "flex", minHeight: 400, alignItems: "center", justifyContent: "center" }}>
          <LoadingSpinner size="lg" />
        </div>
      </>
    );
  }

  // Alerts, per platform type:
  //  - API platforms: 3+ consecutive failed server syncs = something is
  //    genuinely broken (token, quota, API change).
  //  - Remote-scraper platforms: server sync logs are meaningless — the
  //    signal that matters is staleness (the scrape host hasn't pushed
  //    for over 36h).
  const alerts: Array<{ id: string; message: string }> = [];
  for (const a of accounts) {
    if (API_SYNC_PLATFORMS.has(a.platform)) {
      const accountLogs = syncLogs.filter((l) => l.socialAccountId === a.id).slice(0, 3);
      if (accountLogs.length >= 3 && accountLogs.every((l) => l.status === "failed")) {
        alerts.push({
          id: a.id,
          message: `${a.platform === "twitter" ? "X" : a.platform}/${a.accountName} has failed 3+ server syncs in a row — check API credentials.`,
        });
      }
    } else {
      const ageH = a.lastSyncedAt
        ? (Date.now() - new Date(a.lastSyncedAt).getTime()) / 3600000
        : Infinity;
      if (ageH > 36) {
        alerts.push({
          id: a.id,
          message: `${a.platform}/${a.accountName} hasn't received data from the remote scraper in ${
            Number.isFinite(ageH) ? `${Math.round(ageH)}h` : "ever"
          } — check the scrape host.`,
        });
      }
    }
  }

  return (
    <>
      <Header title="Settings & monitoring">
        <button onClick={handleSyncAll} disabled={syncingAll} style={{ ...primaryBtn, opacity: syncingAll ? 0.6 : 1 }}>
          {syncingAll ? "Syncing…" : "Sync API platforms"}
        </button>
      </Header>

      <div className="page-pad" style={{ padding: "24px 28px 48px" }}>
        {/* Organization */}
        <div style={card}>
          <div style={cardTitle}>Organization</div>
          <div style={cardHint}>Shown in invitation emails and the workspace header.</div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", maxWidth: 480 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 6 }}>
                Organization name
              </label>
              <input
                type="text"
                value={orgNameInput}
                onChange={(e) => setOrgNameInput(e.target.value)}
                disabled={!isAdmin || savingOrgName}
                maxLength={80}
                placeholder="e.g. Clutch"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border-strong)",
                  background: "var(--bg)",
                  color: "var(--fg)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>
            {isAdmin && (
              <button
                onClick={handleSaveOrgName}
                disabled={savingOrgName || orgNameInput.trim() === orgName || orgNameInput.trim().length < 2}
                style={{
                  ...primaryBtn,
                  opacity:
                    savingOrgName || orgNameInput.trim() === orgName || orgNameInput.trim().length < 2 ? 0.4 : 1,
                }}
              >
                {savingOrgName ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>

        {/* Display preferences */}
        <div style={card}>
          <div style={cardTitle}>Display preferences</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)" }}>
                Hide sponsored posts from stats &amp; charts
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 2 }}>
                Flagged posts stay reachable via the Sponsored filter on Post performance, but won&apos;t affect KPIs,
                charts, or comparisons.
              </div>
            </div>
            <button
              onClick={handleToggleSponsored}
              aria-pressed={hideSponsored}
              style={{
                position: "relative",
                width: 38,
                height: 22,
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                background: hideSponsored ? "var(--accent)" : "var(--border-strong)",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: hideSponsored ? 19 : 3,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left .15s ease",
                }}
              />
            </button>
          </div>
        </div>

        {/* Full metric refresh */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={cardTitle}>Full metric refresh</div>
              <div style={{ ...cardHint, marginBottom: 0, maxWidth: 560 }}>
                Re-pulls metrics for every post on the API platforms — YouTube, X and VK. TikTok and Instagram are
                refreshed daily by the remote scrape host and aren&apos;t part of this job.
              </div>
            </div>
            <button
              onClick={handleStartRefresh}
              disabled={refreshProgress?.isRunning}
              style={{ ...primaryBtn, background: "var(--fg)", color: "var(--bg-elev)", opacity: refreshProgress?.isRunning ? 0.5 : 1, whiteSpace: "nowrap" }}
            >
              {refreshProgress?.isRunning ? "Refreshing…" : "Refresh metrics"}
            </button>
          </div>

          {refreshProgress?.isRunning && (
            <div style={{ marginTop: 14 }}>
              <div style={{ height: 6, borderRadius: 4, background: "var(--bg-sunken)", overflow: "hidden", marginBottom: 12 }}>
                <div
                  style={{
                    height: "100%",
                    borderRadius: 4,
                    background: "var(--accent)",
                    transition: "width .5s ease",
                    width: `${refreshProgress.totalPosts > 0 ? (refreshProgress.processedPosts / refreshProgress.totalPosts) * 100 : 0}%`,
                  }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                <div style={statCell}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)" }}>{formatDuration(elapsedDisplay)}</div>
                  <div style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Elapsed</div>
                </div>
                <div style={statCell}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)" }}>
                    {refreshProgress.estimatedRemainingMs > 0 ? formatDuration(refreshProgress.estimatedRemainingMs) : "…"}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Remaining</div>
                </div>
                <div style={statCell}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)" }}>
                    {refreshProgress.processedPosts} / {refreshProgress.totalPosts}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Posts</div>
                </div>
                <div style={statCell}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)" }}>
                    {refreshProgress.metricsUpdated.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Metrics updated</div>
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: "var(--fg-muted)" }}>
                Processing <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{refreshProgress.currentPlatform}</span> / {refreshProgress.currentAccount}
                {" "}(account {refreshProgress.accountsProcessed + 1} of {refreshProgress.accountsTotal})
              </div>
              {refreshProgress.errorCount > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--bad)" }}>
                  {refreshProgress.errorCount} error{refreshProgress.errorCount !== 1 ? "s" : ""} — latest: {refreshProgress.errors[refreshProgress.errors.length - 1]}
                </div>
              )}
            </div>
          )}

          {refreshProgress && !refreshProgress.isRunning && refreshProgress.completedAt && (
            <div style={{ marginTop: 12, fontSize: 11, color: "var(--good)" }}>
              Last refresh completed in {formatDuration(refreshProgress.elapsedMs)} — {refreshProgress.processedPosts} posts,{" "}
              {refreshProgress.metricsUpdated.toLocaleString()} metrics updated
              {refreshProgress.errorCount > 0 && (
                <span style={{ color: "var(--bad)" }}> ({refreshProgress.errorCount} errors)</span>
              )}
            </div>
          )}
        </div>

        {/* Failure alerts */}
        {alerts.length > 0 && (
          <div
            style={{
              ...card,
              background: "color-mix(in srgb, var(--bad) 6%, var(--bg-elev))",
              border: "1px solid color-mix(in srgb, var(--bad) 35%, transparent)",
            }}
          >
            <div style={{ ...cardTitle, color: "var(--bad)" }}>Sync alerts</div>
            {alerts.map((a) => (
              <div key={a.id} style={{ fontSize: 12, color: "var(--bad)" }}>
                {a.message}
              </div>
            ))}
          </div>
        )}

        {/* Account sync status */}
        <div style={card}>
          <div style={cardTitle}>Account sync status</div>
          <div style={cardHint}>
            YouTube, X and VK sync from the server. TikTok and Instagram are pushed daily by the remote scrape host.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
            {[...apiAccounts, ...scraperAccounts].map((account) => {
              const isApi = API_SYNC_PLATFORMS.has(account.platform);
              return (
                <div key={account.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: PLATFORM_COLOR[account.platform] ?? "var(--fg-muted)" }}>
                      <PlatformGlyph platform={account.platform} size={13} />
                      <span style={{ textTransform: "capitalize", color: "var(--fg-muted)" }}>
                        {account.platform === "twitter" ? "X" : account.platform}
                      </span>
                    </span>
                    <span style={statusPill(account.syncStatus)}>{account.syncStatus}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 2 }}>{account.accountName}</div>
                  <div style={{ fontSize: 10, color: syncFreshnessColor(account.lastSyncedAt), marginBottom: 10 }}>
                    {account.lastSyncedAt ? `Last synced ${new Date(account.lastSyncedAt).toLocaleString()}` : "Never synced"}
                  </div>
                  {isApi ? (
                    <button
                      onClick={() => handleSyncOne(account.id)}
                      disabled={syncingId === account.id}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid var(--border-strong)",
                        background: "transparent",
                        color: "var(--fg-muted)",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        opacity: syncingId === account.id ? 0.6 : 1,
                      }}
                    >
                      {syncingId === account.id ? "Syncing…" : "Sync now"}
                    </button>
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        borderRadius: 8,
                        background: "var(--bg-sunken)",
                        color: "var(--fg-subtle)",
                        fontSize: 10.5,
                        fontWeight: 600,
                        textAlign: "center",
                      }}
                      title="This platform is scraped from the dedicated residential-IP machine; the server can't trigger it."
                    >
                      Daily via remote scraper
                    </div>
                  )}
                </div>
              );
            })}
            {accounts.length === 0 && (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 16, fontSize: 12, color: "var(--fg-subtle)" }}>
                No accounts configured
              </div>
            )}
          </div>
        </div>

        {/* System health */}
        {health && (
          <div style={card}>
            <div style={cardTitle}>System health</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 10 }}>
              <div style={statCell}>
                <div style={{ fontSize: 16, fontWeight: 700, color: health.status === "ok" ? "var(--good)" : "var(--bad)" }}>
                  {health.status.toUpperCase()}
                </div>
                <div style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Status</div>
              </div>
              <div style={statCell}>
                <div style={{ fontSize: 16, fontWeight: 700, color: health.database ? "var(--good)" : "var(--bad)" }}>
                  {health.database ? "Connected" : "Error"}
                </div>
                <div style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Database</div>
              </div>
              <div style={statCell}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)" }}>
                  {health.lastSync ? new Date(health.lastSync).toLocaleDateString() : "Never"}
                </div>
                <div style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Last sync</div>
              </div>
              <div style={statCell}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)" }}>v{health.version}</div>
                <div style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Version</div>
              </div>
            </div>
          </div>
        )}

        {/* Sync logs */}
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={cardTitle}>Recent sync logs</div>
          <div className="hscroll" style={{ marginTop: 10 }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--fg-subtle)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  <th style={{ padding: "0 12px 8px 0", fontWeight: 700 }}>Account</th>
                  <th style={{ padding: "0 12px 8px 0", fontWeight: 700 }}>Type</th>
                  <th style={{ padding: "0 12px 8px 0", fontWeight: 700 }}>Status</th>
                  <th style={{ padding: "0 12px 8px 0", fontWeight: 700, textAlign: "right" }}>Posts</th>
                  <th style={{ padding: "0 12px 8px 0", fontWeight: 700 }}>Started</th>
                  <th style={{ paddingBottom: 8, fontWeight: 700 }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.map((log) => (
                  <tr key={log.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px 8px 0", fontWeight: 600, color: "var(--fg)" }}>
                      {log.accountName ?? log.socialAccountId.slice(0, 8)}
                    </td>
                    <td style={{ padding: "8px 12px 8px 0", color: "var(--fg-muted)" }}>{log.syncType.replace(/_/g, " ")}</td>
                    <td style={{ padding: "8px 12px 8px 0" }}>
                      <span style={statusPill(log.status)}>{log.status}</span>
                    </td>
                    <td style={{ padding: "8px 12px 8px 0", textAlign: "right", color: "var(--fg-muted)" }}>{log.postsSynced}</td>
                    <td style={{ padding: "8px 12px 8px 0", color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>
                      {new Date(log.startedAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "8px 0", color: "var(--bad)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.errorMessage ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {syncLogs.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--fg-subtle)" }}>No sync logs yet</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
