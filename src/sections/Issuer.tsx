import { useState } from "react";
import { ADDRESSES, qoreChain } from "../config";
import { servicingAbi } from "../abis";
import type { AccountData } from "../hooks/useAccountData";
import type { BondData } from "../hooks/useBondData";
import type { WalletState } from "../hooks/useWallet";
import type { useTx } from "../hooks/useTx";
import { couponPerToken, formatBlock, formatToken } from "../lib/format";
import { Address, Card, Empty, Notice, PageHeader, Pill } from "../components/ui";
import { IconShield } from "../components/icons";
import { PeriodCard } from "./IssuerPeriod";
import { RedemptionCard } from "./IssuerRedemption";

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
  const lastRecordBlock = bond.periods.length ? bond.periods[bond.periods.length - 1].recordDateBlock : 0n;
  const isIssuer = account?.isIssuer ?? false;
  const isTreasurer = account?.isTreasurer ?? false;

  const [newRecordBlock, setNewRecordBlock] = useState(() => (bond.blockNumber + 1_000n).toString());
  const [recordError, setRecordError] = useState<string>();

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
    void tx.run(`Open coupon period · block ${formatBlock(block)}`, () =>
      wallet.walletClient!.writeContract({
        address: ADDRESSES.servicing,
        abi: servicingAbi,
        functionName: "openCouponPeriod",
        args: [block],
        account: wallet.address!,
        chain: qoreChain,
      }),
      refreshAll,
    );
  };

  return (
    <div className="stack stack--lg">
      <PageHeader
        eyebrow="Issuer operations"
        title="Schedule, finalize, fund"
        description="Sensitive actions require both the operational ISSUER_ROLE and a fresh ML-DSA-87 signature from the registered PQC identity. Funding requires TREASURER_ROLE."
        actions={
          <div className="role-pills">
            <Pill tone={isIssuer ? "ok" : "neutral"}>{isIssuer ? "Issuer role" : "No issuer role"}</Pill>
            <Pill tone={isTreasurer ? "ok" : "neutral"}>{isTreasurer ? "Treasurer role" : "No treasurer role"}</Pill>
          </div>
        }
      />

      {!wallet.address ? (
        <Notice tone="warn" title="Read-only until a wallet is connected">
          Connect the operational EVM issuer wallet to act. This page remains readable without a wallet.
          <button type="button" className="link-btn" onClick={onConnect}>
            Connect wallet
          </button>
        </Notice>
      ) : !isIssuer && !isTreasurer ? (
        <Notice tone="warn" title="This wallet has no operational role">
          The connected address holds neither ISSUER_ROLE nor TREASURER_ROLE on this servicing contract. Operations
          are read-only; the PQC identity must never be used as a workaround.
        </Notice>
      ) : null}

      <Card
        title="Authorization requirements"
        hint="What the chain requires for each sensitive operation."
        actions={<span className="card-icon"><IconShield size={16} /></span>}
      >
        <div className="step-list step-list--inline">
          <div className="step-list__item">
            <span className="step-list__num">1</span>
            <div>
              <div className="step-list__title">Operational role</div>
              <div className="step-list__text">
                The submitting wallet holds ISSUER_ROLE (finalization, declaration) or TREASURER_ROLE (funding). It
                pays gas and needs its own PQC key and an open EVM authorization window.
              </div>
            </div>
          </div>
          <div className="step-list__item">
            <span className="step-list__num">2</span>
            <div>
              <div className="step-list__title">PQC signature</div>
              <div className="step-list__text">
                <Address value={bond.pqcIssuer} chars={5} /> signs the exact message returned by the contract. Key{" "}
                {bond.keyStatus?.registered ? "registered" : "not registered"} on 0x0A02, algorithm{" "}
                {bond.keyStatus?.algorithmId ?? "—"},{" "}
                {bond.keyStatus?.possessionProven ? "possession proven" : "possession not proven"}.
              </div>
            </div>
          </div>
          <div className="step-list__item">
            <span className="step-list__num">3</span>
            <div>
              <div className="step-list__title">Nonce and deadline</div>
              <div className="step-list__text">
                The message binds chain 9800, the servicing contract, the bond, the PQC identity, the action, nonce{" "}
                <span className="mono">{bond.nonce.toString()}</span> and a deadline. Finalizing consumes the nonce.
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
        {recordError ? <p className="form-error">{recordError}</p> : null}
        {!isIssuer && wallet.address ? <p className="form-hint">Requires ISSUER_ROLE.</p> : null}
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

      <Card title="Allocated bond supply" hint="Minting is capped on chain and requires MINTER_ROLE.">
        <div className="detail-grid">
          <div className="detail-item">
            <span className="field__label">Current supply</span>
            <span className="num detail-item__value">
              {formatToken(bond.totalSupply, bond.decimals, 0)} {bond.symbol}
            </span>
          </div>
          <div className="detail-item">
            <span className="field__label">Authorised cap</span>
            <span className="num detail-item__value">
              {formatToken(bond.cap, bond.decimals, 0)} {bond.symbol}
            </span>
          </div>
          <div className="detail-item">
            <span className="field__label">Coupon at current supply</span>
            <span className="num detail-item__value">
              {formatToken(
                (bond.totalSupply * perToken) / 10n ** 18n,
                bond.paymentDecimals,
                2,
              )}{" "}
              {bond.paymentSymbol}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
