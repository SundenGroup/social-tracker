"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/common/Toast";
import ProfileProvider from "@/components/providers/ProfileProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ProfileProvider>
        <ToastProvider>{children}</ToastProvider>
      </ProfileProvider>
    </SessionProvider>
  );
}
