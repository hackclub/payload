"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Triggers a one-time router refresh on mount so server components outside the
 * current page (e.g. the nav in the root layout) pick up state that changed
 * during this render. The layout doesn't re-render on client navigation, so
 * without this a change like "mark customization seen" only shows after a manual
 * reload.
 */
export default function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
