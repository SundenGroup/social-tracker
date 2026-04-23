"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (submitted) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="auth-success">
          If an account exists for <strong>{email}</strong>, we&rsquo;ve sent a password reset
          link. Check your inbox (and spam folder) — the link expires in 60 minutes.
        </div>
        <Link href="/login" className="auth-btn-secondary">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div className="auth-error">{error}</div>}

      <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: 0, lineHeight: 1.5 }}>
        Enter the email you use to sign in and we&rsquo;ll send you a link to reset your password.
      </p>

      <div>
        <label htmlFor="email" className="auth-label">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="auth-input"
          placeholder="you@example.com"
        />
      </div>

      <button type="submit" disabled={isLoading} className="auth-btn-primary">
        {isLoading ? "Sending…" : "Send reset link"}
      </button>

      <p style={{ textAlign: "center", fontSize: 12, color: "var(--fg-muted)", margin: 0 }}>
        Remembered it?{" "}
        <Link href="/login" className="auth-link">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
