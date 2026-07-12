"use client";

import { useState, useCallback, useEffect } from "react";
import { useProfiles } from "@/hooks/useProfiles";
import type { AskAnswer, AskAnswerSpec } from "@/types/ask";

export interface AskEntry {
  id: number;
  question: string;
  answer?: AskAnswer;
  /** The model's raw validated spec — replayed to the server as
   *  follow-up context so "same but for TikTok" works. */
  spec?: AskAnswerSpec;
  error?: string;
  pending: boolean;
}

const STORAGE_KEY = "ask-transcript-v1";

/** Client state for the Ask page: transcript with follow-up memory,
 *  persisted per-tab (sessionStorage) so a refresh keeps the thread. */
export function useAsk() {
  const { selectedProfileIds } = useProfiles();
  const [entries, setEntries] = useState<AskEntry[]>([]);
  const [busy, setBusy] = useState(false);

  // Restore the transcript once per tab.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AskEntry[];
        setEntries(parsed.filter((e) => !e.pending));
      }
    } catch {
      // corrupt storage — start fresh
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.filter((e) => !e.pending)));
    } catch {
      // storage full/unavailable — transcript just won't survive refresh
    }
  }, [entries]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      const id = Date.now();
      setBusy(true);

      // Last 4 completed exchanges = the model's follow-up context.
      const history = entries
        .filter((e) => e.spec && !e.error)
        .slice(-4)
        .map((e) => ({ question: e.question, spec: e.spec }));

      setEntries((prev) => [...prev, { id, question: q, pending: true }]);
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: q,
            history,
            profileId: selectedProfileIds.length > 0 ? selectedProfileIds.join(",") : undefined,
          }),
        });
        const json = await res.json();
        setEntries((prev) =>
          prev.map((e) =>
            e.id === id
              ? res.ok
                ? { ...e, pending: false, answer: json.data.answer, spec: json.data.spec }
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
    [busy, entries, selectedProfileIds]
  );

  const clear = useCallback(() => {
    setEntries([]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { entries, busy, ask, clear };
}
