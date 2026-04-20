"use client";

import Header from "@/components/layouts/Header";
import DateRangePicker from "@/components/common/DateRangePicker";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ContentPerformanceTable from "@/components/tables/ContentPerformanceTable";
import { useDashboard } from "@/hooks/useDashboard";
import { useDateRange } from "@/hooks/useDateRange";

export default function PostsPage() {
  const { startDate, endDate, setDateRange } = useDateRange();
  const { data, isLoading, error, refetch } = useDashboard(startDate, endDate);

  return (
    <>
      <Header title="Post performance" subtitle="Every post, every platform">
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={(s, e) => setDateRange(s, e)} />
      </Header>

      {isLoading && !data && (
        <div style={{ display: "flex", minHeight: 400, alignItems: "center", justifyContent: "center" }}>
          <LoadingSpinner size="lg" />
        </div>
      )}

      {error && (
        <div style={{ padding: "24px 28px" }}>
          <div
            style={{
              background: "color-mix(in srgb, var(--bad) 8%, transparent)",
              color: "var(--bad)",
              border: "1px solid color-mix(in srgb, var(--bad) 40%, transparent)",
              borderRadius: 10,
              padding: 14,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        </div>
      )}

      {data && (
        <div style={{ padding: "24px 28px 48px" }}>
          <ContentPerformanceTable posts={data.posts} onToggleSponsored={() => refetch()} />
        </div>
      )}
    </>
  );
}
