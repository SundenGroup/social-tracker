"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginSchema } from "@/lib/validators";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }

    setIsLoading(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Invalid email or password");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div className="auth-error">{error}</div>}

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

      <div>
        <label htmlFor="password" className="auth-label">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="auth-input"
          placeholder="••••••••"
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -4 }}>
        <Link href="/forgot-password" className="auth-link" style={{ fontSize: 12 }}>
          Forgot password?
        </Link>
      </div>

      <button type="submit" disabled={isLoading} className="auth-btn-primary">
        {isLoading ? "Signing in…" : "Sign in"}
      </button>

      <p style={{ textAlign: "center", fontSize: 11, color: "var(--fg-subtle)", margin: 0 }}>
        Clutch Social is invite-only. Ask your admin to send you an invitation.
      </p>
    </form>
  );
}
