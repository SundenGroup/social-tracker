"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Header from "@/components/layouts/Header";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useToast } from "@/components/common/Toast";

interface AccountData {
  id: string;
  name: string;
  email: string;
  role: string;
  organizationName: string;
}

export default function AccountPage() {
  const { update: updateSession } = useSession();
  const { toast } = useToast();

  const [data, setData] = useState<AccountData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Name form
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const fetchAccount = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/account");
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json.error || "Failed to load account");
        return;
      }
      setData(json.data);
      setNameInput(json.data.name);
    } catch {
      setLoadError("Failed to load account");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!data) return;
    if (trimmed === data.name) return;
    if (trimmed.length < 1) {
      toast("error", "Name can't be empty");
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast("error", json.error || "Failed to update name");
        return;
      }
      setData({ ...data, name: json.data.name });
      setNameInput(json.data.name);
      // Refresh session so the sidebar footer etc. show the new name
      await updateSession();
      toast("success", "Name updated");
    } catch {
      toast("error", "Failed to update name");
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError("New password must be different from the current one");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPasswordError(json.error || "Failed to change password");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast("success", "Password changed");
    } catch {
      setPasswordError("Failed to change password");
    } finally {
      setSavingPassword(false);
    }
  }

  if (isLoading) {
    return (
      <>
        <Header title="My account" subtitle="Your personal settings" />
        <div style={{ display: "flex", minHeight: 400, alignItems: "center", justifyContent: "center" }}>
          <LoadingSpinner size="lg" />
        </div>
      </>
    );
  }

  if (loadError || !data) {
    return (
      <>
        <Header title="My account" subtitle="Your personal settings" />
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
            {loadError ?? "Account not found"}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="My account" subtitle="Your personal settings" />

      <div style={{ padding: "24px 28px 48px", maxWidth: 640, display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Profile section */}
        <Section title="Profile">
          <Field label="Email">
            <div
              style={{
                padding: "9px 12px",
                background: "var(--bg-sunken)",
                borderRadius: 8,
                fontSize: 13,
                color: "var(--fg-muted)",
              }}
            >
              {data.email}
            </div>
            <Helper>
              Your email is also your login. Contact an admin if you need to change it.
            </Helper>
          </Field>

          <Field label="Display name">
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                disabled={savingName}
                maxLength={100}
                style={inputStyle}
              />
              <button
                onClick={handleSaveName}
                disabled={savingName || nameInput.trim() === data.name || nameInput.trim().length < 1}
                style={primaryButtonStyle(savingName || nameInput.trim() === data.name || nameInput.trim().length < 1)}
              >
                {savingName ? "Saving…" : "Save"}
              </button>
            </div>
          </Field>

          <Field label="Role">
            <RoleBadge role={data.role} />
            <Helper>Set by your organization&rsquo;s admins.</Helper>
          </Field>

          <Field label="Organization">
            <div
              style={{
                padding: "9px 12px",
                background: "var(--bg-sunken)",
                borderRadius: 8,
                fontSize: 13,
                color: "var(--fg)",
                fontWeight: 500,
              }}
            >
              {data.organizationName}
            </div>
          </Field>
        </Section>

        {/* Password section */}
        <Section title="Change password">
          <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {passwordError && (
              <div
                style={{
                  background: "color-mix(in srgb, var(--bad) 8%, transparent)",
                  color: "var(--bad)",
                  border: "1px solid color-mix(in srgb, var(--bad) 40%, transparent)",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 12,
                }}
              >
                {passwordError}
              </div>
            )}

            <Field label="Current password">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
                style={inputStyle}
              />
            </Field>

            <Field label="New password">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                style={inputStyle}
              />
              <Helper>At least 8 characters.</Helper>
            </Field>

            <Field label="Confirm new password">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                style={inputStyle}
              />
            </Field>

            <div>
              <button
                type="submit"
                disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                style={primaryButtonStyle(savingPassword || !currentPassword || !newPassword || !confirmPassword)}
              >
                {savingPassword ? "Updating…" : "Update password"}
              </button>
            </div>
          </form>
        </Section>
      </div>
    </>
  );
}

/* -- helpers -- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--fg)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--fg-muted)", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Helper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 5 }}>{children}</div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const admin = role === "admin";
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "3px 10px",
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

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-elev)",
  fontSize: 13,
  color: "var(--fg)",
  outline: "none",
  fontFamily: "inherit",
};

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "9px 16px",
    borderRadius: 8,
    background: "var(--fg)",
    color: "var(--bg-elev)",
    border: "none",
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    whiteSpace: "nowrap",
  };
}
