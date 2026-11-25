"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { cn } from "@flagstage/ui";

export function ModalDialog({
  dialogRef,
  children,
  cardClassName
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  children: ReactNode;
  cardClassName?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <dialog ref={dialogRef} className="modal-surface">
      <div
        className={cn(
          "w-full max-w-md rounded-xl border border-border bg-background p-6 text-foreground shadow-lg",
          cardClassName
        )}
      >
        {children}
      </div>
    </dialog>,
    document.body
  );
}
