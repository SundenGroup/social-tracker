"use client";

import { Suspense } from "react";
import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/common/Toast";
import ProfileProvider from "@/components/providers/ProfileProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Suspense fallback={null}>
        <ProfileProvider>
          <ToastProvider>{children}</ToastProvider>
        </ProfileProvider>
      </Suspense>
    </SessionProvider>
  );
}
