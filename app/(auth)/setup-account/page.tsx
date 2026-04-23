import { Suspense } from "react";
import SetupAccountForm from "@/components/auth/SetupAccountForm";

export const metadata = {
  title: "Set up your account · Clutch Social",
};

export default function SetupAccountPage() {
  return (
    <>
      <h2 className="auth-heading">Finish creating your account</h2>
      <p className="auth-sub">Pick a password — you&rsquo;ll use it to sign in.</p>
      <Suspense
        fallback={
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--fg-muted)" }}>
            Loading…
          </div>
        }
      >
        <SetupAccountForm />
      </Suspense>
    </>
  );
}
