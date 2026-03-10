import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

// POST /api/auth/reset-password
export async function POST(req: Request) {
  try {
    const { token, email, password } = (await req.json()) as {
      token?: string;
      email?: string;
      password?: string;
    };

    if (!token || !email || !password) {
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

    // Find and validate token
    const verification = await prisma.verificationToken.findFirst({
      where: {
        identifier: email,
        token,
        expires: { gt: new Date() },
      },
    });

    if (!verification) {
      return NextResponse.json(
        { error: "Invalid or expired reset token" },
        { status: 400 }
      );
    }

    // Update password
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { email },
      data: { passwordHash },
    });

    // Delete used token
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: email,
          token,
        },
      },
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
