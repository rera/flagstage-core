"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refreshes Overview while a crawl is writing progress onto the import row. */
export function ImportWatch({ siteId }: { siteId: string }) {
  const router = useRouter();
  useEffect(() => {
    const source = new EventSource(`/api/sites/${siteId}/events`);
    let seen = false;
    source.onmessage = () => {
      if (!seen) {
        seen = true;
        return;
      }
      router.refresh();
    };
    const timer = setInterval(() => router.refresh(), 1000);
    return () => {
      clearInterval(timer);
      source.close();
    };
  }, [router, siteId]);
  return null;
}
