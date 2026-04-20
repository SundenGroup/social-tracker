import { Suspense } from "react";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata = {
  title: "Reset password - Clutch",
};

export default function ResetPasswordPage() {
  return (
    <>
      <h2 className="mb-6 text-center text-xl font-bold text-clutch-black">
        Pick a new password
      </h2>
      <Suspense fallback={<div className="py-10 text-center text-sm text-clutch-grey/60">Loading…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
