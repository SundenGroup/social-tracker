import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { ValidationError, NotFoundError } from "@/lib/errors";

/**
 * POST /api/account/password — change your own password.
 *
 * Requires the current password so a stolen session can't silently rotate
 * the password and lock the real user out. Applies the same length rule
 * as the reset flow (≥ 8 chars).
 */
export const POST = apiHandler(
  async (req, session) => {
    const body = await req.json();
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || !newPassword) {
      throw new ValidationError("Current and new password are both required");
    }
    if (newPassword.length < 8) {
      throw new ValidationError("New password must be at least 8 characters");
    }
    if (currentPassword === newPassword) {
      throw new ValidationError("New password must be different from the current one");
    }

    const user = await prisma.user.findUnique({
      where: { id: session!.user.id },
      select: { passwordHash: true },
    });
    if (!user) throw new NotFoundError("Account not found");

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      // Don't distinguish "wrong password" from other 400s at the API shape
      // level — the client always shows the same error message.
      throw new ValidationError("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: session!.user.id },
      data: { passwordHash },
    });

    return NextResponse.json({ data: { message: "Password updated" } });
  },
  { requireAuth: true }
);
