import { Suspense } from "react";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata = {
  title: "Reset password · Clutch Social",
};

export default function ResetPasswordPage() {
  return (
    <>
      <h2 className="auth-heading">Pick a new password</h2>
      <Suspense
        fallback={
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--fg-muted)" }}>
            Loading…
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
