import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      organizationId: string;
      image?: string | null;
    };
  }

  interface User {
    role: UserRole;
    organizationId: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    organizationId: string;
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    role: UserRole;
    organizationId: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 days
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.isActive) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.organizationId = user.organizationId;
      }

      // Periodically re-validate user is still active and org hasn't changed
      // Check at most once every 5 minutes to avoid DB load on every request
      const now = Math.floor(Date.now() / 1000);
      const lastChecked = (token.lastChecked as number) ?? 0;
      if (now - lastChecked > 300) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { isActive: true, role: true, organizationId: true },
        });
        if (!dbUser || !dbUser.isActive) {
          // Return empty token to force sign-out
          return { ...token, id: "", role: "viewer", organizationId: "" };
        }
        token.role = dbUser.role;
        token.organizationId = dbUser.organizationId;
        token.lastChecked = now;
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as UserRole;
      session.user.organizationId = token.organizationId as string;
      return session;
    },
  },
});
