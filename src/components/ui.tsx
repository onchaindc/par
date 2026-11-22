import { useState, type ReactNode } from "react";
import { shortAddress } from "../lib/format";
import { IconCheck, IconCopy } from "./icons";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={copied ? "copy copy--done" : "copy"}
      aria-label={`${label}: ${value}`}
      title={copied ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          /* clipboard may be unavailable */
        }
      }}
    >
      {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
    </button>
  );
}

export function Address({
  value,
  chars = 4,
  full = false,
}: {
  value: string;
  chars?: number;
  full?: boolean;
}) {
  return (
    <span className="addr">
      <span className="mono" title={value}>
        {full ? value : shortAddress(value, chars)}
      </span>
      <CopyButton value={value} label="Copy address" />
    </span>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "bad" | "gold" | "solid";
}) {
  const cls = tone === "neutral" ? "pill" : `pill pill--${tone}`;
  return (
    <span className={cls}>
      {tone !== "neutral" && tone !== "solid" ? <span className="dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head__main">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="page-head__title">{title}</h1>
        {description ? <p className="page-head__sub">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="page-head__actions">{actions}</div> : null}
    </header>
  );
}

export function Stat({
  label,
  value,
  unit,
  foot,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  foot?: ReactNode;
  tone?: "default" | "positive" | "attention";
}) {
  return (
    <div className={tone && tone !== "default" ? `stat stat--${tone}` : "stat"}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </div>
      {foot ? <div className="stat__foot">{foot}</div> : null}
    </div>
  );
}

export function Card({
  title,
  hint,
  actions,
  children,
  flush,
  id,
  className,
  footer,
}: {
  title?: string;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  id?: string;
  className?: string;
  footer?: ReactNode;
}) {
  return (
    <section className={className ? `card ${className}` : "card"} id={id}>
      {title || actions ? (
        <div className="card__head">
          <div className="card__head-text">
            {title ? <h2 className="card__title">{title}</h2> : null}
            {hint ? <p className="card__hint">{hint}</p> : null}
          </div>
          {actions ? <div className="card__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? "card__body card__body--flush" : "card__body"}>{children}</div>
      {footer ? <div className="card__foot">{footer}</div> : null}
    </section>
  );
}

export function Skeleton({
  width = "100%",
  height,
  stat,
}: {
  width?: string;
  height?: number;
  stat?: boolean;
}) {
  return (
    <div
      className={stat ? "skeleton skeleton--stat" : "skeleton"}
      style={{ width, height: height ? `${height}px` : undefined }}
      aria-hidden="true"
    />
  );
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children ? <div className="empty__text">{children}</div> : null}
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "warn" | "danger" | "ok";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`notice notice--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <span className="notice__mark" aria-hidden="true" />
      <div className="notice__body">
        {title ? <div className="notice__title">{title}</div> : null}
        <div className="notice__text">{children}</div>
      </div>
    </div>
  );
}

export function Progress({
  value,
  tone = "green",
  label,
}: {
  value: number;
  tone?: "green" | "gold";
  label?: string;
}) {
  const width = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={tone === "gold" ? "progress progress--gold" : "progress"}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      aria-label={label}
    >
      <div className="progress__bar" style={{ width: `${width}%` }} />
    </div>
  );
}

export function KeyValue({ rows }: { rows: Array<{ label: ReactNode; value: ReactNode }> }) {
  return (
    <dl className="kv">
      {rows.map((row, index) => (
        <div className="kv__row" key={index}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
