"use client";

import { createContext, useContext, useState } from "react";

interface MobileNavState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const MobileNavContext = createContext<MobileNavState | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <MobileNavContext.Provider
      value={{
        open,
        setOpen,
        toggle: () => setOpen((v) => !v),
      }}
    >
      {children}
    </MobileNavContext.Provider>
  );
}

/** Access the mobile nav open/close state. Returns a no-op shape outside
 *  the provider so components that render in both auth and dashboard
 *  trees don't have to care. */
export function useMobileNav(): MobileNavState {
  const ctx = useContext(MobileNavContext);
  if (ctx) return ctx;
  return {
    open: false,
    setOpen: () => {},
    toggle: () => {},
  };
}
