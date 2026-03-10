"use client";

import { useState, useEffect, useCallback } from "react";
import type { SocialAccountResponse } from "@/types";

export function useAccounts() {
  const [accounts, setAccounts] = useState<SocialAccountResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to fetch accounts");
        return;
      }
      setAccounts(data.data);
    } catch {
      setError("Failed to fetch accounts");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const deleteAccount = useCallback(async (id: string) => {
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to delete account");
    }
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { accounts, isLoading, error, refetch: fetchAccounts, deleteAccount };
}

export function useAccount(id: string) {
  const [account, setAccount] = useState<SocialAccountResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch_() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/accounts/${id}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to fetch account");
          return;
        }
        setAccount(data.data);
      } catch {
        setError("Failed to fetch account");
      } finally {
        setIsLoading(false);
      }
    }
    fetch_();
  }, [id]);

  return { account, isLoading, error };
}
