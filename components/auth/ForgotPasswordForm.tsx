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
      // Intentionally generic — we don't confirm whether the email exists.
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-5">
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-700">
          If an account exists for <strong>{email}</strong>, we&rsquo;ve sent a password reset
          link. Check your inbox (and spam folder) — the link expires in 60 minutes.
        </div>
        <Link
          href="/login"
          className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-center text-sm font-semibold text-clutch-grey transition-colors hover:bg-gray-50"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <p className="text-sm text-clutch-grey/70">
        Enter the email you use to sign in and we&rsquo;ll send you a link to reset your password.
      </p>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-clutch-black">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-clutch-blue focus:outline-none focus:ring-1 focus:ring-clutch-blue"
          placeholder="you@example.com"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-clutch-red px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-clutch-red/90 disabled:opacity-50"
      >
        {isLoading ? "Sending..." : "Send reset link"}
      </button>

      <p className="text-center text-sm text-clutch-grey/60">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-clutch-blue hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
