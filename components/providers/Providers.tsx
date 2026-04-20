"use client";

import { Suspense } from "react";
import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/common/Toast";
import ProfileProvider from "@/components/providers/ProfileProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Suspense fallback={null}>
        <ThemeProvider>
          <ProfileProvider>
            <ToastProvider>{children}</ToastProvider>
          </ProfileProvider>
        </ThemeProvider>
      </Suspense>
    </SessionProvider>
  );
}
