import { useEffect, useMemo, useState } from "react";
import { ADDRESSES } from "../config";
import { authorizerAbi } from "../abis";
import { normaliseSignature, publicClient } from "../lib/chain";
import { errorMessage, formatDate } from "../lib/format";
import { CopyButton, Notice, Pill } from "./ui";
import { IconCheck } from "./icons";

type VerifyState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "valid" }
  | { status: "invalid"; reason: string };

function localDefault(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${ pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PqcPanel({
  title,
  description,
  loadMessage,
  onSubmit,
  submitLabel,
  disabled,
  disabledReason,
  signingCommand,
  nonce,
  busy,
  pqcIssuer,
  messageLabel,
}: {
  title: string;
  description: string;
  loadMessage: (deadline: bigint) => Promise<`0x${string}`>;
  onSubmit: (signature: `0x${string}`, deadline: bigint) => void;
  submitLabel: string;
  disabled?: boolean;
  disabledReason?: string;
  signingCommand: string;
  nonce: bigint;
  busy?: boolean;
  pqcIssuer: `0x${string}`;
  messageLabel: string;
}) {
  const [deadlineLocal, setDeadlineLocal] = useState(localDefault);
  const [message, setMessage] = useState<`0x${string}`>();
  const [messageError, setMessageError] = useState<string>();
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [signature, setSignature] = useState("");
  const [verify, setVerify] = useState<VerifyState>({ status: "idle" });

  const deadline = useMemo(() => {
    const ms = new Date(deadlineLocal).getTime();
    return Number.isFinite(ms) ? BigInt(Math.floor(ms / 1000)) : 0n;
  }, [deadlineLocal]);

  useEffect(() => {
    setSignature("");
    setVerify({ status: "idle" });
  }, [message]);

  useEffect(() => {
    let cancelled = false;
    if (deadline <= BigInt(Math.floor(Date.now() / 1000))) {
      setMessage(undefined);
      setMessageError("Choose a deadline in the future.");
      return;
    }
    setLoadingMessage(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await loadMessage(deadline);
        if (cancelled) return;
        setMessage(result);
        setMessageError(undefined);
      } catch (cause) {
        if (cancelled) return;
        setMessage(undefined);
        setMessageError(errorMessage(cause));
      } finally {
        if (!cancelled) setLoadingMessage(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deadline, loadMessage]);

  const parsedSignature = normaliseSignature(signature);
  const signatureBytes = signature.replace(/^0x/, "").replace(/\s+/g, "").length / 2;

  const verifySignature = async () => {
    if (!message || !parsedSignature) return;
    setVerify({ status: "checking" });
    try {
      const valid = await publicClient.readContract({
        address: ADDRESSES.authorizer,
        abi: authorizerAbi,
        functionName: "isAuthorized",
        args: [pqcIssuer, message, parsedSignature],
      });
      setVerify(
        valid
          ? { status: "valid" }
          : { status: "invalid", reason: "The authorizer rejected this signature for the current message." },
      );
    } catch (cause) {
      setVerify({ status: "invalid", reason: errorMessage(cause) });
    }
  };

  return (
    <div className="pqc">
      <div className="pqc__head">
        <div>
          <h3 className="pqc__title">{title}</h3>
          <p className="pqc__desc">{description}</p>
        </div>
        <Pill tone={verify.status === "valid" ? "ok" : "gold"}>
          {verify.status === "valid" ? "Verified" : "Needs signature"}
        </Pill>
      </div>

      <div className="pqc__grid">
        <label className="field">
          <span className="field__label">Deadline</span>
          <input
            className="input"
            type="datetime-local"
            value={deadlineLocal}
            onChange={(event) => setDeadlineLocal(event.target.value)}
          />
          <span className="field__hint">
            {deadline > 0n ? `${formatDate(deadline, true)} UTC · ${deadline.toString()}` : "—"}
          </span>
        </label>
        <div className="field">
          <span className="field__label">Nonce</span>
          <span className="pqc__nonce mono">{nonce.toString()}</span>
          <span className="field__hint">Used up when this lands on chain.</span>
        </div>
      </div>

      <div className="field pqc__message">
        <span className="field__label" title={messageLabel}>
          Message
        </span>
        {loadingMessage ? (
          <span className="mono muted">Reading from the contract…</span>
        ) : message ? (
          <details className="pqc__message-detail">
            <summary>
              <span className="mono small">
                {message.slice(0, 18)}…{message.slice(-12)} · {(message.length - 2) / 2} bytes
              </span>
              <span className="pqc__message-copy">
                <CopyButton value={message} label="Copy message" />
              </span>
            </summary>
            <pre className="code">{message}</pre>
          </details>
        ) : (
          <span className="mono small error-text">{messageError ?? "Message unavailable."}</span>
        )}
      </div>

      <div className="field">
        <span className="field__label">Signature (4,627 bytes)</span>
        <textarea
          className="textarea pqc__signature"
          placeholder="0x… from your offline signer"
          value={signature}
          onChange={(event) => {
            setSignature(event.target.value);
            setVerify({ status: "idle" });
          }}
          spellCheck={false}
        />
        <span className="field__hint">
          {signatureBytes > 0
            ? `${signatureBytes.toLocaleString()} bytes · expected 4,627`
            : "Paste the signature produced by the offline key."}
        </span>
      </div>

      <div className="pqc__actions">
        <button
          type="button"
          className="btn btn--secondary"
          disabled={!message || !parsedSignature || verify.status === "checking"}
          onClick={verifySignature}
        >
          {verify.status === "checking" ? <span className="spinner" /> : null}
          Check signature
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={disabled || busy || !message || !parsedSignature || verify.status !== "valid"}
          onClick={() => {
            if (parsedSignature) onSubmit(parsedSignature, deadline);
          }}
        >
          {busy ? <span className="spinner" /> : null}
          {submitLabel}
        </button>
      </div>

      {verify.status === "valid" ? (
        <div className="sig-status sig-status--ok">
          <IconCheck size={14} />
          Signature verified. You can submit now.
        </div>
      ) : null}
      {verify.status === "invalid" ? (
        <div className="sig-status sig-status--bad">
          <span className="sig-status__dot" aria-hidden="true" />
          {verify.reason}
        </div>
      ) : null}
      {disabled && disabledReason ? <p className="pqc__disabled">{disabledReason}</p> : null}

      <details className="pqc__offline">
        <summary>How to sign offline</summary>
        <Notice>
          Keep the key file off this browser. Sign on the signer host, then paste the signature here.
        </Notice>
        <pre className="code">{signingCommand}</pre>
        <p className="pqc__no-laptop">
          No terminal at hand? Open{" "}
          <a href="/pqc-signer.html" target="_blank" rel="noreferrer">
            the in-browser signer
          </a>{" "}
          — paste the secret key, get the signature on this device. The key never leaves the page.
        </p>
      </details>
    </div>
  );
}
