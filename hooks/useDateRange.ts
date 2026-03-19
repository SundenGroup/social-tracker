"use client";

import { useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

const DEFAULT_DAYS = 30;

function defaultStart(): string {
  return new Date(Date.now() - DEFAULT_DAYS * 86400000).toISOString().split("T")[0];
}

function defaultEnd(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Syncs startDate / endDate with URL search params so the date range
 * persists when navigating between pages.
 */
export function useDateRange() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const startDate = searchParams.get("startDate") || defaultStart();
  const endDate = searchParams.get("endDate") || defaultEnd();

  const setDateRange = useCallback(
    (start: string, end: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("startDate", start);
      params.set("endDate", end);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  return { startDate, endDate, setDateRange };
}
