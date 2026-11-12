"use client";

import { useState } from "react";

import { cn } from "@flagstage/ui";

export function BrowserFrame({ url, src, title }: { url: string; src?: string; title: string }) {
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
  return (
    <div className="builder-preview flex h-full min-h-0 flex-col bg-[#eef0f5] px-3 pt-3">
      <div className="mb-2 flex shrink-0 items-center gap-1.5">
        <i className="size-2 rounded-full bg-[#c8c6d2]" aria-hidden />
        <i className="size-2 rounded-full bg-[#c8c6d2]" aria-hidden />
        <i className="size-2 rounded-full bg-[#c8c6d2]" aria-hidden />
        <div className="min-w-0 flex-1 truncate rounded-[7px] bg-white px-2.5 py-1 text-center font-mono text-[11.5px] text-muted-foreground">
          {url}
        </div>
        <div className="flex rounded-md bg-white p-0.5 text-[11px] font-medium">
          <button
            type="button"
            aria-pressed={mode === "desktop"}
            className={cn(
              "rounded px-2 py-1",
              mode === "desktop" ? "bg-[var(--wash)] text-foreground" : "text-muted-foreground"
            )}
            onClick={() => setMode("desktop")}
          >
            Desktop
          </button>
          <button
            type="button"
            aria-pressed={mode === "mobile"}
            className={cn(
              "rounded px-2 py-1",
              mode === "mobile" ? "bg-[var(--wash)] text-foreground" : "text-muted-foreground"
            )}
            onClick={() => setMode("mobile")}
          >
            Mobile
          </button>
        </div>
      </div>
      <div
        className={cn("min-h-0 flex-1 pb-3", mode === "mobile" && "mx-auto w-full max-w-[390px]")}
      >
        {src ? (
          <iframe
            title={title}
            src={src}
            className="h-full min-h-[480px] w-full border-0 bg-white"
          />
        ) : (
          <div className="grid h-full min-h-[480px] place-items-center bg-white text-sm text-muted-foreground">
            {title}
          </div>
        )}
      </div>
    </div>
  );
}
