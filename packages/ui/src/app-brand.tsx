import { cn } from "./cn";
import { FlagstageMark } from "./flagstage-mark";

export function AppBrand({
  variant = "header",
  name = "Flagstage",
  surface,
  logoSrc,
  href = "/"
}: {
  variant?: "header" | "auth";
  name?: string;
  surface?: string;
  logoSrc?: string | null;
  href?: string;
}) {
  const mark = logoSrc ? (
    <img src={logoSrc} alt="" width={28} height={28} className="size-7 rounded-[6px]" />
  ) : (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden bg-[#111620]",
        variant === "header" ? "size-9 rounded-[9px]" : "size-7 rounded-[6px]"
      )}
    >
      <FlagstageMark className={variant === "header" ? "size-9" : "size-7"} />
    </span>
  );
  return (
    <a
      href={href}
      aria-label={name}
      className={cn(
        "inline-flex min-w-0 items-center gap-2.5 text-foreground",
        variant === "auth" && "flex-col gap-2"
      )}
    >
      {variant === "auth" ? (
        <span className="inline-flex items-center gap-2.5">
          {mark}
          <span className="flex flex-col items-start leading-none">
            <span className="text-[15px] font-semibold tracking-tight">{name}</span>
            {surface ? (
              <span className="mt-0.5 text-[10px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
                {surface}
              </span>
            ) : null}
          </span>
        </span>
      ) : (
        <>
          {mark}
          <span className="truncate text-[18px] font-semibold tracking-[-0.03em]">{name}</span>
        </>
      )}
    </a>
  );
}
