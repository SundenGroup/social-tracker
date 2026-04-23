import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { ValidationError } from "@/lib/errors";
import { createInviteToken, buildInviteUrl } from "@/lib/invites";
import { sendInviteEmail, isEmailConfigured } from "@/lib/email";

/**
 * Validate that a provided profileId (if any) belongs to the admin's org.
 * Returns the cleaned value (null = "all profiles"). Throws ValidationError
 * if the profile exists but lives in a different org — we don't leak cross-org
 * profile IDs this way.
 */
async function resolveProfileId(raw: unknown, orgId: string): Promise<string | null> {
  if (raw == null || raw === "" || raw === "all") return null;
  if (typeof raw !== "string") throw new ValidationError("Invalid profile");
  const profile = await prisma.profile.findFirst({
    where: { id: raw, organizationId: orgId },
    select: { id: true },
  });
  if (!profile) throw new ValidationError("Profile not found in this organization");
  return profile.id;
}

// GET /api/users - List all users in org (with invitation status)
export const GET = apiHandler(
  async (_req, session) => {
    const orgId = session!.user.organizationId;

    const users = await prisma.user.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        profileId: true,
        profile: { select: { name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Users with isActive=false are invited-but-not-activated. Figure out
    // whether their invite is still valid so the admin UI can show
    // "pending invitation" vs "invite expired".
    const inactiveEmails = users.filter((u) => !u.isActive).map((u) => u.email);
    const pendingInvites = inactiveEmails.length > 0
      ? await prisma.verificationToken.findMany({
          where: {
            identifier: { in: inactiveEmails.map((e) => "invite:" + e) },
            expires: { gt: new Date() },
          },
          select: { identifier: true },
        })
      : [];
    const pendingEmails = new Set(
      pendingInvites.map((p) => p.identifier.replace(/^invite:/, ""))
    );

    return NextResponse.json({
      data: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        profileId: u.profileId,
        profileName: u.profile?.name ?? null,
        createdAt: u.createdAt.toISOString(),
        invitationStatus: u.isActive
          ? "active"
          : pendingEmails.has(u.email)
          ? "pending"
          : "expired",
      })),
    });
  },
  { requireAuth: true, requireAdmin: true }
);

// POST /api/users - Invite a new user
// Creates a User row with isActive=false + garbage password, generates an
// invitation token, emails the setup link. The admin's response includes
// the URL as a manual fallback if SMTP isn't configured.
export const POST = apiHandler(
  async (req, session) => {
    const body = await req.json();
    const { email, name, role, profileId: rawProfileId } = body as {
      email?: string;
      name?: string;
      role?: string;
      profileId?: string | null;
    };

    if (!email || !name) {
      throw new ValidationError("Email and name are required");
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new ValidationError("Invalid email address");
    }

    if (role && !["admin", "viewer"].includes(role)) {
      throw new ValidationError("Role must be admin or viewer");
    }

    const orgId = session!.user.organizationId;

    // Admins always see everything — profile scope is ignored for them.
    // Validate the provided profile either way so bad input doesn't silently
    // get accepted.
    const scopedProfileId =
      role === "admin" ? null : await resolveProfileId(rawProfileId, orgId);

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });

    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      // If the user is already active, we can't invite them again.
      // If they were previously invited but never activated, resend the
      // invitation (same endpoint, same response shape).
      if (existing.isActive) {
        throw new ValidationError("A user with this email already exists");
      }
      if (existing.organizationId !== orgId) {
        throw new ValidationError("A user with this email already exists");
      }
    }

    // Placeholder password hash — the actual password is set when the invitee
    // clicks their setup link. We never want a usable password to exist in
    // the DB for an un-activated account, so we hash a large random string.
    const unusable = crypto.randomBytes(48).toString("hex");
    const passwordHash = await bcrypt.hash(unusable, 12);

    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            name: cleanName,
            role: (role as "admin" | "viewer") ?? existing.role,
            profileId: scopedProfileId,
            // Keep the placeholder hash — we don't want a stale one lying around.
            passwordHash,
            isActive: false,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            profileId: true,
            createdAt: true,
          },
        })
      : await prisma.user.create({
          data: {
            email: cleanEmail,
            name: cleanName,
            role: (role as "admin" | "viewer") ?? "viewer",
            organizationId: orgId,
            profileId: scopedProfileId,
            passwordHash,
            isActive: false,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            profileId: true,
            createdAt: true,
          },
        });

    const { token } = await createInviteToken(cleanEmail);
    const inviteUrl = buildInviteUrl(cleanEmail, token);

    const emailDelivered = await sendInviteEmail({
      to: cleanEmail,
      name: cleanName,
      inviterName: session!.user.name,
      organizationName: org?.name ?? "Clutch Social",
      url: inviteUrl,
    });

    return NextResponse.json(
      {
        data: {
          ...user,
          createdAt: user.createdAt.toISOString(),
          invitationStatus: "pending" as const,
          emailDelivered,
          emailConfigured: isEmailConfigured(),
          // Expose the setup URL to the admin as a fallback so they can relay
          // it manually if email delivery isn't set up. Safe: admin just
          // created the invitation.
          inviteUrl,
        },
      },
      { status: 201 }
    );
  },
  { requireAuth: true, requireAdmin: true }
);
