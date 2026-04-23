import LoginForm from "@/components/auth/LoginForm";

export const metadata = {
  title: "Sign in · Clutch Social",
};

export default function LoginPage() {
  return (
    <>
      <h2 className="auth-heading">Sign in</h2>
      <p className="auth-sub">Welcome back to Clutch Social.</p>
      <LoginForm />
    </>
  );
}
