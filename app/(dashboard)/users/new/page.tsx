"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layouts/Header";
import UserForm from "@/components/forms/UserForm";

interface InviteResult {
  email: string;
  emailDelivered: boolean;
  emailConfigured: boolean;
  inviteUrl: string;
}

export default function NewUserPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: {
    name: string;
    email: string;
    role: string;
    profileId?: string | null;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to invite user");
        return;
      }
      setResult({
        email: data.email,
        emailDelivered: json.data.emailDelivered,
        emailConfigured: json.data.emailConfigured,
        inviteUrl: json.data.inviteUrl,
      });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (result) {
    return (
      <>
        <Header title="Invitation sent" />
        <div style={{ padding: "24px 28px", maxWidth: 640 }}>
          <div
            style={{
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 24,
            }}
          >
            {result.emailDelivered ? (
              <>
                <div
                  style={{
                    background: "color-mix(in srgb, var(--good) 10%, transparent)",
                    color: "var(--good)",
                    borderRadius: 10,
                    padding: 14,
                    fontSize: 13,
                    marginBottom: 16,
                    fontWeight: 600,
                  }}
                >
                  ✓ Invitation email sent to <strong>{result.email}</strong>
                </div>
                <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55, margin: 0 }}>
                  They&rsquo;ll receive a link to set their password and activate their account. The
                  link expires in 72 hours — if they miss it, you can resend the invitation from
                  the users list.
                </p>
              </>
            ) : (
              <>
                <div
                  style={{
                    background: "color-mix(in srgb, #F59E0B 15%, transparent)",
                    color: "#B45309",
                    borderRadius: 10,
                    padding: 14,
                    fontSize: 13,
                    marginBottom: 16,
                    fontWeight: 600,
                  }}
                >
                  {result.emailConfigured
                    ? "Invitation created, but the email couldn't be delivered."
                    : "Invitation created. Email isn't configured yet — share this link manually."}
                </div>
                <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55, marginTop: 0 }}>
                  Send this link to <strong>{result.email}</strong>. It expires in 72 hours.
                </p>
                <div
                  className="mono"
                  style={{
                    padding: "10px 12px",
                    background: "var(--bg-sunken)",
                    borderRadius: 8,
                    fontSize: 11,
                    wordBreak: "break-all",
                    color: "var(--fg)",
                    marginTop: 12,
                  }}
                >
                  {result.inviteUrl}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(result.inviteUrl)}
                  style={{
                    marginTop: 10,
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg-elev)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--fg)",
                  }}
                >
                  Copy link
                </button>
              </>
            )}

            <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
              <button
                onClick={() => setResult(null)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg-elev)",
                  color: "var(--fg)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Invite another user
              </button>
              <button
                onClick={() => router.push("/users")}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: "var(--fg)",
                  color: "var(--bg-elev)",
                  border: "none",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Back to users
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Invite user" subtitle="Send an invitation to set up an account" />
      <div style={{ padding: "24px 28px", maxWidth: 540 }}>
        {error && (
          <div
            style={{
              background: "color-mix(in srgb, var(--bad) 8%, transparent)",
              color: "var(--bad)",
              border: "1px solid color-mix(in srgb, var(--bad) 40%, transparent)",
              borderRadius: 10,
              padding: 14,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}
        <div
          style={{
            background: "var(--bg-elev)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 24,
          }}
        >
          <UserForm onSubmit={handleSubmit} isLoading={isLoading} />
          <p style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 16, lineHeight: 1.5 }}>
            They&rsquo;ll receive an email with a link to set their password. The link is valid
            for 72 hours. No temporary password is ever shown or stored.
          </p>
        </div>
      </div>
    </>
  );
}
