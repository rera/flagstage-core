"use client";

import { useEffect, useState } from "react";

import { compactWhen, friendlyWhen } from "./time";

function viewerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Same friendly clock everywhere, in the viewer's time zone. */
export function LocalTime({ value, compact = false }: { value: string; compact?: boolean }) {
  const [text, setText] = useState("");
  const [short, setShort] = useState("");
  useEffect(() => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    const zone = viewerZone();
    setText(friendlyWhen(date, zone));
    if (compact) setShort(compactWhen(date, zone));
  }, [compact, value]);
  if (!compact) return <time dateTime={value}>{text}</time>;
  return (
    <time dateTime={value}>
      <span className="whitespace-nowrap sm:hidden">{short}</span>
      <span className="hidden whitespace-nowrap sm:inline">{text}</span>
    </time>
  );
}
