export function NavIcon({ name }: { name: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };
  if (name === "collapse") {
    return (
      <svg {...common}>
        <path d="M10 3.5 6.5 8 10 12.5" />
        <path d="M3.5 3.5v9" />
      </svg>
    );
  }
  if (name === "expand") {
    return (
      <svg {...common}>
        <path d="M6 3.5 9.5 8 6 12.5" />
        <path d="M3.5 3.5v9" />
      </svg>
    );
  }
  if (name === "changes") {
    return (
      <svg {...common}>
        <path d="M9 3.5 12.5 7 6 13.5H2.5V10Z" />
      </svg>
    );
  }
  if (name === "overview") {
    return (
      <svg {...common}>
        <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="0.5" />
        <rect x="9" y="2.5" width="4.5" height="4.5" rx="0.5" />
        <rect x="2.5" y="9" width="4.5" height="4.5" rx="0.5" />
        <rect x="9" y="9" width="4.5" height="4.5" rx="0.5" />
      </svg>
    );
  }
  if (name === "domain") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="5.25" />
        <path d="M2.75 8h10.5M8 2.75c1.6 1.7 1.6 8.8 0 10.5M8 2.75c-1.6 1.7-1.6 8.8 0 10.5" />
      </svg>
    );
  }
  if (name === "forms") {
    return (
      <svg {...common}>
        <rect x="3" y="2.5" width="10" height="11" rx="1" />
        <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" />
      </svg>
    );
  }
  if (name === "analytics") {
    return (
      <svg {...common}>
        <path d="M3 12.5V9M6.5 12.5V6.5M10 12.5V4M13.5 12.5V8" />
      </svg>
    );
  }
  if (name === "scheduled") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="5.25" />
        <path d="M8 5v3.25L10 10" />
      </svg>
    );
  }
  if (name === "settings") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="2" />
        <path d="M8 2.5v1.5M8 12v1.5M2.5 8H4M12 8h1.5M4.1 4.1l1.1 1.1M10.8 10.8l1.1 1.1M11.9 4.1 10.8 5.2M5.2 10.8l-1.1 1.1" />
      </svg>
    );
  }
  if (name === "sites") {
    return (
      <svg {...common}>
        <rect x="2.5" y="3" width="11" height="8.5" rx="1" />
        <path d="M2.5 6h11" />
      </svg>
    );
  }
  if (name === "people") {
    return (
      <svg {...common}>
        <circle cx="6" cy="5.5" r="1.75" />
        <circle cx="10.5" cy="6" r="1.4" />
        <path d="M2.8 12.2c.5-1.8 1.8-2.7 3.2-2.7s2.7.9 3.2 2.7M9.2 9.6c.8-.3 1.6-.2 2.3.3.8.6 1.2 1.4 1.4 2.3" />
      </svg>
    );
  }
  if (name === "usage") {
    return (
      <svg {...common}>
        <path d="M3 12.5 6.2 8l2.2 2.2L13 4.5" />
      </svg>
    );
  }
  if (name === "accounts") {
    return (
      <svg {...common}>
        <rect x="2.5" y="3" width="7" height="10" rx="1" />
        <path d="M6 3.5V2.8A1 1 0 0 1 7 1.8h5.2a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H9.5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 8.5 6.5 11 12 5" />
    </svg>
  );
}
