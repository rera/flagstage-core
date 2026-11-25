"use client";

import { friendlyWhen } from "./time";

function viewerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Same friendly clock everywhere, in the viewer's time zone. */
export function LocalTime({ value }: { value: string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <time dateTime={value} suppressHydrationWarning>
      {friendlyWhen(date, viewerZone())}
    </time>
  );
}
