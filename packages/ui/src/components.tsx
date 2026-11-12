import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet" | "danger";
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`btn btn-${variant} ${className}`.trim()} {...props} />;
}

export function TextField({
  label,
  hint,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const fieldId = id ?? props.name;
  return (
    <label className="field" htmlFor={fieldId}>
      <span>{label}</span>
      <input id={fieldId} {...props} />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function PageHeader({
  title,
  description,
  actions
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children
}: {
  tone?: "neutral" | "ok" | "warn" | "bad";
  children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Alert({
  tone = "warn",
  children
}: {
  tone?: "warn" | "bad" | "ok";
  children: ReactNode;
}) {
  return (
    <div className={`alert alert-${tone}`} role={tone === "ok" ? "status" : "alert"}>
      {children}
    </div>
  );
}

export function PoweredBy() {
  return (
    <footer className="powered">
      <a href="https://flagstage.com">Powered by Flagstage</a>
    </footer>
  );
}

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1f4d3a" />
      <path d="M9 6.5v19" stroke="#F5F7FB" strokeWidth="1.6" />
      <path d="M10.2 7.2h12.2L17.6 13l4.8 5.6H10.2z" fill="#F5F7FB" />
      <path d="M10.2 13h7.2L14.6 16.2 17.4 18.6H10.2z" fill="#C6CFDE" />
    </svg>
  );
}
