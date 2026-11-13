import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  level = 1
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  level?: 1 | 2;
}) {
  const Heading = level === 2 ? "h2" : "h1";
  return (
    <header className="flex flex-col gap-4 border-b border-border/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <Heading
          className={
            level === 2
              ? "text-lg font-semibold tracking-tight text-balance"
              : "text-2xl font-semibold tracking-tight text-balance"
          }
        >
          {title}
        </Heading>
        {description ? (
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
