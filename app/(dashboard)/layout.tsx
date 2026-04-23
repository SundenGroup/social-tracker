import Sidebar from "@/components/layouts/Sidebar";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import { MobileNavProvider } from "@/components/layouts/MobileNavProvider";
import DashboardShell from "@/components/layouts/DashboardShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MobileNavProvider>
      <DashboardShell sidebar={<Sidebar />}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </DashboardShell>
    </MobileNavProvider>
  );
}
