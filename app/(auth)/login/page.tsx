import LoginForm from "@/components/auth/LoginForm";

export const metadata = {
  title: "Sign In - Clutch",
};

export default function LoginPage() {
  return (
    <>
      <h2 className="mb-6 text-center text-xl font-bold text-clutch-black">
        Sign in to your account
      </h2>
      <LoginForm />
    </>
  );
}
