import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

// POST /api/auth/forgot-password
export async function POST(req: Request) {
  try {
    const { email } = (await req.json()) as { email?: string };

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Always return success to prevent email enumeration
    const user = await prisma.user.findUnique({ where: { email } });

    if (user && user.isActive) {
      // Generate reset token and store in VerificationToken
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 3600000); // 1 hour

      await prisma.verificationToken.create({
        data: {
          identifier: email,
          token,
          expires,
        },
      });

      // In production, send email here with reset link:
      // `${process.env.NEXTAUTH_URL}/reset-password?token=${token}&email=${email}`
      console.log(
        `[Auth] Password reset requested for ${email}. Token: ${token}`
      );
    }

    return NextResponse.json({
      data: {
        message:
          "If an account exists with this email, a password reset link has been sent.",
      },
    });
  } catch (error) {
    console.error("[Auth] Forgot password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
