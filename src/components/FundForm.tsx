import { useMemo, useState } from "react";
import { parseUnits } from "viem";
import type { WalletState } from "../hooks/useWallet";
import { formatToken } from "../lib/format";

export function FundForm({
  symbol,
  decimals,
  remaining,
  allowance,
  wallet,
  busy,
  canFund,
  onApprove,
  onFund,
  run,
}: {
  symbol: string;
  decimals: number;
  remaining: bigint;
  allowance: bigint;
  wallet: WalletState;
  busy: boolean;
  canFund: boolean;
  onApprove: (amount: bigint) => Promise<`0x${string}`>;
  onFund: (amount: bigint) => Promise<`0x${string}`>;
  run: (label: string, send: () => Promise<`0x${string}`>) => void;
}) {
  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState<string>();

  const parsed = useMemo(() => {
    try {
      return amount.trim() ? parseUnits(amount.trim(), decimals) : 0n;
    } catch {
      return null;
    }
  }, [amount, decimals]);

  const needsApproval = parsed !== null && parsed > 0n && allowance < parsed;
  const disabled = !wallet.walletClient || !canFund || busy || !wallet.isCorrectChain;

  return (
    <div className="panel">
      <div className="panel__title">Fund this distribution</div>
      <p className="panel__text">
        Partial top-ups are allowed; over-funding is rejected on chain. The treasurer must hold {symbol}.
      </p>
      <div className="form-row">
        <label className="field">
          <span className="field__label">Amount ({symbol})</span>
          <input
            className="input"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setLocalError(undefined);
            }}
            placeholder="0.00"
            inputMode="decimal"
          />
          <span className="field__hint">
            Remaining: {formatToken(remaining, decimals, 4)} {symbol} · allowance{" "}
            {formatToken(allowance, decimals, 2)}
          </span>
        </label>
        {needsApproval ? (
          <button
            type="button"
            className="btn btn--secondary"
            disabled={disabled}
            onClick={() => {
              if (parsed === null || parsed <= 0n) {
                setLocalError("Enter a positive amount.");
                return;
              }
              run(`Approve ${symbol}`, () => onApprove(parsed));
            }}
          >
            Approve {symbol}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            disabled={disabled || parsed === null || parsed <= 0n}
            onClick={() => {
              if (parsed === null || parsed <= 0n) {
                setLocalError("Enter a positive amount.");
                return;
              }
              if (parsed > remaining) {
                setLocalError(`Amount exceeds the ${formatToken(remaining, decimals, 4)} ${symbol} requirement.`);
                return;
              }
              run(`Fund ${symbol}`, () => onFund(parsed));
            }}
          >
            Fund
          </button>
        )}
      </div>
      {localError ? <p className="form-error">{localError}</p> : null}
      {!canFund && wallet.address ? <p className="form-hint">Funding requires TREASURER_ROLE.</p> : null}
    </div>
  );
}
