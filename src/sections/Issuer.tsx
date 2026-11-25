import { useMemo, useState } from "react";
import { parseUnits } from "viem";
import { ADDRESSES, qoreChain } from "../config";
import { bondTokenAbi, servicingAbi } from "../abis";
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
  const isMinter = account?.isMinter ?? false;

  const [newRecordBlock, setNewRecordBlock] = useState(() => (bond.blockNumber + 1_000n).toString());
  const [recordError, setRecordError] = useState<string>();

  // Issuance front door: mint bond tokens to investors.
  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [mintError, setMintError] = useState<string>();
  const mintParsed = useMemo(() => {
    try {
      return mintAmount.trim() ? parseUnits(mintAmount.trim(), bond.decimals) : 0n;
    } catch {
      return null;
    }
  }, [mintAmount, bond.decimals]);

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

  const mintTokens = () => {
    if (!wallet.walletClient || !wallet.address) return;
    if (!/^0x[0-9a-fA-F]{40}$/.test(mintTo.trim())) {
      setMintError("Enter a valid 0x recipient address.");
      return;
    }
    if (mintParsed === null || mintParsed === 0n) {
      setMintError("Enter a valid amount.");
      return;
    }
    if (bond.totalSupply + mintParsed > bond.cap) {
      setMintError(
        `Cap exceeded: supply ${formatToken(bond.totalSupply, bond.decimals, 0)} + ${mintAmount.trim()} > cap ${formatToken(bond.cap, bond.decimals, 0)}.`,
      );
      return;
    }
    setMintError(undefined);
    void tx.run(`Mint ${mintAmount.trim()} ${bond.symbol}`, () =>
      wallet.walletClient!.writeContract({
        address: ADDRESSES.bond,
        abi: bondTokenAbi,
        functionName: "mint",
        args: [mintTo.trim() as `0x${string}`, mintParsed],
        account: wallet.address!,
        chain: qoreChain,
      }),
      refreshAll,
    );
  };

  return (
    <div className="stack stack--lg">
      <PageHeader
        eyebrow="Issuer"
        title="Schedule & finalize"
        description="Open coupon periods, finalize them with a post-quantum signature, and fund payouts."
        actions={
          <div className="role-pills">
            <Pill tone={isIssuer ? "ok" : "neutral"}>{isIssuer ? "Issuer" : "No issuer role"}</Pill>
            <Pill tone={isTreasurer ? "ok" : "neutral"}>{isTreasurer ? "Treasurer" : "No treasurer role"}</Pill>
          </div>
        }
      />

      {!wallet.address ? (
        <Notice tone="warn" title="Read-only for now">
          Connect the operations wallet to make changes.
          <button type="button" className="link-btn" onClick={onConnect}>
            Connect wallet
          </button>
        </Notice>
      ) : !isIssuer && !isTreasurer ? (
        <Notice tone="warn" title="No permissions on this wallet">
          This address has no issuer or treasurer role, so everything here is read-only.
        </Notice>
      ) : null}

      <Card
        title="How approval works"
        actions={<span className="card-icon"><IconShield size={16} /></span>}
      >
        <div className="step-list step-list--inline">
          <div className="step-list__item">
            <span className="step-list__num">1</span>
            <div>
              <div className="step-list__title">Your wallet</div>
              <div className="step-list__text">The operations wallet submits and pays gas.</div>
            </div>
          </div>
          <div className="step-list__item">
            <span className="step-list__num">2</span>
            <div>
              <div className="step-list__title">Post-quantum signature</div>
              <div className="step-list__text">
                <Address value={bond.pqcIssuer} chars={5} /> signs the exact message from the contract. Key{" "}
                {bond.keyStatus?.registered ? "registered" : "not registered"}.
              </div>
            </div>
          </div>
          <div className="step-list__item">
            <span className="step-list__num">3</span>
            <div>
              <div className="step-list__title">Nonce & deadline</div>
              <div className="step-list__text">
                Each signature works once. Current nonce <span className="mono">{bond.nonce.toString()}</span>.
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="New coupon period"
        hint="Pick a future block. It must be later than the last record date."
        actions={<Pill>Block {formatBlock(bond.blockNumber)}</Pill>}
      >
        <div className="form-row">
          <label className="field">
            <span className="field__label">Record block</span>
            <input
              className="input"
              value={newRecordBlock}
              onChange={(event) => setNewRecordBlock(event.target.value)}
              inputMode="numeric"
              spellCheck={false}
            />
            <span className="field__hint">
              Defaults to 1,000 blocks ahead. Last record date: {lastRecordBlock > 0n ? formatBlock(lastRecordBlock) : "none"}.
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
        {!isIssuer && wallet.address ? <p className="form-hint">Needs the issuer role.</p> : null}
      </Card>

      {bond.periods.length === 0 ? (
        <Card title="Coupon periods">
          <Empty title="No periods yet">Open the first coupon period above.</Empty>
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

      <Card
        title="Issue bond tokens"
        hint="Mint to an investor. Supply can never exceed the cap."
        actions={<Pill>{`${formatToken(bond.totalSupply, bond.decimals, 0)} / ${formatToken(bond.cap, bond.decimals, 0)} ${bond.symbol}`}</Pill>}
      >
        <div className="form-row">
          <label className="field">
            <span className="field__label">Recipient</span>
            <input
              className="input"
              value={mintTo}
              onChange={(event) => {
                setMintTo(event.target.value);
                setMintError(undefined);
              }}
              placeholder="0x…"
              spellCheck={false}
            />
          </label>
          <label className="field">
            <span className="field__label">Amount ({bond.symbol})</span>
            <input
              className="input"
              value={mintAmount}
              onChange={(event) => {
                setMintAmount(event.target.value);
                setMintError(undefined);
              }}
              placeholder="0.00"
              inputMode="decimal"
            />
            <span className="field__hint">
              Headroom: {formatToken(bond.cap - bond.totalSupply, bond.decimals, 0)} {bond.symbol}.
            </span>
          </label>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!wallet.walletClient || !isMinter || busy || !wallet.isCorrectChain}
            onClick={mintTokens}
          >
            Mint
          </button>
        </div>
        {mintError ? <p className="form-error">{mintError}</p> : null}
        {!isMinter && wallet.address ? (
          <p className="form-hint">Needs the minter role on the bond token.</p>
        ) : null}
      </Card>

      <Card title="Supply">
        <div className="detail-grid">
          <div className="detail-item">
            <span className="field__label">Current supply</span>
            <span className="num detail-item__value">
              {formatToken(bond.totalSupply, bond.decimals, 0)} {bond.symbol}
            </span>
          </div>
          <div className="detail-item">
            <span className="field__label">Cap</span>
            <span className="num detail-item__value">
              {formatToken(bond.cap, bond.decimals, 0)} {bond.symbol}
            </span>
          </div>
          <div className="detail-item">
            <span className="field__label">Coupon at this supply</span>
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
