import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { consumeResetToken } from "@/lib/invites";

// POST /api/auth/reset-password
export async function POST(req: Request) {
  try {
    const { token, email: rawEmail, password } = (await req.json()) as {
      token?: string;
      email?: string;
      password?: string;
    };

    if (!token || !rawEmail || !password) {
      return NextResponse.json(
        { error: "Token, email, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Normalize email the same way register / invite / forgot-password do.
    const email = rawEmail.trim().toLowerCase();

    const valid = await consumeResetToken(email, token);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid or expired reset token" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Token was valid but the account no longer exists — shouldn't happen.
      return NextResponse.json(
        { error: "Account not found" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { email },
      data: { passwordHash },
    });

    return NextResponse.json({
      data: { message: "Password has been reset successfully" },
    });
  } catch (error) {
    console.error("[Auth] Reset password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
