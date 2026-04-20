import { Suspense } from "react";
import SetupAccountForm from "@/components/auth/SetupAccountForm";

export const metadata = {
  title: "Set up your account - Clutch",
};

export default function SetupAccountPage() {
  return (
    <>
      <h2 className="mb-6 text-center text-xl font-bold text-clutch-black">
        Finish creating your account
      </h2>
      <Suspense fallback={<div className="py-10 text-center text-sm text-clutch-grey/60">Loading…</div>}>
        <SetupAccountForm />
      </Suspense>
    </>
  );
}
