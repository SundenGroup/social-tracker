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

  // Validate + fetch invite info on mount
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
    return <div className="py-10 text-center text-sm text-clutch-grey/60">Checking invitation…</div>;
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{loadError}</div>
        <Link
          href="/login"
          className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-center text-sm font-semibold text-clutch-grey transition-colors hover:bg-gray-50"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="rounded-lg bg-green-50 p-4 text-sm text-green-700">
        Account activated. Redirecting you to sign in...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <div className="font-semibold text-clutch-black">{info?.name}</div>
        <div className="text-xs text-clutch-grey/70">{info?.email}</div>
        <div className="mt-1 text-xs text-clutch-grey/50">
          Joining <strong>{info?.organizationName}</strong>
        </div>
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-clutch-black">
          Choose a password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-clutch-blue focus:outline-none focus:ring-1 focus:ring-clutch-blue"
          placeholder="At least 8 characters"
        />
      </div>

      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-clutch-black">
          Confirm password
        </label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-clutch-blue focus:outline-none focus:ring-1 focus:ring-clutch-blue"
          placeholder="Type it again"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-clutch-red px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-clutch-red/90 disabled:opacity-50"
      >
        {isSubmitting ? "Activating..." : "Activate account"}
      </button>
    </form>
  );
}
