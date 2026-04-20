"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/layouts/Header";
import LoadingSpinner from "@/components/common/LoadingSpinner";

type InvitationStatus = "active" | "pending" | "expired";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  invitationStatus: InvitationStatus;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [resendResult, setResendResult] = useState<
    { userId: string; emailDelivered: boolean; inviteUrl: string } | null
  >(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load users");
        return;
      }
      setUsers(json.data);
    } catch {
      setError("Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleDeactivate = async (id: string, name: string) => {
    if (!confirm(`Deactivate user "${name}"? They will no longer be able to log in.`)) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || "Failed to deactivate user");
        return;
      }
      fetchUsers();
    } catch {
      alert("Failed to deactivate user");
    }
  };

  const handleResend = async (id: string) => {
    setResending(id);
    setResendResult(null);
    try {
      const res = await fetch(`/api/users/${id}/resend-invite`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Failed to resend invite");
        return;
      }
      setResendResult({
        userId: id,
        emailDelivered: json.data.emailDelivered,
        inviteUrl: json.data.inviteUrl,
      });
      fetchUsers();
    } catch {
      alert("Failed to resend invite");
    } finally {
      setResending(null);
    }
  };

  if (isLoading) {
    return (
      <>
        <Header title="User management" />
        <div style={{ display: "flex", minHeight: 400, alignItems: "center", justifyContent: "center" }}>
          <LoadingSpinner size="lg" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header title="User management" />
        <div style={{ padding: "24px 28px" }}>
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
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="User management" subtitle="Who can access this workspace">
        <Link
          href="/users/new"
          style={{
            padding: "7px 14px",
            borderRadius: 8,
            background: "var(--fg)",
            color: "var(--bg-elev)",
            fontSize: 12,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Invite user
        </Link>
      </Header>

      <div style={{ padding: "24px 28px 48px" }}>
        {resendResult && (
          <div
            style={{
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
            }}
          >
            {resendResult.emailDelivered ? (
              <div style={{ fontSize: 13, color: "var(--good)", fontWeight: 600 }}>
                ✓ Invitation email sent.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Invitation generated (email not configured — share this link manually)
                </div>
                <div
                  className="mono"
                  style={{
                    padding: "8px 10px",
                    background: "var(--bg-sunken)",
                    borderRadius: 6,
                    fontSize: 11,
                    wordBreak: "break-all",
                    color: "var(--fg)",
                  }}
                >
                  {resendResult.inviteUrl}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(resendResult.inviteUrl)}
                  style={{
                    marginTop: 8,
                    padding: "5px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg-elev)",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--fg-muted)",
                  }}
                >
                  Copy link
                </button>
              </>
            )}
          </div>
        )}

        <div
          style={{
            background: "var(--bg-elev)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 2fr 100px 150px 110px 150px",
              padding: "12px 16px",
              background: "var(--bg-sunken)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--fg-subtle)",
              borderBottom: "1px solid var(--border)",
              alignItems: "center",
            }}
          >
            <div>Name</div>
            <div>Email</div>
            <div>Role</div>
            <div>Status</div>
            <div>Added</div>
            <div style={{ textAlign: "right" }}>Actions</div>
          </div>

          {users.map((u, i) => (
            <div
              key={u.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 2fr 100px 150px 110px 150px",
                padding: "12px 16px",
                alignItems: "center",
                background: i % 2 === 1 ? "color-mix(in srgb, var(--fg) 2%, transparent)" : "transparent",
                borderBottom: "1px solid var(--border)",
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--fg)" }}>{u.name}</div>
              <div style={{ color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>
                {u.email}
              </div>
              <div>
                <RoleBadge role={u.role} />
              </div>
              <div>
                <StatusBadge status={u.invitationStatus} />
              </div>
              <div className="mono" style={{ color: "var(--fg-subtle)", fontSize: 11 }}>
                {new Date(u.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                {u.invitationStatus !== "active" && (
                  <button
                    onClick={() => handleResend(u.id)}
                    disabled={resending === u.id}
                    style={actionLink()}
                  >
                    {resending === u.id ? "Sending…" : u.invitationStatus === "expired" ? "Resend invite" : "Resend"}
                  </button>
                )}
                <Link href={`/users/${u.id}`} style={actionLink()}>
                  Edit
                </Link>
                {u.isActive && (
                  <button onClick={() => handleDeactivate(u.id, u.name)} style={actionLink("var(--bad)")}>
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          ))}

          {users.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--fg-muted)", fontSize: 13 }}>
              No users yet. Click &ldquo;Invite user&rdquo; above to send the first invitation.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function actionLink(color?: string): React.CSSProperties {
  return {
    fontSize: 12,
    color: color ?? "var(--fg-muted)",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontWeight: 600,
    textDecoration: "none",
  };
}

function RoleBadge({ role }: { role: string }) {
  const admin = role === "admin";
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "2px 8px",
        borderRadius: 5,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: admin
          ? "color-mix(in srgb, var(--accent) 12%, transparent)"
          : "var(--bg-sunken)",
        color: admin ? "var(--accent)" : "var(--fg-muted)",
      }}
    >
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: InvitationStatus }) {
  const cfg =
    status === "active"
      ? { label: "Active", bg: "color-mix(in srgb, var(--good) 12%, transparent)", color: "var(--good)" }
      : status === "pending"
      ? { label: "Pending invite", bg: "color-mix(in srgb, #F59E0B 15%, transparent)", color: "#B45309" }
      : { label: "Invite expired", bg: "color-mix(in srgb, var(--bad) 12%, transparent)", color: "var(--bad)" };
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "2px 8px",
        borderRadius: 5,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: cfg.bg,
        color: cfg.color,
      }}
    >
      {cfg.label}
    </span>
  );
}
