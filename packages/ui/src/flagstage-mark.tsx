type FlagstageMarkProps = {
  className?: string;
  title?: string;
};

/** F-flag monogram: thin pole and a pennant split by one fold. */
export function FlagstageMark({ className, title }: FlagstageMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={32}
      height={32}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className ?? "size-4"}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path fill="#F5F7FB" d="M10.8 8h2V24h-2z" />
      <path fill="#F5F7FB" d="M12.8 8h9.6l-3 3.4H12.8z" />
      <path fill="#C6CFDE" d="M12.8 11.4h6.6l3 3.4H12.8z" />
    </svg>
  );
}
