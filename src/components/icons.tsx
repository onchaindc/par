type IconProps = { size?: number; className?: string; strokeWidth?: number };

function svgProps({ size = 18, className, strokeWidth = 1.5 }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
    focusable: false,
  };
}

export function IconOverview(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M4 3.5h9.5A2.5 2.5 0 0 1 16 6v10.5H6.5A2.5 2.5 0 0 1 4 14V3.5Z" />
      <path d="M4 14a2.5 2.5 0 0 1 2.5-2.5H16" />
      <path d="M7.5 6.5h5" />
    </svg>
  );
}

export function IconPortfolio(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <rect x="3" y="5.5" width="14" height="10" rx="2" />
      <path d="M3 8.5h14" />
      <circle cx="13.5" cy="12" r="1" />
    </svg>
  );
}

export function IconIssuer(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M4 6.5h12M4 13.5h12" />
      <circle cx="8" cy="6.5" r="1.7" />
      <circle cx="12.5" cy="13.5" r="1.7" />
    </svg>
  );
}

export function IconClaims(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M10 3v8" />
      <path d="m6.5 8 3.5 3.5L13.5 8" />
      <path d="M3.5 13v2A1.5 1.5 0 0 0 5 16.5h10A1.5 1.5 0 0 0 16.5 15v-2" />
    </svg>
  );
}

export function IconLedger(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M4 4.5h4.5v11H4zM11.5 4.5H16v11h-4.5z" />
      <path d="M6 7h.5M6 9.5h.5M13.5 7h.5M13.5 9.5h.5" />
    </svg>
  );
}

export function IconWallet(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h7.5" />
      <rect x="3.5" y="7.5" width="13" height="8.5" rx="2" />
      <path d="M13 11.5h1.5" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
    </svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <rect x="7" y="7" width="9" height="9" rx="1.5" />
      <path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" />
    </svg>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="m6.5 8.5 3.5 3.5 3.5-3.5" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M4 10h11.5" />
      <path d="m11.5 5.5 4.5 4.5-4.5 4.5" />
    </svg>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M11 4h5v5" />
      <path d="M16 4 9 11" />
      <path d="M14 12.5V15a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 4 15V8a1.5 1.5 0 0 1 1.5-1.5H8" />
    </svg>
  );
}

export function IconSwitch(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M4 7h11" />
      <path d="m12 4 3 3-3 3" />
      <path d="M16 13H5" />
      <path d="m8 16-3-3 3-3" />
    </svg>
  );
}

export function IconQr(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <rect x="3.5" y="3.5" width="5" height="5" rx="1" />
      <rect x="11.5" y="3.5" width="5" height="5" rx="1" />
      <rect x="3.5" y="11.5" width="5" height="5" rx="1" />
      <path d="M11.5 11.5h2v2h-2zM15 15h1.5v1.5H15z" />
    </svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M10 3.5 17 16H3L10 3.5Z" />
      <path d="M10 8v3.5M10 13.6v.1" />
    </svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 9v4M10 6.8v.1" />
    </svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M16 6.5A6.5 6.5 0 1 0 16.4 12" />
      <path d="M16 3.5v3.5h-3.5" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path d="M10 3 16 5.5v4.2c0 3.6-2.4 6.4-6 7.3-3.6-.9-6-3.7-6-7.3V5.5L10 3Z" />
      <path d="m7.5 9.8 1.8 1.8 3.2-3.4" />
    </svg>
  );
}
