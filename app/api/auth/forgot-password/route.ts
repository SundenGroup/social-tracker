import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createResetToken, buildResetUrl } from "@/lib/invites";
import { sendPasswordResetEmail } from "@/lib/email";

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

    // Always return a generic success response — we never confirm whether
    // a given email is registered, to prevent account enumeration.
    const user = await prisma.user.findUnique({ where: { email } });

    if (user && user.isActive) {
      const { token } = await createResetToken(email);
      const url = buildResetUrl(email, token);
      // Fire and forget — if email fails we log but don't surface it to the caller.
      await sendPasswordResetEmail({ to: email, name: user.name, url });
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
