import type { ReactNode } from "react";

export function AdminPage({
  title,
  description,
  stats,
  children
}: {
  title: string;
  description: string;
  stats?: Array<{ label: string; value: string }>;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {stats && stats.length > 0 ? (
        <div
          className={stats.length > 2 ? "grid gap-3 sm:grid-cols-3" : "grid gap-3 sm:grid-cols-2"}
        >
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
              <p
                className={
                  stat.value.length > 18
                    ? "mt-1 text-sm font-semibold tracking-tight break-all"
                    : "mt-1 text-2xl font-semibold tracking-tight"
                }
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  );
}
