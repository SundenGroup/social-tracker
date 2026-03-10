import RegisterForm from "@/components/auth/RegisterForm";

export const metadata = {
  title: "Register - Clutch",
};

export default function RegisterPage() {
  return (
    <>
      <h2 className="mb-6 text-center text-xl font-bold text-clutch-black">
        Create your account
      </h2>
      <RegisterForm />
    </>
  );
}
