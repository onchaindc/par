import { useState, type ReactNode } from "react";
import type { TxState } from "../hooks/useTx";
import { shortAddress } from "../lib/format";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      aria-label={`${label}: ${value}`}
      title={copied ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard may be unavailable */
        }
      }}
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8.5 6.2 12 13 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )}
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
      <span title={value}>{full ? value : shortAddress(value, chars)}</span>
      <CopyButton value={value} label="Copy address" />
    </span>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "bad" | "gold";
}) {
  const cls = tone === "neutral" ? "pill" : `pill pill--${tone}`;
  return (
    <span className={cls}>
      {tone !== "neutral" ? <span className="dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  unit,
  foot,
}: {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <div className="stat">
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
}: {
  title?: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  id?: string;
}) {
  return (
    <section className="card" id={id}>
      {(title || actions) && (
        <div className="card__head">
          <div>
            {title ? <h3 className="card__title">{title}</h3> : null}
            {hint ? <p className="card__hint">{hint}</p> : null}
          </div>
          {actions ? <div className="btn-row">{actions}</div> : null}
        </div>
      )}
      <div className={flush ? "card__body card__body--flush" : "card__body"}>{children}</div>
    </section>
  );
}

export function Skeleton({ width = "100%", height, stat }: { width?: string; height?: number; stat?: boolean }) {
  return (
    <div
      className={stat ? "skeleton skeleton--stat" : "skeleton"}
      style={{ width, height: height ? `${height}px` : undefined }}
      aria-hidden="true"
    />
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M5 8.5 12 5l7 3.5-7 3.5-7-3.5Z" />
          <path d="m5 12.5 7 3.5 7-3.5" />
          <path d="m5 16.5 7 3.5 7-3.5" opacity=".45" />
        </svg>
      </span>
      <strong>{title}</strong>
      {children ? <div className="empty__body">{children}</div> : null}
    </div>
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
  actions,
  onClose,
}: {
  tone?: "neutral" | "warn" | "danger";
  icon?: string;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
}) {
  const cls = tone === "neutral" ? "notice" : `notice notice--${tone}`;
  return (
    <div className={cls} role={tone === "danger" ? "alert" : undefined}>
      <span className="notice__icon" aria-hidden="true">
        {tone === "neutral" ? (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="10" cy="10" r="7.2" />
            <path d="M10 9v4.5M10 6.4v.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3.2 17.2 16H2.8L10 3.2Z" />
            <path d="M10 8v3.4M10 13.9v.1" />
          </svg>
        )}
      </span>
      <div className="notice__body">
        {title ? <strong className="notice__title">{title}</strong> : null}
        <div className="notice__text">{children}</div>
        {actions ? <div className="notice__actions">{actions}</div> : null}
      </div>
      {onClose ? (
        <button type="button" className="notice__close" onClick={onClose} aria-label="Dismiss">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

export function TxToast({ tx, onClose }: { tx: TxState; onClose: () => void }) {
  if (tx.status === "idle") return null;
  const bad = tx.status === "error";
  const title =
    tx.status === "signing"
      ? "Confirm in your wallet"
      : tx.status === "pending"
        ? "Sending…"
        : tx.status === "confirmed"
          ? "All done"
          : "That didn't work";
  return (
    <div className={bad ? "toast toast--bad" : "toast"} role="status" aria-live="polite">
      <span className="toast__icon" aria-hidden="true">
        {tx.status === "signing" || tx.status === "pending" ? (
          <span className="spinner" />
        ) : tx.status === "confirmed" ? (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4.5 10.5 3.4 3.4L15.5 6" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="m6 6 8 8M14 6l-8 8" />
          </svg>
        )}
      </span>
      <div className="toast__body">
        <div className="toast__title">{title}</div>
        {tx.label ? <div className="toast__label">{tx.label}</div> : null}
        {tx.error ? <div className="toast__error">{tx.error}</div> : null}
        {tx.hash ? <div className="toast__hash">{tx.hash}</div> : null}
      </div>
      <button type="button" className="toast__close" onClick={onClose} aria-label="Dismiss">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="m4 4 8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
