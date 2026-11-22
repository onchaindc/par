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
      setRecordError(`The snapshot must be a future block (current ${bond.blockNumber.toString()}).`);
      return;
    }
    if (block <= lastRecordBlock) {
      setRecordError(`The snapshot must be later than ${lastRecordBlock.toString()}.`);
      return;
    }
    setRecordError(undefined);
    run(`Open interest round · block ${formatBlock(block)}`, () =>
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
          <div className="eyebrow">Manage</div>
          <h2 className="section-title">Run the bond</h2>
          <p className="section-sub">
            Open a round, approve the amount, then add the money. Every approval needs both the operating wallet
            and the separate approval key.
          </p>
        </div>
        <div className="btn-row">
          <Pill tone={isIssuer ? "ok" : "neutral"}>{isIssuer ? "Can manage" : "View only"}</Pill>
          <Pill tone={isTreasurer ? "ok" : "neutral"}>{isTreasurer ? "Can fund" : "Cannot fund"}</Pill>
        </div>
      </div>

      {!wallet.address ? (
        <Notice tone="warn" title="Connect the operating wallet" actions={<button type="button" className="btn btn--secondary btn--sm" onClick={onConnect}>Connect wallet</button>}>
          You can read everything without a wallet. Connect the wallet that runs the bond to make changes.
        </Notice>
      ) : !isIssuer && !isTreasurer ? (
        <Notice tone="warn" title="This wallet is view-only">
          It doesn't have permission to manage or fund the bond. You can still read every number. Switching to the
          operating wallet unlocks these actions.
        </Notice>
      ) : null}

      <Card
        title="What each step needs"
        hint="Two checks protect every change. Both must pass before money moves."
      >
        <div className="steps">
          <div className="step">
            <span className="step__num">1</span>
            <div>
              <div className="step__title">The right wallet</div>
              <div className="step__text">
                The operating wallet must have permission to manage or fund. It sends the transaction and pays the
                network fee.
              </div>
            </div>
          </div>
          <div className="step">
            <span className="step__num">2</span>
            <div>
              <div className="step__title">The second signature</div>
              <div className="step__text">
                The approval key <Address value={bond.pqcIssuer} chars={5} /> signs the exact amount offline. The
                key is {bond.keyStatus?.registered ? "registered" : "not registered"} and{" "}
                {bond.keyStatus?.possessionProven ? "verified" : "not verified"}.
              </div>
            </div>
          </div>
          <div className="step">
            <span className="step__num">3</span>
            <div>
              <div className="step__title">A one-time approval</div>
              <div className="step__text">
                Each approval works once and expires. An old signature can't be reused, and the approval key never
                sends a transaction. Approval {bond.nonce.toString()} is next.
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Open an interest round"
        hint="Choose a future block for the snapshot. It must be unique and later than the last round."
        actions={<Pill>{formatBlock(bond.blockNumber)} current block</Pill>}
      >
        <div className="form-row">
          <label className="field">
            <span className="field__label">Snapshot block</span>
            <input
              className="input"
              value={newRecordBlock}
              onChange={(event) => setNewRecordBlock(event.target.value)}
              inputMode="numeric"
              spellCheck={false}
            />
            <span className="field__hint">
              Defaults to 1,000 blocks ahead. Last snapshot:{" "}
              {lastRecordBlock > 0n ? formatBlock(lastRecordBlock) : "none"}.
            </span>
          </label>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!wallet.walletClient || !isIssuer || busy || !wallet.isCorrectChain}
            onClick={openPeriod}
          >
            Open round
          </button>
        </div>
        {recordError ? (
          <p className="small" style={{ color: "var(--danger)", marginTop: 10 }}>{recordError}</p>
        ) : null}
        {!isIssuer && wallet.address ? (
          <p className="small muted" style={{ marginTop: 10 }}>Only the operating wallet can open a round.</p>
        ) : null}
      </Card>

      {bond.periods.length === 0 ? (
        <Card title="Interest rounds">
          <Empty title="No rounds yet">
            Open the first round above. It can be approved once its snapshot block has passed.
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
    void tx.run(`Approve interest round ${period.id}`, () =>
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
    void tx.run(`Update snapshot · round ${period.id}`, () =>
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
      title={`Interest round ${period.id}`}
      hint={`Snapshot at block ${formatBlock(period.recordDateBlock)}${reached ? " · reached" : ` · ${formatBlock(period.recordDateBlock - bond.blockNumber)} blocks away`}`}
      actions={
        <Pill tone={period.finalized ? "ok" : reached ? "warn" : "neutral"}>
          {period.finalized ? "Paid" : reached ? "Ready to approve" : "Scheduled"}
        </Pill>
      }
    >
      {!period.finalized ? (
        <div className="stack" style={{ gap: 14 }}>
          <div className="panel">
            <div className="panel__title">Expected interest</div>
            <p className="mono">
              {formatToken(perToken, bond.paymentDecimals, 4)} {bond.paymentSymbol} per bond ·{" "}
              {formatToken(perToken * (bond.totalSupply / 10n ** 18n), bond.paymentDecimals, 2)} {bond.paymentSymbol} in total at
              today's supply
            </p>
            <p className="small muted" style={{ marginTop: 6 }}>
              The final amount is based on the supply at snapshot block{" "}
              {formatBlock(period.recordDateBlock)}.
            </p>
          </div>

          {!reached ? (
            <div className="form-row">
              <label className="field">
                <span className="field__label">Change snapshot block</span>
                <input
                  className="input"
                  value={recordDraft}
                  onChange={(event) => setRecordDraft(event.target.value)}
                  spellCheck={false}
                />
                <span className="field__hint">Only possible while the snapshot is still ahead.</span>
              </label>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={!wallet.walletClient || !isIssuer || busy || !wallet.isCorrectChain}
                onClick={updateRecordDate}
              >
                Update snapshot
              </button>
            </div>
          ) : (
            <PqcPanel
              title="Approve this round"
              description="Review the amount, add the signature from the approval key, check it, then send from the operating wallet."
              loadMessage={loadFinalizeMessage}
              onSubmit={finalize}
              submitLabel="Approve round"
              disabled={!isIssuer || !wallet.isCorrectChain}
              disabledReason={
                !wallet.address
                  ? "Connect the operating wallet."
                  : !isIssuer
                    ? "This wallet cannot manage the bond."
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
              <div className="field__label">Interest per bond</div>
              <p className="num" style={{ marginTop: 6 }}>{formatToken(period.couponPerToken, bond.paymentDecimals, 4)} {bond.paymentSymbol}</p>
            </div>
            <div>
              <div className="field__label">Needed in total</div>
              <p className="num" style={{ marginTop: 6 }}>{formatToken(period.required, bond.paymentDecimals, 2)} {bond.paymentSymbol}</p>
            </div>
            <div>
              <div className="field__label">Funded so far</div>
              <p className="num" style={{ marginTop: 6 }}>{formatToken(period.funded, bond.paymentDecimals, 2)} {bond.paymentSymbol}</p>
            </div>
          </div>
          <div className="progress" aria-label={`Period ${period.id} funding progress`}>
            <div className="progress__bar" style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
          <div className="btn-row" style={{ justifyContent: "space-between" }}>
            <span className="small muted">{progress.toFixed(1)}% funded · {formatToken(remaining > 0n ? remaining : 0n, bond.paymentDecimals, 2)} {bond.paymentSymbol} still to add</span>
            {period.funded >= period.required ? <Pill tone="ok">Funded · collections open</Pill> : <Pill tone="warn">Waiting for funds</Pill>}
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
                  : Promise.reject(new Error("Connect the wallet that adds funds."))
              }
              onFund={(amount) => {
                if (!wallet.walletClient || !wallet.address) return Promise.reject(new Error("Connect the wallet that adds funds."));
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
      <div className="panel__title">Add money to this round</div>
      <p className="small muted" style={{ marginBottom: 10 }}>
        You can add part of the amount now and the rest later. The contract won't accept more than needed.
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
        <p className="small muted" style={{ marginTop: 8 }}>This wallet cannot add funds.</p>
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
        throw new Error("Snapshot block must be a number.");
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
    void tx.run("Declare principal", () =>
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
      title="Principal"
      hint="After maturity, declare it once, fund it once, then each holder collects once."
      actions={
        <Pill tone={bond.redemption.declared ? "ok" : maturityReached ? "warn" : "neutral"}>
          {bond.redemption.declared ? "Open" : maturityReached ? "Ready to declare" : "Before maturity"}
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
              <div className="field__label">Time left</div>
              <p className="num" style={{ marginTop: 6 }}>{relativeTime(bond.terms.maturity)}</p>
            </div>
            <div>
              <div className="field__label">Principal per bond</div>
              <p className="num" style={{ marginTop: 6 }}>{formatToken(bond.terms.faceValuePerToken, bond.paymentDecimals, 2)} {bond.paymentSymbol}</p>
            </div>
          </div>
          {!maturityReached ? (
            <Notice tone="warn" title="Not open until maturity">
              Principal can only be declared on or after {formatDate(bond.terms.maturity)}. Until then this section
              is read-only.
            </Notice>
          ) : null}
          <div className="form-row">
            <label className="field">
              <span className="field__label">Snapshot block</span>
              <input className="input" value={recordBlock} onChange={(event) => setRecordBlock(event.target.value)} spellCheck={false} />
              <span className="field__hint">Use a past block. Each holder's share is based on their balance then.</span>
            </label>
          </div>
          <PqcPanel
            title="Declare principal"
            description="The message pins the snapshot, the amount per bond and the deadline. Sign it with the approval key, check it, then send."
            loadMessage={loadRedemptionMessage}
            onSubmit={declare}
            submitLabel="Declare principal"
            disabled={!isIssuer || !maturityReached || !wallet.isCorrectChain}
            disabledReason={
              !maturityReached
                ? "Maturity hasn't been reached yet."
                : !isIssuer
                  ? "This wallet cannot manage the bond."
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
              <div className="field__label">Snapshot block</div>
              <p className="num" style={{ marginTop: 6 }}>{formatBlock(bond.redemption.recordDateBlock)}</p>
            </div>
            <div>
              <div className="field__label">Needed in total</div>
              <p className="num" style={{ marginTop: 6 }}>{formatToken(bond.redemption.required, bond.paymentDecimals, 2)} {bond.paymentSymbol}</p>
            </div>
            <div>
              <div className="field__label">Funded so far</div>
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
                  : Promise.reject(new Error("Connect the wallet that adds funds."))
              }
              onFund={(amount) => {
                if (!wallet.walletClient || !wallet.address) return Promise.reject(new Error("Connect the wallet that adds funds."));
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

