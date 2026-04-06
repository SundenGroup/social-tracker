import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { ValidationError } from "@/lib/errors";
import crypto from "crypto";

// GET /api/users - List all users in org
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
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      data: users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  },
  { requireAuth: true, requireAdmin: true }
);

// POST /api/users - Create a new user
export const POST = apiHandler(
  async (req, session) => {
    const body = await req.json();
    const { email, name, role } = body as {
      email?: string;
      name?: string;
      role?: string;
    };

    if (!email || !name) {
      throw new ValidationError("Email and name are required");
    }

    if (role && !["admin", "viewer"].includes(role)) {
      throw new ValidationError("Role must be admin or viewer");
    }

    const orgId = session!.user.organizationId;

    // Check email uniqueness
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ValidationError("A user with this email already exists");
    }

    // Generate a temporary password
    const tempPassword = crypto.randomBytes(12).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        role: (role as "admin" | "viewer") ?? "viewer",
        organizationId: orgId,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Try to send credentials via email; fall back to returning in response
    let passwordDelivered = false;
    try {
      const { sendEmail } = await import("@/lib/email");
      passwordDelivered = await sendEmail({
        to: email,
        subject: "Your Clutch Social account",
        html: `<p>An account has been created for you.</p><p>Email: <strong>${email}</strong></p><p>Temporary password: <strong>${tempPassword}</strong></p><p>Please log in and change your password.</p>`,
      });
    } catch { /* SMTP not configured */ }

    return NextResponse.json(
      {
        data: {
          ...user,
          createdAt: user.createdAt.toISOString(),
          // Only include temp password if email delivery failed
          ...(passwordDelivered ? {} : { tempPassword }),
          passwordDelivered,
        },
      },
      { status: 201 }
    );
  },
  { requireAuth: true, requireAdmin: true }
);
