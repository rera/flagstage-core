"use client";

import { useEffect } from "react";

export function ChatStream({ siteId }: { siteId: string }) {
  useEffect(() => {
    const source = new EventSource(`/api/sites/${siteId}/events`);
    let seen = false;
    source.onmessage = () => {
      if (!seen) {
        seen = true;
        return;
      }
      window.location.reload();
    };
    return () => source.close();
  }, [siteId]);
  return null;
}
