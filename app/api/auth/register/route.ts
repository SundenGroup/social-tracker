import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { registerSchema } from "@/lib/validators";
import { isPublicRegistrationEnabled } from "@/lib/invites";

export async function POST(request: Request) {
  try {
    // Public registration is closed by default (invite-only deployment).
    // The first-ever user is still allowed through, so a fresh deploy can
    // bootstrap its admin; after that, gate on ALLOW_PUBLIC_REGISTRATION.
    const userCount = await prisma.user.count();
    if (userCount > 0 && !isPublicRegistrationEnabled()) {
      return NextResponse.json(
        {
          error:
            "Public registration is disabled. Please ask your admin to send you an invitation.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const field = issue.path.join(".");
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(issue.message);
      }
      return NextResponse.json(
        { error: "Validation failed", details: fieldErrors },
        { status: 400 }
      );
    }

    const { name, email, password } = result.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      // Generic message to prevent email enumeration
      return NextResponse.json(
        { error: "Registration failed. Please try again or contact support." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const isFirstUser = userCount === 0;

    let user;

    if (isFirstUser) {
      // First user: create org and set as admin
      user = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: { name: `${name}'s Organization` },
        });

        const newUser = await tx.user.create({
          data: {
            name,
            email,
            passwordHash,
            role: "admin",
            organizationId: org.id,
          },
        });

        await tx.organization.update({
          where: { id: org.id },
          data: { ownerId: newUser.id },
        });

        return newUser;
      });
    } else {
      // Subsequent users: assign to the first org as viewer
      const defaultOrg = await prisma.organization.findFirst({
        orderBy: { createdAt: "asc" },
      });

      if (!defaultOrg) {
        return NextResponse.json(
          { error: "No organization found" },
          { status: 500 }
        );
      }

      user = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: "viewer",
          organizationId: defaultOrg.id,
        },
      });
    }

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
