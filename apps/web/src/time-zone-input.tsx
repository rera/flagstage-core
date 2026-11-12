"use client";

import { useEffect, useState } from "react";

export function TimeZoneInput() {
  const [zone, setZone] = useState("UTC");
  useEffect(() => {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved) setZone(resolved);
  }, []);
  return <input type="hidden" name="timeZone" value={zone} />;
}
