import AccountForm from "@/components/forms/AccountForm";

export const metadata = {
  title: "Add connection - Clutch",
};

export default function NewConnectionPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold text-[var(--fg)]">
        Add connection
      </h1>
      <p className="mb-6 text-xs text-[var(--fg-muted)]">
        Connect a social account so Clutch can sync its posts and metrics.
      </p>
      <div className="mx-auto max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] p-6">
        <AccountForm />
      </div>
    </>
  );
}
