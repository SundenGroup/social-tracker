import Link from "next/link";
import { prisma } from "@/lib/db";
import { isPublicRegistrationEnabled } from "@/lib/invites";
import RegisterForm from "@/components/auth/RegisterForm";

export const metadata = {
  title: "Register · Clutch Social",
};

/**
 * Registration is invite-only in production. This page still exists for:
 *   1. First-ever user on a fresh deployment (bootstraps the admin)
 *   2. Staging/dev where ALLOW_PUBLIC_REGISTRATION=true is flipped on
 */
export default async function RegisterPage() {
  const userCount = await prisma.user.count();
  const isBootstrap = userCount === 0;
  const publicEnabled = isPublicRegistrationEnabled();
  const canRegister = isBootstrap || publicEnabled;

  if (!canRegister) {
    return (
      <>
        <h2 className="auth-heading">Invitation only</h2>
        <p className="auth-sub">
          Clutch Social accounts are created by admins — we don&rsquo;t offer self-service
          sign-up. If you were invited, check your inbox for a setup link. Otherwise,
          reach out to your Clutch contact to have one sent.
        </p>
        <Link href="/login" className="auth-btn-secondary">
          Back to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <h2 className="auth-heading">
        {isBootstrap ? "Create the first admin account" : "Create your account"}
      </h2>
      {isBootstrap ? (
        <p className="auth-sub">This will become the owner of a new organization.</p>
      ) : (
        <p className="auth-sub">A few details to get started.</p>
      )}
      <RegisterForm />
    </>
  );
}
