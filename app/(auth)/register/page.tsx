import Link from "next/link";
import { prisma } from "@/lib/db";
import { isPublicRegistrationEnabled } from "@/lib/invites";
import RegisterForm from "@/components/auth/RegisterForm";

export const metadata = {
  title: "Register - Clutch",
};

/**
 * Registration is invite-only in production. We still keep this page around for:
 *   1. First-ever user on a fresh deployment (bootstraps the admin account)
 *   2. Staging/dev where ALLOW_PUBLIC_REGISTRATION=true can be flipped on
 *
 * In every other case the page renders a clear "invite-only" explainer and
 * points people to /login.
 */
export default async function RegisterPage() {
  const userCount = await prisma.user.count();
  const isBootstrap = userCount === 0;
  const publicEnabled = isPublicRegistrationEnabled();

  const canRegister = isBootstrap || publicEnabled;

  if (!canRegister) {
    return (
      <>
        <h2 className="mb-2 text-center text-xl font-bold text-clutch-black">
          Invitation only
        </h2>
        <p className="mb-6 text-center text-sm text-clutch-grey/70">
          Clutch Social accounts are created by admins — we don&rsquo;t offer self-service
          sign-up. If you were invited, check your inbox for a setup link. Otherwise,
          reach out to your Clutch contact to have one sent.
        </p>
        <Link
          href="/login"
          className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-center text-sm font-semibold text-clutch-grey transition-colors hover:bg-gray-50"
        >
          Back to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <h2 className="mb-2 text-center text-xl font-bold text-clutch-black">
        {isBootstrap ? "Create the first admin account" : "Create your account"}
      </h2>
      {isBootstrap && (
        <p className="mb-6 text-center text-xs text-clutch-grey/60">
          This will become the owner of a new organization.
        </p>
      )}
      <RegisterForm />
    </>
  );
}
