"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

interface InviteInfo {
  name: string;
  email: string;
  organizationName: string;
}

export default function SetupAccountForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token || !email) {
      setLoadError("This invitation link is missing information. Please ask for a new invite.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const qs = new URLSearchParams({ email, token });
        const res = await fetch(`/api/auth/setup-account?${qs}`);
        const json = await res.json();
        if (!res.ok) {
          setLoadError(json.error || "This invitation link is invalid or has expired.");
          return;
        }
        setInfo(json.data);
      } catch {
        setLoadError("Could not verify invitation. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [email, token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/setup-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not complete setup.");
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "var(--fg-muted)" }}>
        Checking invitation…
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="auth-error">{loadError}</div>
        <Link href="/login" className="auth-btn-secondary">
          Go to sign in
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="auth-success">
        Account activated. Redirecting you to sign in…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div className="auth-error">{error}</div>}

      {/* Invitee summary card — preview what they're signing up to */}
      <div
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg-sunken)",
          borderRadius: 10,
          padding: "12px 14px",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>{info?.name}</div>
        <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 2 }}>{info?.email}</div>
        <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 6 }}>
          Joining <strong style={{ color: "var(--fg)", fontWeight: 600 }}>{info?.organizationName}</strong>
        </div>
      </div>

      <div>
        <label htmlFor="password" className="auth-label">
          Choose a password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="auth-input"
          placeholder="At least 8 characters"
        />
      </div>

      <div>
        <label htmlFor="confirm" className="auth-label">
          Confirm password
        </label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="auth-input"
          placeholder="Type it again"
        />
      </div>

      <button type="submit" disabled={isSubmitting} className="auth-btn-primary">
        {isSubmitting ? "Activating…" : "Activate account"}
      </button>
    </form>
  );
}
