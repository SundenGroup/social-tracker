import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createInviteToken, buildInviteUrl } from "@/lib/invites";
import { sendInviteEmail, isEmailConfigured } from "@/lib/email";

/**
 * POST /api/users/[id]/resend-invite
 *
 * Regenerate the invitation token for a user that hasn't activated yet
 * and email them a fresh setup link. Admin-only, scoped to the admin's org.
 */
export const POST = apiHandler(
  async (req, session) => {
    const id = new URL(req.url).pathname.split("/").at(-2)!;
    const orgId = session!.user.organizationId;

    const user = await prisma.user.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        organization: { select: { name: true } },
      },
    });
    if (!user) throw new NotFoundError("User not found");

    if (user.isActive) {
      throw new ValidationError(
        "This user has already activated their account. Use password reset instead."
      );
    }

    const { token } = await createInviteToken(user.email);
    const inviteUrl = buildInviteUrl(user.email, token);

    const emailDelivered = await sendInviteEmail({
      to: user.email,
      name: user.name,
      inviterName: session!.user.name,
      organizationName: user.organization.name,
      url: inviteUrl,
    });

    return NextResponse.json({
      data: {
        emailDelivered,
        emailConfigured: isEmailConfigured(),
        inviteUrl,
      },
    });
  },
  { requireAuth: true, requireAdmin: true }
);
