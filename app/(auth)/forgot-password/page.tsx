import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata = {
  title: "Forgot password - Clutch",
};

export default function ForgotPasswordPage() {
  return (
    <>
      <h2 className="mb-6 text-center text-xl font-bold text-clutch-black">
        Reset your password
      </h2>
      <ForgotPasswordForm />
    </>
  );
}
