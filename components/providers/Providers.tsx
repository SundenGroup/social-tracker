"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/common/Toast";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
