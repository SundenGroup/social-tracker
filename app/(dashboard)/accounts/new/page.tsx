import AccountForm from "@/components/forms/AccountForm";

export const metadata = {
  title: "Add Account - Clutch",
};

export default function NewAccountPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold text-clutch-black">
        Add Social Account
      </h1>
      <div className="mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-6">
        <AccountForm />
      </div>
    </>
  );
}
