import crypto from "crypto";
import { prisma } from "@/lib/db";

/**
 * Verification-token identifier conventions.
 *
 * We reuse the single `VerificationToken` table for several one-time-use
 * tokens. A short prefix on `identifier` keeps them disjoint without needing
 * an extra schema field.
 *   - `"reset:" + email`   → password reset
 *   - `"invite:" + email`  → new-user invitation (complete account setup)
 */
const RESET_PREFIX = "reset:";
const INVITE_PREFIX = "invite:";

const INVITE_TTL_HOURS = 72;
const RESET_TTL_HOURS = 1;

interface TokenContext {
  token: string;
  expires: Date;
}

/** Create a password-reset token for the given email. */
export async function createResetToken(email: string): Promise<TokenContext> {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + RESET_TTL_HOURS * 3600 * 1000);
  await prisma.verificationToken.create({
    data: { identifier: RESET_PREFIX + email, token, expires },
  });
  return { token, expires };
}

/** Consume a password-reset token. Returns the email if valid, else null. */
export async function consumeResetToken(email: string, token: string): Promise<boolean> {
  const verification = await prisma.verificationToken.findFirst({
    where: {
      identifier: RESET_PREFIX + email,
      token,
      expires: { gt: new Date() },
    },
  });
  if (!verification) {
    // Accept legacy tokens that were created before the prefix (forward compat).
    const legacy = await prisma.verificationToken.findFirst({
      where: { identifier: email, token, expires: { gt: new Date() } },
    });
    if (!legacy) return false;
    await prisma.verificationToken.delete({
      where: { identifier_token: { identifier: email, token } },
    });
    return true;
  }
  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier: RESET_PREFIX + email, token } },
  });
  return true;
}

/** Create an invitation token for the given email. */
export async function createInviteToken(email: string): Promise<TokenContext> {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000);
  // Drop any previously-outstanding invites for this email so a resend works.
  await prisma.verificationToken.deleteMany({
    where: { identifier: INVITE_PREFIX + email },
  });
  await prisma.verificationToken.create({
    data: { identifier: INVITE_PREFIX + email, token, expires },
  });
  return { token, expires };
}

/** Consume an invitation token. Returns true if valid, false otherwise. */
export async function consumeInviteToken(email: string, token: string): Promise<boolean> {
  const verification = await prisma.verificationToken.findFirst({
    where: {
      identifier: INVITE_PREFIX + email,
      token,
      expires: { gt: new Date() },
    },
  });
  if (!verification) return false;
  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier: INVITE_PREFIX + email, token } },
  });
  return true;
}

/** Base URL for building links in emails, derived from NEXTAUTH_URL. */
export function baseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Build the full /setup-account link for an invitation. */
export function buildInviteUrl(email: string, token: string): string {
  const params = new URLSearchParams({ email, token });
  return `${baseUrl()}/setup-account?${params.toString()}`;
}

/** Build the full /reset-password link. */
export function buildResetUrl(email: string, token: string): string {
  const params = new URLSearchParams({ email, token });
  return `${baseUrl()}/reset-password?${params.toString()}`;
}

/**
 * Public registration is disabled by default. An org owner can enable it via
 * `ALLOW_PUBLIC_REGISTRATION=true` in the server environment — but the
 * production default is invite-only.
 *
 * Special case: if there are zero users in the system, we allow one
 * bootstrap registration (so a fresh deployment can create its first admin).
 */
export function isPublicRegistrationEnabled(): boolean {
  const v = (process.env.ALLOW_PUBLIC_REGISTRATION ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export { INVITE_PREFIX, RESET_PREFIX };
