export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-clutch-white">
      <div className="w-full max-w-md px-6">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-clutch-blue">
            Clutch
          </h1>
          <p className="mt-1 text-sm text-clutch-grey/60">
            Social Media Performance Tracker
          </p>
        </div>
        <div className="rounded-2xl bg-white p-8 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
