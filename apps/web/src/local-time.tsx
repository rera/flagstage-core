"use client";

import { useEffect, useState } from "react";

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
  const [text, setText] = useState("");
  useEffect(() => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return;
    setText(friendlyWhen(date, viewerZone()));
  }, [value]);
  return <time dateTime={value}>{text}</time>;
}
