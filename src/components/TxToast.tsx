import type { TxState } from "../hooks/useTx";
import { IconAlert, IconCheck, IconClose } from "./icons";

const TITLES: Record<Exclude<TxState["status"], "idle">, string> = {
  signing: "Awaiting wallet approval",
  pending: "Transaction submitted",
  confirmed: "Transaction confirmed",
  error: "Transaction failed",
};

export function TxToast({ tx, onClose }: { tx: TxState; onClose: () => void }) {
  if (tx.status === "idle") return null;
  const failed = tx.status === "error";
  const done = tx.status === "confirmed";
  const working = tx.status === "signing" || tx.status === "pending";

  return (
    <div
      className={`toast${failed ? " toast--bad" : done ? " toast--ok" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="toast__icon" aria-hidden="true">
        {working ? <span className="spinner" /> : failed ? <IconAlert size={16} /> : <IconCheck size={16} />}
      </span>
      <div className="toast__body">
        <div className="toast__title">{TITLES[tx.status]}</div>
        {tx.label ? <div className="toast__label">{tx.label}</div> : null}
        {tx.error ? <div className="toast__error">{tx.error}</div> : null}
        {tx.hash ? <div className="toast__hash">{tx.hash}</div> : null}
      </div>
      <button type="button" className="toast__close" onClick={onClose} aria-label="Dismiss">
        <IconClose size={15} />
      </button>
    </div>
  );
}
