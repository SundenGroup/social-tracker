"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!token || !email) {
      setError("This reset link is missing required information. Please request a new one.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not reset password. The link may have expired.");
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <div className="auth-success">
        Password updated. Redirecting you to sign in…
      </div>
    );
  }

  if (!token || !email) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="auth-error">
          This reset link is invalid.{" "}
          <Link href="/forgot-password" className="auth-link" style={{ color: "inherit", textDecoration: "underline" }}>
            Request a new one
          </Link>
          .
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div className="auth-error">{error}</div>}

      <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: 0, lineHeight: 1.5 }}>
        Setting a new password for <strong style={{ color: "var(--fg)" }}>{email}</strong>.
      </p>

      <div>
        <label htmlFor="password" className="auth-label">
          New password
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

      <button type="submit" disabled={isLoading} className="auth-btn-primary">
        {isLoading ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
