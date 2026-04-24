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
      /**
       * Profile ids this viewer is scoped to. Empty array = "all profiles
       * in the org" (the default). One or more entries = hard-restricted
       * to those profiles. Ignored for admins — they always see everything.
       */
      profileIds: string[];
      image?: string | null;
    };
  }

  interface User {
    role: UserRole;
    organizationId: string;
    profileIds?: string[];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    organizationId: string;
    profileIds: string[];
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    role: UserRole;
    organizationId: string;
    profileIds?: string[];
  }
}

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: THIRTY_DAYS_SECONDS },
  jwt: { maxAge: THIRTY_DAYS_SECONDS },
  pages: {
    signIn: "/login",
  },
  // Explicit cookie config so the session token is persistent (not a
  // session-only cookie) and survives browser restarts.
  cookies: {
    sessionToken: {
      name: `__Secure-authjs.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
        maxAge: THIRTY_DAYS_SECONDS,
      },
    },
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
          include: {
            profileScopes: { select: { profileId: true } },
          },
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
          profileIds: user.profileScopes.map((s) => s.profileId),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.organizationId = user.organizationId;
        token.profileIds = user.profileIds ?? [];
      }

      // When the client calls session.update() (e.g. after editing profile),
      // force an immediate DB re-read instead of waiting for the next 5-minute window.
      const forceRevalidate = trigger === "update";

      // Periodically re-validate user is still active and org hasn't changed.
      // Check at most once every 5 minutes to avoid DB load on every request.
      // IMPORTANT: On any DB error we keep the existing token intact —
      // a transient database hiccup must NOT sign the user out.
      const now = Math.floor(Date.now() / 1000);
      const lastChecked = (token.lastChecked as number) ?? 0;
      if (token.id && (forceRevalidate || now - lastChecked > 300)) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              isActive: true,
              role: true,
              organizationId: true,
              name: true,
              profileScopes: { select: { profileId: true } },
            },
          });
          if (dbUser && dbUser.isActive) {
            token.role = dbUser.role;
            token.organizationId = dbUser.organizationId;
            token.profileIds = dbUser.profileScopes.map((s) => s.profileId);
            token.name = dbUser.name;
            token.lastChecked = now;
          } else if (dbUser && !dbUser.isActive) {
            // User definitively deactivated — force sign-out
            return { ...token, id: "", role: "viewer", organizationId: "", profileIds: [] };
          }
          // dbUser === null: user not found. Could be a race with a fresh login
          // or a stale read — don't wipe the session, just retry next cycle.
        } catch (err) {
          // DB unreachable / query failed — keep the existing token and
          // back off for 5 minutes before trying again.
          console.error("[auth] JWT revalidation DB error, keeping session:", err);
          token.lastChecked = now;
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as UserRole;
      session.user.organizationId = token.organizationId as string;
      // Tolerate old tokens issued before the multi-profile migration —
      // they'll have `profileId` (singular) and no `profileIds`. One more
      // revalidation cycle (5 min) and the JWT heals itself.
      const t = token as unknown as { profileIds?: string[]; profileId?: string | null };
      session.user.profileIds = Array.isArray(t.profileIds)
        ? t.profileIds
        : t.profileId
          ? [t.profileId]
          : [];
      return session;
    },
  },
});
