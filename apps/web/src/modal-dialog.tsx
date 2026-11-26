"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { cn } from "@flagstage/ui";

export function ModalDialog({
  dialogRef,
  children,
  cardClassName,
  open = false
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  children: ReactNode;
  cardClassName?: string;
  /** Opens the dialog after it is mounted. Closed dialogs stay unchanged. */
  open?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted || !open) return;
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    const focusInitial = () => dialog.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    focusInitial();
    requestAnimationFrame(focusInitial);
  }, [dialogRef, mounted, open]);
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
