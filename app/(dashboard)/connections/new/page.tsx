import AccountForm from "@/components/forms/AccountForm";

export const metadata = {
  title: "Add connection - Clutch",
};

export default function NewConnectionPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold text-clutch-black">
        Add connection
      </h1>
      <p className="mb-6 text-xs text-clutch-grey/60">
        Connect a social account so Clutch can sync its posts and metrics.
      </p>
      <div className="mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-6">
        <AccountForm />
      </div>
    </>
  );
}
