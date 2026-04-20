import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { consumeInviteToken } from "@/lib/invites";

/**
 * POST /api/auth/setup-account
 *
 * Completes an invitation: the admin previously created the user row with
 * `isActive: false` and a garbage password. This endpoint validates the
 * invitation token, sets the chosen password, and activates the account.
 *
 * GET /api/auth/setup-account?email=&token=
 *   Returns a small JSON payload with { name, email } if the token is valid,
 *   so the setup page can pre-fill / personalize. It does NOT consume the
 *   token — that happens on POST.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("token");

  if (!email || !token) {
    return NextResponse.json({ error: "Missing email or token" }, { status: 400 });
  }

  const verification = await prisma.verificationToken.findFirst({
    where: {
      identifier: "invite:" + email,
      token,
      expires: { gt: new Date() },
    },
  });

  if (!verification) {
    return NextResponse.json(
      { error: "This invitation link is invalid or has expired." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { name: true, email: true, organization: { select: { name: true } } },
  });

  if (!user) {
    return NextResponse.json(
      { error: "This invitation link is invalid or has expired." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    data: {
      name: user.name,
      email: user.email,
      organizationName: user.organization.name,
    },
  });
}

export async function POST(req: Request) {
  try {
    const { email, token, password } = (await req.json()) as {
      email?: string;
      token?: string;
      password?: string;
    };

    if (!email || !token || !password) {
      return NextResponse.json(
        { error: "Email, token, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const valid = await consumeInviteToken(email, token);
    if (!valid) {
      return NextResponse.json(
        { error: "This invitation link is invalid or has expired." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { email },
      data: { passwordHash, isActive: true },
    });

    return NextResponse.json({
      data: { message: "Account activated. You can now sign in." },
    });
  } catch (error) {
    console.error("[Auth] Setup account error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
