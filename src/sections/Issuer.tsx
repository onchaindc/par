import { useCallback, useMemo, useState } from "react";
import { parseUnits } from "viem";
import { ADDRESSES, qoreChain } from "../config";
import { paymentTokenAbi, servicingAbi } from "../abis";
import type { AccountData } from "../hooks/useAccountData";
import type { BondData, Period } from "../hooks/useBondData";
import type { WalletState } from "../hooks/useWallet";
import type { useTx } from "../hooks/useTx";
import { publicClient } from "../lib/chain";
import {
  couponPerToken,
  formatBlock,
  formatDate,
  formatToken,
  relativeTime,
} from "../lib/format";
import { Address, Card, Empty, Notice, Pill } from "../components/ui";
import { PqcPanel } from "../components/PqcPanel";

type Tx = ReturnType<typeof useTx>;

export function Issuer({
  bond,
  account,
  wallet,
  tx,
  refreshAll,
  onConnect,
}: {
  bond: BondData;
  account: AccountData | null;
  wallet: WalletState;
  tx: Tx;
  refreshAll: () => void;
  onConnect: () => void;
}) {
  const now = Math.floor(Date.now() / 1000);
  const perToken = couponPerToken(
    bond.terms.faceValuePerToken,
    bond.terms.couponRateBps,
    bond.terms.paymentsPerYear,
  );
  const busy = tx.status === "signing" || tx.status === "pending";
  const lastRecordBlock = bond.periods.length
    ? bond.periods[bond.periods.length - 1].recordDateBlock
    : 0n;

  const [newRecordBlock, setNewRecordBlock] = useState(() =>
    (bond.blockNumber + 1_000n).toString(),
  );
  const [recordError, setRecordError] = useState<string>();

  const run = (label: string, send: () => Promise<`0x${string}`>) => {
    void tx.run(label, send, refreshAll);
  };

  const openPeriod = () => {
    if (!wallet.walletClient || !wallet.address) return;
    let block: bigint;
    try {
      block = BigInt(newRecordBlock.trim());
    } catch {
      setRecordError("Enter a valid block number.");
      return;
    }
    if (block <= bond.blockNumber) {
      setRecordError(`The record date must be a future block (current ${bond.blockNumber.toString()}).`);
      return;
    }
    if (block <= lastRecordBlock) {
      setRecordError(`The record date must be later than ${lastRecordBlock.toString()}.`);
      return;
    }
    setRecordError(undefined);
    run(`Open coupon period · block ${formatBlock(block)}`, () =>
      wallet.walletClient!.writeContract({
        address: ADDRESSES.servicing,
        abi: servicingAbi,
        functionName: "openCouponPeriod",
        args: [block],
        account: wallet.address!,
        chain: qoreChain,
      }),
    );
  };

  const isIssuer = account?.isIssuer ?? false;
  const isTreasurer = account?.isTreasurer ?? false;

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <div className="eyebrow">Issuer operations</div>
          <h2 className="section-title">Schedule, finalize, fund</h2>
          <p className="section-sub">
            Sensitive actions require both the operational <span className="mono">ISSUER_ROLE</span> and a fresh
            ML-DSA-87 signature from the registered PQC identity. Funding requires{" "}
            <span className="mono">TREASURER_ROLE</span>.
          </p>
        </div>
        <div className="btn-row">
          <Pill tone={isIssuer ? "ok" : "neutral"}>{isIssuer ? "Issuer role" : "No issuer role"}</Pill>
          <Pill tone={isTreasurer ? "ok" : "neutral"}>{isTreasurer ? "Treasurer role" : "No treasurer role"}</Pill>
        </div>
      </div>

      {!wallet.address ? (
        <Notice tone="warn" icon="!">
          Connect the operational EVM issuer wallet to act. This page remains readable without a wallet, but no
          transaction can be submitted. <button type="button" className="btn btn--ghost" onClick={onConnect}>Connect wallet</button>
        </Notice>
      ) : !isIssuer && !isTreasurer ? (
        <Notice tone="warn" icon="!">
          The connected address holds neither <span className="mono">ISSUER_ROLE</span> nor{" "}
          <span className="mono">TREASURER_ROLE</span> on this servicing contract. Operations are read-only for this
          wallet; the PQC identity must never be used as a workaround.
        </Notice>
      ) : null}

      <Card
        title="Authorization requirements"
        hint="What the chain will require for each sensitive operation."
      >
        <div className="steps">
          <div className="step">
            <span className="step__num">1</span>
            <div>
              <div className="step__title">Operational role</div>
              <div className="step__text">
                The submitting wallet must hold <span className="mono">ISSUER_ROLE</span> (finalization,
                declaration) or <span className="mono">TREASURER_ROLE</span> (funding). It pays gas and needs its
                own registered PQC key and an open EVM window to transact.
              </div>
            </div>
          </div>
          <div className="step">
            <span className="step__num">2</span>
            <div>
              <div className="step__title">PQC signature</div>
              <div className="step__text">
                The registered PQC identity <Address value={bond.pqcIssuer} chars={5} /> signs the exact message
                returned by the contract. Its key is {bond.keyStatus?.registered ? "registered" : "not registered"} on
                0x0A02, algorithm {bond.keyStatus?.algorithmId ?? "—"},{" "}
                {bond.keyStatus?.possessionProven ? "possession proven" : "possession not proven"}.
              </div>
            </div>
          </div>
          <div className="step">
            <span className="step__num">3</span>
            <div>
              <div className="step__title">Nonce and deadline</div>
              <div className="step__text">
                The message binds chain 9800, this servicing contract, the bond, the PQC identity, the action, nonce{" "}
                <span className="mono">{bond.nonce.toString()}</span> and a deadline. Finalizing consumes the nonce;
                a stale signature cannot be replayed. The PQC identity never sends the transaction.
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Open a coupon period"
        hint="Record dates are block numbers, not timestamps. The date must be in the future, unique, and later than the previous period's record date."
        actions={<Pill>{formatBlock(bond.blockNumber)} current block</Pill>}
      >
        <div className="form-row">
          <label className="field">
            <span className="field__label">Record-date block</span>
            <input
              className="input"
              value={newRecordBlock}
              onChange={(event) => setNewRecordBlock(event.target.value)}
              inputMode="numeric"
              spellCheck={false}
            />
            <span className="field__hint">
              Default is current + 1,000 blocks. Previous record date:{" "}
              {lastRecordBlock > 0n ? formatBlock(lastRecordBlock) : "none"}.
            </span>
          </label>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!wallet.walletClient || !isIssuer || busy || !wallet.isCorrectChain}
            onClick={openPeriod}
          >
            Open period
          </button>
        </div>
        {recordError ? (
          <p className="small" style={{ color: "var(--danger)", marginTop: 10 }}>{recordError}</p>
        ) : null}
        {!isIssuer && wallet.address ? (
          <p className="small muted" style={{ marginTop: 10 }}>Requires ISSUER_ROLE.</p>
        ) : null}
      </Card>

      {bond.periods.length === 0 ? (
        <Card title="Coupon periods">
          <Empty title="No periods yet">
            Open the first coupon period above. A period can be finalized only after its record-date block has been
            produced.
          </Empty>
        </Card>
      ) : (
        <div className="stack">
          {bond.periods.map((period) => (
            <PeriodCard
              key={period.id}
              period={period}
              bond={bond}
              wallet={wallet}
              tx={tx}
              busy={busy}
              isIssuer={isIssuer}
              isTreasurer={isTreasurer}
              allowance={account?.allowance ?? 0n}
              perToken={perToken}
              refreshAll={refreshAll}
            />
          ))}
        </div>
      )}

      <RedemptionCard
        bond={bond}
        wallet={wallet}
        tx={tx}
        busy={busy}
        isIssuer={isIssuer}
        isTreasurer={isTreasurer}
        allowance={account?.allowance ?? 0n}
        refreshAll={refreshAll}
        now={now}
      />
    </div>
  );
}

function PeriodCard({
  period,
  bond,
  wallet,
  tx,
  busy,
  isIssuer,
  isTreasurer,
  allowance,
  perToken,
  refreshAll,
}: {
  period: Period;
  bond: BondData;
  wallet: WalletState;
  tx: Tx;
  busy: boolean;
  isIssuer: boolean;
  isTreasurer: boolean;
  allowance: bigint;
  perToken: bigint;
  refreshAll: () => void;
}) {
  const reached = bond.blockNumber > period.recordDateBlock;
  const remaining = period.required - period.funded;
  const progress = period.required > 0n ? Number((period.funded * 10_000n) / period.required) / 100 : 0;

  const loadFinalizeMessage = useCallback(
    async (deadline: bigint) =>
      publicClient.readContract({
        address: ADDRESSES.servicing,
        abi: servicingAbi,
        functionName: "couponFinalizationMessage",
        args: [BigInt(period.id), deadline],
      }),
    [period.id],
  );

  const signingCommand = `cd tools/pqc-sign
npm run authorize -- \\
  --issuer ${bond.pqcIssuer} \\
  --key-file <registered-signer-key>.dilithium \\
  --servicing ${ADDRESSES.servicing} \\
  --period-id ${period.id} --deadline <deadline>`;

  const finalize = (signature: `0x${string}`, deadline: bigint) => {
    if (!wallet.walletClient || !wallet.address) return;
    void tx.run(`Finalize coupon period ${period.id}`, () =>
      wallet.walletClient!.writeContract({
        address: ADDRESSES.servicing,
        abi: servicingAbi,
        functionName: "finalizeCoupon",
        args: [BigInt(period.id), deadline, signature],
        account: wallet.address!,
        chain: qoreChain,
      }),
      refreshAll,
    );
  };

  const [recordDraft, setRecordDraft] = useState(period.recordDateBlock.toString());
  const updateRecordDate = () => {
    if (!wallet.walletClient || !wallet.address) return;
    let block: bigint;
    try {
      block = BigInt(recordDraft.trim());
    } catch {
      return;
    }
    void tx.run(`Update record date · period ${period.id}`, () =>
      wallet.walletClient!.writeContract({
        address: ADDRESSES.servicing,
        abi: servicingAbi,
        functionName: "setCouponRecordDate",
        args: [BigInt(period.id), block],
        account: wallet.address!,
        chain: qoreChain,
      }),
      refreshAll,
    );
  };

  return (
    <Card
      title={`Coupon period ${period.id}`}
      hint={`Record-date block ${formatBlock(period.recordDateBlock)}${reached ? " · reached" : ` · ${formatBlock(period.recordDateBlock - bond.blockNumber)} blocks away`}`}
      actions={
        <Pill tone={period.finalized ? "ok" : reached ? "warn" : "neutral"}>
          {period.finalized ? "Finalized" : reached ? "Ready to finalize" : "Scheduled"}
        </Pill>
      }
    >
      {!period.finalized ? (
        <div className="stack" style={{ gap: 14 }}>
          <div className="panel">
            <div className="panel__title">Expected coupon</div>
            <p className="mono">
              {formatToken(perToken, bond.paymentDecimals, 4)} {bond.paymentSymbol} per token ·{" "}
              {formatToken(perToken * (bond.totalSupply / 10n ** 18n), bond.paymentDecimals, 2)} {bond.paymentSymbol} at
              current supply
            </p>
            <p className="small muted" style={{ marginTop: 6 }}>
              The amount is fixed at finalization from supply checkpointed at block{" "}
              {formatBlock(period.recordDateBlock)}.
            </p>
          </div>

          {!reached ? (
            <div className="form-row">
              <label className="field">
                <span className="field__label">Change record-date block</span>
                <input
                  className="input"
                  value={recordDraft}
                  onChange={(event) => setRecordDraft(event.target.value)}
                  spellCheck={false}
                />
                <span className="field__hint">Allowed only while the current record date is still in the future.</span>
              </label>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={!wallet.walletClient || !isIssuer || busy || !wallet.isCorrectChain}
                onClick={updateRecordDate}
              >
                Update date
              </button>
            </div>
          ) : (
            <PqcPanel
              title="Finalize with ML-DSA-87 authorization"
              description="Review the exact message, paste the isolated signer's signature, verify it on chain, then submit from the operational issuer."
              loadMessage={loadFinalizeMessage}
              onSubmit={finalize}
              submitLabel="Finalize coupon"
              disabled={!isIssuer || !wallet.isCorrectChain}
              disabledReason={
                !wallet.address
                  ? "Connect the operational issuer wallet."
                  : !isIssuer
                    ? "This wallet does not hold ISSUER_ROLE."
                    : !wallet.isCorrectChain
                      ? "Switch to QoreChain testnet first."
                      : undefined
              }
              signingCommand={signingCommand}
              nonce={bond.nonce}
              pqcIssuer={bond.pqcIssuer}
              messageLabel="couponFinalizationMessage"
              busy={busy}
            />
          )}
        </div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <div className="grid grid--3">
            <div>
              <div className="field__label">Coupon per token</div>
              <p className="num" style={{ marginTop: 6 }}>{formatToken(period.couponPerToken, bond.paymentDecimals, 4)} {bond.paymentSymbol}</p>
            </div>
            <div>
              <div className="field__label">Required funding</div>
              <p className="num" style={{ marginTop: 6 }}>{formatToken(period.required, bond.paymentDecimals, 2)} {bond.paymentSymbol}</p>
            </div>
            <div>
              <div className="field__label">Funded</div>
              <p className="num" style={{ marginTop: 6 }}>{formatToken(period.funded, bond.paymentDecimals, 2)} {bond.paymentSymbol}</p>
            </div>
          </div>
          <div className="progress" aria-label={`Period ${period.id} funding progress`}>
            <div className="progress__bar" style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
          <div className="btn-row" style={{ justifyContent: "space-between" }}>
            <span className="small muted">{progress.toFixed(1)}% funded · {formatToken(remaining > 0n ? remaining : 0n, bond.paymentDecimals, 2)} {bond.paymentSymbol} outstanding</span>
            {period.funded >= period.required ? <Pill tone="ok">Fully funded · claims open</Pill> : <Pill tone="warn">Funding open</Pill>}
          </div>
          {period.funded < period.required && (
            <FundForm
              symbol={bond.paymentSymbol}
              decimals={bond.paymentDecimals}
              remaining={remaining}
              allowance={allowance}
              wallet={wallet}
              busy={busy}
              canFund={isTreasurer}
              onApprove={(amount) =>
                wallet.walletClient && wallet.address
                  ? wallet.walletClient.writeContract({
                      address: ADDRESSES.paymentToken,
                      abi: paymentTokenAbi,
                      functionName: "approve",
                      args: [ADDRESSES.servicing, amount],
                      account: wallet.address,
                      chain: qoreChain,
                    })
                  : Promise.reject(new Error("Connect the treasurer wallet."))
              }
              onFund={(amount) => {
                if (!wallet.walletClient || !wallet.address) return Promise.reject(new Error("Connect the treasurer wallet."));
                return wallet.walletClient.writeContract({
                  address: ADDRESSES.servicing,
                  abi: servicingAbi,
                  functionName: "fundCoupon",
                  args: [BigInt(period.id), amount],
                  account: wallet.address,
                  chain: qoreChain,
                });
              }}
              run={(label, send) => void tx.run(label, send, refreshAll)}
            />
          )}
        </div>
      )}
    </Card>
  );
}

function FundForm({
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
      <div className="panel__title">Fund this period</div>
      <p className="small muted" style={{ marginBottom: 10 }}>
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
      {localError ? <p className="small" style={{ color: "var(--danger)", marginTop: 8 }}>{localError}</p> : null}
      {!canFund && wallet.address ? (
        <p className="small muted" style={{ marginTop: 8 }}>Funding requires TREASURER_ROLE.</p>
      ) : null}
    </div>
  );
}

function RedemptionCard({
  bond,
  wallet,
  tx,
  busy,
  isIssuer,
  isTreasurer,
  allowance,
  refreshAll,
  now,
}: {
  bond: BondData;
  wallet: WalletState;
  tx: Tx;
  busy: boolean;
  isIssuer: boolean;
  isTreasurer: boolean;
  allowance: bigint;
  refreshAll: () => void;
  now: number;
}) {
  const maturityReached = BigInt(now) >= bond.terms.maturity;
  const [recordBlock, setRecordBlock] = useState(() => (bond.blockNumber - 1n).toString());

  const loadRedemptionMessage = useCallback(
    async (deadline: bigint) => {
      let block: bigint;
      try {
        block = BigInt(recordBlock.trim());
      } catch {
        throw new Error("Record-date block must be a number.");
      }
      return publicClient.readContract({
        address: ADDRESSES.servicing,
        abi: servicingAbi,
        functionName: "redemptionDeclarationMessage",
        args: [block, deadline],
      });
    },
    [recordBlock],
  );

  const declare = (signature: `0x${string}`, deadline: bigint) => {
    if (!wallet.walletClient || !wallet.address) return;
    let block: bigint;
    try {
      block = BigInt(recordBlock.trim());
    } catch {
      return;
    }
    void tx.run("Declare principal redemption", () =>
      wallet.walletClient!.writeContract({
        address: ADDRESSES.servicing,
        abi: servicingAbi,
        functionName: "declareRedemption",
        args: [block, deadline, signature],
        account: wallet.address!,
        chain: qoreChain,
      }),
      refreshAll,
    );
  };

  const remaining = bond.redemption.required - bond.redemption.funded;

  return (
    <Card
      title="Principal redemption"
      hint="One declaration after maturity, one funding pool, one claim per holder."
      actions={
        <Pill tone={bond.redemption.declared ? "ok" : maturityReached ? "warn" : "neutral"}>
          {bond.redemption.declared ? "Declared" : maturityReached ? "Maturity reached" : "Before maturity"}
        </Pill>
      }
    >
      {!bond.redemption.declared ? (
        <div className="stack" style={{ gap: 14 }}>
          <div className="grid grid--3">
            <div>
              <div className="field__label">Maturity</div>
              <p className="num" style={{ marginTop: 6 }}>{formatDate(bond.terms.maturity)}</p>
            </div>
            <div>
              <div className="field__label">Countdown</div>
              <p className="num" style={{ marginTop: 6 }}>{relativeTime(bond.terms.maturity)}</p>
            </div>
            <div>
              <div className="field__label">Principal per token</div>
              <p className="num" style={{ marginTop: 6 }}>{formatToken(bond.terms.faceValuePerToken, bond.paymentDecimals, 2)} {bond.paymentSymbol}</p>
            </div>
          </div>
          {!maturityReached ? (
            <Notice tone="warn" icon="!">
              The contract rejects <span className="mono">declareRedemption</span> before maturity. This action is
              shown for completeness and is disabled until {formatDate(bond.terms.maturity)}.
            </Notice>
          ) : null}
          <div className="form-row">
            <label className="field">
              <span className="field__label">Record-date block</span>
              <input className="input" value={recordBlock} onChange={(event) => setRecordBlock(event.target.value)} spellCheck={false} />
              <span className="field__hint">Must be a past block (defaults to the latest block). Entitlements use balances at this block.</span>
            </label>
          </div>
          <PqcPanel
            title="Declare with ML-DSA-87 authorization"
            description="The message commits to the record-date block, principal per token, required funding and deadline. Sign it with the registered PQC key."
            loadMessage={loadRedemptionMessage}
            onSubmit={declare}
            submitLabel="Declare redemption"
            disabled={!isIssuer || !maturityReached || !wallet.isCorrectChain}
            disabledReason={
              !maturityReached
                ? "Maturity has not been reached."
                : !isIssuer
                  ? "This wallet does not hold ISSUER_ROLE."
                  : !wallet.isCorrectChain
                    ? "Switch to QoreChain testnet first."
                    : undefined
            }
            signingCommand={`Sign redemptionDeclarationMessage(<record-block>, <deadline>) with the registered
ML-DSA-87 key. This repo's authorize.mjs currently covers coupon finalization;
use an ML-DSA-87 signer over the exact message bytes shown above.`}
            nonce={bond.nonce}
            pqcIssuer={bond.pqcIssuer}
            messageLabel="redemptionDeclarationMessage"
            busy={busy}
          />
        </div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <div className="grid grid--3">
            <div>
              <div className="field__label">Record-date block</div>
              <p className="num" style={{ marginTop: 6 }}>{formatBlock(bond.redemption.recordDateBlock)}</p>
            </div>
            <div>
              <div className="field__label">Required funding</div>
              <p className="num" style={{ marginTop: 6 }}>{formatToken(bond.redemption.required, bond.paymentDecimals, 2)} {bond.paymentSymbol}</p>
            </div>
            <div>
              <div className="field__label">Funded</div>
              <p className="num" style={{ marginTop: 6 }}>{formatToken(bond.redemption.funded, bond.paymentDecimals, 2)} {bond.paymentSymbol}</p>
            </div>
          </div>
          {bond.redemption.funded < bond.redemption.required && (
            <FundForm
              symbol={bond.paymentSymbol}
              decimals={bond.paymentDecimals}
              remaining={remaining}
              allowance={allowance}
              wallet={wallet}
              busy={busy}
              canFund={isTreasurer}
              onApprove={(amount) =>
                wallet.walletClient && wallet.address
                  ? wallet.walletClient.writeContract({
                      address: ADDRESSES.paymentToken,
                      abi: paymentTokenAbi,
                      functionName: "approve",
                      args: [ADDRESSES.servicing, amount],
                      account: wallet.address,
                      chain: qoreChain,
                    })
                  : Promise.reject(new Error("Connect the treasurer wallet."))
              }
              onFund={(amount) => {
                if (!wallet.walletClient || !wallet.address) return Promise.reject(new Error("Connect the treasurer wallet."));
                return wallet.walletClient.writeContract({
                  address: ADDRESSES.servicing,
                  abi: servicingAbi,
                  functionName: "fundRedemption",
                  args: [amount],
                  account: wallet.address,
                  chain: qoreChain,
                });
              }}
              run={(label, send) => void tx.run(label, send, refreshAll)}
            />
          )}
        </div>
      )}
    </Card>
  );
}

