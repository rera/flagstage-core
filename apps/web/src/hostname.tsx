import { cn } from "@flagstage/ui";

/** Hostnames stay intact at hyphens. They ellipsize, or wrap only after a dot. */
export function Hostname({
  value,
  className,
  truncate = false
}: {
  value: string;
  className?: string;
  truncate?: boolean;
}) {
  if (truncate) {
    return (
      <span className={cn("block min-w-0 truncate", className)} title={value}>
        {value}
      </span>
    );
  }
  const labels = value.split(".");
  return (
    <span className={cn("min-w-0", className)} title={value}>
      {labels.map((label, index) => (
        <span key={index}>
          <span className="whitespace-nowrap">{label}</span>
          {index < labels.length - 1 ? (
            <>
              .<wbr />
            </>
          ) : null}
        </span>
      ))}
    </span>
  );
}
