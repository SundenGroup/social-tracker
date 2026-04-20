import Sidebar from "@/components/layouts/Sidebar";
import ErrorBoundary from "@/components/common/ErrorBoundary";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
