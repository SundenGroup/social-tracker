"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/layouts/Header";
import LoadingSpinner from "@/components/common/LoadingSpinner";

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

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [hideSponsored, setHideSponsored] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<RefreshProgress | null>(null);
  const [elapsedDisplay, setElapsedDisplay] = useState(0);
  const refreshPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (healthRes.ok) {
        setHealth(await healthRes.json());
      }
      if (settingsRes.ok) {
        const json = await settingsRes.json();
        setHideSponsored(json.data?.hideSponsored ?? false);
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
      // Wait a moment then refresh
      setTimeout(fetchData, 2000);
    } catch {
      // Handle silently
    } finally {
      setSyncingId(null);
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
      setHideSponsored(!newValue); // revert on error
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      for (const account of accounts) {
        await fetch(`/api/accounts/${account.id}/sync`, { method: "POST" });
      }
      setTimeout(fetchData, 3000);
    } catch {
      // Handle silently
    } finally {
      setSyncingAll(false);
    }
  };

  const pollRefreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/full-refresh");
      if (res.ok) {
        const json = await res.json();
        setRefreshProgress(json.data);

        // Stop polling when done
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

  const handleStartRefresh = async () => {
    try {
      const res = await fetch("/api/admin/full-refresh", { method: "POST" });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || "Failed to start refresh");
        return;
      }

      // Start polling every 2 seconds
      pollRefreshStatus();
      refreshPollRef.current = setInterval(pollRefreshStatus, 2000);

      // Start local elapsed timer (updates every second for smooth display)
      setElapsedDisplay(0);
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedDisplay(Date.now() - startTime);
      }, 1000);
    } catch {
      alert("Failed to start refresh");
    }
  };

  // Check for in-progress refresh on mount
  useEffect(() => {
    pollRefreshStatus().then(() => {
      // If a refresh is running, start polling
      setRefreshProgress((prev) => {
        if (prev?.isRunning) {
          refreshPollRef.current = setInterval(pollRefreshStatus, 2000);
          if (prev.startedAt) {
            setElapsedDisplay(Date.now() - prev.startedAt);
            timerRef.current = setInterval(() => {
              setElapsedDisplay(Date.now() - prev.startedAt!);
            }, 1000);
          }
        }
        return prev;
      });
    });
    return () => {
      if (refreshPollRef.current) clearInterval(refreshPollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pollRefreshStatus]);

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const syncStatusColor = (status: string) => {
    switch (status) {
      case "success": return "bg-green-50 text-green-600";
      case "failed": return "bg-red-50 text-red-600";
      case "syncing": return "bg-yellow-50 text-yellow-600";
      default: return "bg-gray-50 text-gray-500";
    }
  };

  const syncFreshness = (lastSyncedAt: string | null) => {
    if (!lastSyncedAt) return "text-red-600";
    const hours = (Date.now() - new Date(lastSyncedAt).getTime()) / 3600000;
    if (hours < 24) return "text-green-600";
    if (hours < 72) return "text-yellow-600";
    return "text-red-600";
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Find accounts with 3+ consecutive failures
  const failedAccounts = accounts.filter((a) => {
    const accountLogs = syncLogs
      .filter((l) => l.socialAccountId === a.id)
      .slice(0, 3);
    return accountLogs.length >= 3 && accountLogs.every((l) => l.status === "failed");
  });

  return (
    <>
      <Header title="Settings & Monitoring">
        <button
          onClick={handleSyncAll}
          disabled={syncingAll}
          className="rounded-lg bg-clutch-red px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {syncingAll ? "Syncing..." : "Sync All"}
        </button>
      </Header>

      {/* Display Preferences */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-clutch-black">Display Preferences</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-clutch-black">Hide sponsored posts from stats & charts</p>
            <p className="text-[10px] text-clutch-grey/50">
              Sponsored posts will still appear in tables but won&apos;t affect KPIs, charts, or comparisons
            </p>
          </div>
          <button
            onClick={handleToggleSponsored}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
              hideSponsored ? "bg-clutch-red" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                hideSponsored ? "translate-x-4.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Full Metric Refresh */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-clutch-black">Full Metric Refresh</h2>
            <p className="text-[10px] text-clutch-grey/50">
              Update metrics for ALL posts across all platforms. YouTube is fast (API), Twitter/TikTok are slower (per-post scraping).
            </p>
          </div>
          <button
            onClick={handleStartRefresh}
            disabled={refreshProgress?.isRunning}
            className="rounded-lg bg-clutch-blue px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
          >
            {refreshProgress?.isRunning ? "Refreshing..." : "Refresh All Metrics"}
          </button>
        </div>

        {refreshProgress?.isRunning && (
          <div className="space-y-3">
            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-clutch-blue transition-all duration-500"
                style={{
                  width: `${refreshProgress.totalPosts > 0 ? (refreshProgress.processedPosts / refreshProgress.totalPosts) * 100 : 0}%`,
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {/* Elapsed time */}
              <div className="rounded-lg bg-gray-50 p-3 text-center">
                <div className="text-lg font-bold text-clutch-black">
                  {formatDuration(elapsedDisplay)}
                </div>
                <p className="text-[10px] text-clutch-grey/50">Elapsed</p>
              </div>

              {/* ETA */}
              <div className="rounded-lg bg-gray-50 p-3 text-center">
                <div className="text-lg font-bold text-clutch-black">
                  {refreshProgress.estimatedRemainingMs > 0
                    ? formatDuration(refreshProgress.estimatedRemainingMs)
                    : "Calculating..."}
                </div>
                <p className="text-[10px] text-clutch-grey/50">Estimated Remaining</p>
              </div>

              {/* Posts progress */}
              <div className="rounded-lg bg-gray-50 p-3 text-center">
                <div className="text-lg font-bold text-clutch-black">
                  {refreshProgress.processedPosts} / {refreshProgress.totalPosts}
                </div>
                <p className="text-[10px] text-clutch-grey/50">Posts Processed</p>
              </div>

              {/* Metrics updated */}
              <div className="rounded-lg bg-gray-50 p-3 text-center">
                <div className="text-lg font-bold text-clutch-black">
                  {refreshProgress.metricsUpdated.toLocaleString()}
                </div>
                <p className="text-[10px] text-clutch-grey/50">Metrics Updated</p>
              </div>
            </div>

            {/* Current account */}
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-clutch-blue">
              Processing: <span className="font-medium capitalize">{refreshProgress.currentPlatform}</span> / {refreshProgress.currentAccount}
              <span className="ml-2 text-clutch-grey/50">
                (Account {refreshProgress.accountsProcessed + 1} of {refreshProgress.accountsTotal})
              </span>
            </div>

            {/* Errors */}
            {refreshProgress.errorCount > 0 && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {refreshProgress.errorCount} error{refreshProgress.errorCount !== 1 ? "s" : ""} — latest: {refreshProgress.errors[refreshProgress.errors.length - 1]}
              </div>
            )}
          </div>
        )}

        {/* Show last completed refresh */}
        {refreshProgress && !refreshProgress.isRunning && refreshProgress.completedAt && (
          <div className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
            Last refresh completed in {formatDuration(refreshProgress.elapsedMs)} — {refreshProgress.processedPosts} posts processed, {refreshProgress.metricsUpdated.toLocaleString()} metrics updated
            {refreshProgress.errorCount > 0 && (
              <span className="text-red-600"> ({refreshProgress.errorCount} errors)</span>
            )}
          </div>
        )}
      </div>

      {/* Health Status */}
      {health && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-clutch-black">System Health</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <div className={`text-lg font-bold ${health.status === "ok" ? "text-green-600" : "text-red-600"}`}>
                {health.status.toUpperCase()}
              </div>
              <p className="text-[10px] text-clutch-grey/50">Status</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <div className={`text-lg font-bold ${health.database ? "text-green-600" : "text-red-600"}`}>
                {health.database ? "Connected" : "Error"}
              </div>
              <p className="text-[10px] text-clutch-grey/50">Database</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <div className="text-lg font-bold text-clutch-black">
                {health.lastSync
                  ? new Date(health.lastSync).toLocaleDateString()
                  : "Never"}
              </div>
              <p className="text-[10px] text-clutch-grey/50">Last Sync</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <div className="text-lg font-bold text-clutch-black">
                v{health.version}
              </div>
              <p className="text-[10px] text-clutch-grey/50">Version</p>
            </div>
          </div>
        </div>
      )}

      {/* Failure Alerts */}
      {failedAccounts.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5">
          <h2 className="mb-2 text-sm font-bold text-red-700">Sync Alerts</h2>
          {failedAccounts.map((a) => (
            <p key={a.id} className="text-xs text-red-600">
              {a.platform}/{a.accountName} has failed 3+ times consecutively.
              Check credentials and try syncing manually.
            </p>
          ))}
        </div>
      )}

      {/* Account Sync Status */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">Account Sync Status</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="rounded-lg border border-gray-100 p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium capitalize text-clutch-black">
                  {account.platform}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${syncStatusColor(account.syncStatus)}`}
                >
                  {account.syncStatus}
                </span>
              </div>
              <p className="mb-1 text-sm font-medium text-clutch-black">
                {account.accountName}
              </p>
              <p className={`mb-3 text-[10px] ${syncFreshness(account.lastSyncedAt)}`}>
                {account.lastSyncedAt
                  ? `Last synced: ${new Date(account.lastSyncedAt).toLocaleString()}`
                  : "Never synced"}
              </p>
              <button
                onClick={() => handleSyncOne(account.id)}
                disabled={syncingId === account.id}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-[10px] font-medium text-clutch-grey transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                {syncingId === account.id ? "Syncing..." : "Sync Now"}
              </button>
            </div>
          ))}
          {accounts.length === 0 && (
            <p className="col-span-full py-4 text-center text-xs text-clutch-grey/50">
              No accounts configured
            </p>
          )}
        </div>
      </div>

      {/* Sync Logs Table */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-clutch-black">Recent Sync Logs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-clutch-grey/50">
                <th className="pb-2 pr-4 font-medium">Account</th>
                <th className="pb-2 pr-4 font-medium">Type</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium text-right">Posts</th>
                <th className="pb-2 pr-4 font-medium">Started</th>
                <th className="pb-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {syncLogs.map((log) => (
                <tr key={log.id} className="border-b border-gray-50">
                  <td className="py-2 pr-4 font-medium text-clutch-black">
                    {log.accountName ?? log.socialAccountId.slice(0, 8)}
                  </td>
                  <td className="py-2 pr-4 text-clutch-grey/70">
                    {log.syncType.replace(/_/g, " ")}
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${syncStatusColor(log.status)}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right">{log.postsSynced}</td>
                  <td className="py-2 pr-4 text-clutch-grey/50">
                    {new Date(log.startedAt).toLocaleString()}
                  </td>
                  <td className="max-w-[200px] truncate py-2 text-red-500">
                    {log.errorMessage ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {syncLogs.length === 0 && (
            <p className="py-8 text-center text-sm text-clutch-grey/50">
              No sync logs yet
            </p>
          )}
        </div>
      </div>
    </>
  );
}
