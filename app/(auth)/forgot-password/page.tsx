import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata = {
  title: "Forgot password · Clutch Social",
};

export default function ForgotPasswordPage() {
  return (
    <>
      <h2 className="auth-heading">Reset your password</h2>
      <ForgotPasswordForm />
    </>
  );
}
