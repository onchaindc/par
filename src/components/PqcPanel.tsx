import { useEffect, useMemo, useState } from "react";
import { ADDRESSES } from "../config";
import { authorizerAbi } from "../abis";
import { normaliseSignature, publicClient } from "../lib/chain";
import { errorMessage, formatDate } from "../lib/format";
import { CopyButton, Notice } from "./ui";

type VerifyState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "valid" }
  | { status: "invalid"; reason: string };

function localDefault(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
      setVerify(valid ? { status: "valid" } : { status: "invalid", reason: "The authorizer rejected this signature for the current message." });
    } catch (cause) {
      setVerify({ status: "invalid", reason: errorMessage(cause) });
    }
  };

  return (
    <div className="panel panel--green" style={{ marginTop: 16 }}>
      <div className="panel__title">{title}</div>
      <p style={{ marginBottom: 12 }}>{description}</p>

      <div className="form-row" style={{ marginBottom: 12 }}>
        <label className="field">
          <span className="field__label">Signature deadline (local time)</span>
          <input
            className="input"
            type="datetime-local"
            value={deadlineLocal}
            onChange={(event) => setDeadlineLocal(event.target.value)}
          />
          <span className="field__hint">{deadline > 0n ? `${formatDate(deadline, true)} UTC · ${deadline.toString()}` : "—"}</span>
        </label>
        <div className="field" style={{ flex: "0 0 auto" }}>
          <span className="field__label">Authorization nonce</span>
          <span className="mono" style={{ padding: "9px 0" }}>{nonce.toString()}</span>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <span className="field__label">Message to sign (read from the contract)</span>
        {loadingMessage ? (
          <span className="mono muted">Reading {messageLabel}…</span>
        ) : message ? (
          <details>
            <summary className="mono small" style={{ cursor: "pointer" }}>
              {message.slice(0, 18)}…{message.slice(-12)} · {(message.length - 2) / 2} bytes
              <span style={{ marginLeft: 8 }}><CopyButton value={message} label="Copy message" /></span>
            </summary>
            <pre className="code" style={{ marginTop: 8, maxHeight: 132 }}>{message}</pre>
          </details>
        ) : (
          <span className="mono small" style={{ color: "var(--danger)" }}>{messageError ?? "Message unavailable."}</span>
        )}
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <span className="field__label">ML-DSA-87 signature (hex, 4,627 bytes)</span>
        <textarea
          className="textarea"
          placeholder="0x… produced offline by the registered PQC signer"
          value={signature}
          onChange={(event) => {
            setSignature(event.target.value);
            setVerify({ status: "idle" });
          }}
          spellCheck={false}
        />
        <span className="field__hint">
          {signatureBytes > 0 ? `${signatureBytes.toLocaleString()} bytes · expected 4,627` : "The signature never leaves this page except in the transaction you submit."}
        </span>
      </div>

      <Notice>
        <strong>Sign offline.</strong> The registered PQC identity must produce this signature from its key file. Run the
        repository tooling on the signer host, then paste only the signature here:
        <pre className="code" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{signingCommand}</pre>
      </Notice>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={!message || !parsedSignature || verify.status === "checking"}
          onClick={verifySignature}
        >
          {verify.status === "checking" ? <span className="spinner" /> : null}
          Verify signature on chain
        </button>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={disabled || busy || !message || !parsedSignature || verify.status !== "valid"}
          onClick={() => {
            if (parsedSignature) onSubmit(parsedSignature, deadline);
          }}
        >
          {busy ? <span className="spinner" /> : null}
          {submitLabel}
        </button>
      </div>

      {verify.status === "valid" && (
        <div className="sig-status sig-status--ok" style={{ marginTop: 10 }}>
          <span className="dot" /> Signature accepted by 0x0A01 for this message and nonce.
        </div>
      )}
      {verify.status === "invalid" && (
        <div className="sig-status sig-status--bad" style={{ marginTop: 10 }}>
          <span className="dot" /> {verify.reason}
        </div>
      )}
      {disabled && disabledReason && (
        <p className="small muted" style={{ marginTop: 10 }}>{disabledReason}</p>
      )}
    </div>
  );
}
