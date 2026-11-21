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
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function Notice({
  tone = "neutral",
  icon = "i",
  children,
}: {
  tone?: "neutral" | "warn" | "danger";
  icon?: string;
  children: ReactNode;
}) {
  const cls = tone === "neutral" ? "notice" : `notice notice--${tone}`;
  return (
    <div className={cls} role={tone === "danger" ? "alert" : undefined}>
      <span className="notice__icon" aria-hidden="true">{icon}</span>
      <div>{children}</div>
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
        ? "Transaction submitted"
        : tx.status === "confirmed"
          ? "Transaction confirmed"
          : "Transaction failed";
  return (
    <div className={bad ? "toast toast--bad" : "toast"} role="status" aria-live="polite">
      {(tx.status === "signing" || tx.status === "pending") && <span className="spinner" aria-hidden="true" />}
      <div className="toast__body">
        <div className="toast__title">
          {title}
          {tx.label ? ` · ${tx.label}` : ""}
        </div>
        {tx.error ? <div>{tx.error}</div> : null}
        {tx.hash ? <div className="toast__hash">{tx.hash}</div> : null}
      </div>
      <button type="button" className="toast__close" onClick={onClose} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
