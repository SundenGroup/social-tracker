"use client";

import { useState, useCallback } from "react";
import { useProfiles } from "@/hooks/useProfiles";
import type { AskAnswer } from "@/types/ask";

export interface AskEntry {
  id: number;
  question: string;
  answer?: AskAnswer;
  error?: string;
  pending: boolean;
}

/** Client state for the Ask page: transcript + one in-flight question. */
export function useAsk() {
  const { selectedProfileIds } = useProfiles();
  const [entries, setEntries] = useState<AskEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      const id = Date.now();
      setBusy(true);
      setEntries((prev) => [...prev, { id, question: q, pending: true }]);
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: q,
            profileId: selectedProfileIds.length > 0 ? selectedProfileIds.join(",") : undefined,
          }),
        });
        const json = await res.json();
        setEntries((prev) =>
          prev.map((e) =>
            e.id === id
              ? res.ok
                ? { ...e, pending: false, answer: json.data.answer }
                : { ...e, pending: false, error: json.error ?? "Something went wrong" }
              : e
          )
        );
      } catch {
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, pending: false, error: "Network error — try again" } : e))
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, selectedProfileIds]
  );

  const clear = useCallback(() => setEntries([]), []);

  return { entries, busy, ask, clear };
}
