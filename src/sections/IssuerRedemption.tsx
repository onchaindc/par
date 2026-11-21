import { useCallback, useState } from "react";
import { ADDRESSES, qoreChain } from "../config";
import { paymentTokenAbi, servicingAbi } from "../abis";
import type { BondData } from "../hooks/useBondData";
import type { WalletState } from "../hooks/useWallet";
import type { useTx } from "../hooks/useTx";
import { publicClient } from "../lib/chain";
import { formatBlock, formatDate, formatToken, relativeTime } from "../lib/format";
import { Card, Notice, Pill } from "../components/ui";
import { PqcPanel } from "../components/PqcPanel";
import { FundForm } from "../components/FundForm";

type Tx = ReturnType<typeof useTx>;

export function RedemptionCard({
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
    void tx.run(
      "Declare principal redemption",
      () =>
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
        <div className="stack">
          <div className="detail-grid detail-grid--3">
            <div className="detail-item">
              <span className="field__label">Maturity</span>
              <span className="num detail-item__value">{formatDate(bond.terms.maturity)}</span>
            </div>
            <div className="detail-item">
              <span className="field__label">Countdown</span>
              <span className="num detail-item__value">{relativeTime(bond.terms.maturity)}</span>
            </div>
            <div className="detail-item">
              <span className="field__label">Principal per token</span>
              <span className="num detail-item__value">
                {formatToken(bond.terms.faceValuePerToken, bond.paymentDecimals, 2)} {bond.paymentSymbol}
              </span>
            </div>
          </div>
          {!maturityReached ? (
            <Notice tone="warn" title="Declaration is disabled before maturity">
              The contract rejects declareRedemption before maturity. This action becomes available on{" "}
              {formatDate(bond.terms.maturity)}.
            </Notice>
          ) : null}
          <label className="field">
            <span className="field__label">Record-date block</span>
            <input
              className="input"
              value={recordBlock}
              onChange={(event) => setRecordBlock(event.target.value)}
              spellCheck={false}
            />
            <span className="field__hint">
              Must be a past block (defaults to the latest block). Entitlements use balances at this block.
            </span>
          </label>
          <PqcPanel
            title="Declare with ML-DSA-87 authorization"
            description="The message commits to the record-date block, principal per token, required funding and deadline."
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
ML-DSA-87 key. This repository's authorize tool covers coupon finalization;
use an ML-DSA-87 signer over the exact message bytes shown above.`}
            nonce={bond.nonce}
            pqcIssuer={bond.pqcIssuer}
            messageLabel="redemptionDeclarationMessage"
            busy={busy}
          />
        </div>
      ) : (
        <div className="stack">
          <div className="detail-grid detail-grid--3">
            <div className="detail-item">
              <span className="field__label">Record-date block</span>
              <span className="num detail-item__value">{formatBlock(bond.redemption.recordDateBlock)}</span>
            </div>
            <div className="detail-item">
              <span className="field__label">Required funding</span>
              <span className="num detail-item__value">
                {formatToken(bond.redemption.required, bond.paymentDecimals, 2)} {bond.paymentSymbol}
              </span>
            </div>
            <div className="detail-item">
              <span className="field__label">Funded</span>
              <span className="num detail-item__value">
                {formatToken(bond.redemption.funded, bond.paymentDecimals, 2)} {bond.paymentSymbol}
              </span>
            </div>
          </div>
          {bond.redemption.funded < bond.redemption.required ? (
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
                if (!wallet.walletClient || !wallet.address) {
                  return Promise.reject(new Error("Connect the treasurer wallet."));
                }
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
          ) : (
            <Notice tone="ok" title="Fully funded">
              Holders can now claim principal once each from the Claims page.
            </Notice>
          )}
        </div>
      )}
    </Card>
  );
}
