"use client";

import { useEffect, useState } from "react";

/**
 * True when the viewport is ≤ the given breakpoint. Mirrors the prototype's
 * `useIsMobile(900)` — used to flip the sidebar into a drawer and toggle the
 * hamburger visibility on the topbar.
 *
 * Starts at `false` during SSR and the initial client render to avoid
 * hydration mismatch, then updates once on mount. This matches how the
 * rest of the app treats viewport-derived state.
 */
export function useIsMobile(breakpoint = 900): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    function onResize() {
      setMobile(window.innerWidth <= breakpoint);
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return mobile;
}
