import { useCallback, useState } from "react";
import { ADDRESSES, qoreChain } from "../config";
import { paymentTokenAbi, servicingAbi } from "../abis";
import type { BondData, Period } from "../hooks/useBondData";
import type { WalletState } from "../hooks/useWallet";
import type { useTx } from "../hooks/useTx";
import { publicClient } from "../lib/chain";
import { formatBlock, formatToken } from "../lib/format";
import { Card, Pill, Progress } from "../components/ui";
import { PqcPanel } from "../components/PqcPanel";
import { FundForm } from "../components/FundForm";

type Tx = ReturnType<typeof useTx>;

export function PeriodCard({
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
    void tx.run(
      `Finalize coupon period ${period.id}`,
      () =>
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
    void tx.run(
      `Update record date · period ${period.id}`,
      () =>
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
      hint={`Record block ${formatBlock(period.recordDateBlock)}${
        reached ? " · reached" : ` · in ${formatBlock(period.recordDateBlock - bond.blockNumber)} blocks`
      }`}
      actions={
        <Pill tone={period.finalized ? "ok" : reached ? "warn" : "neutral"}>
          {period.finalized ? "Finalized" : reached ? "Ready to finalize" : "Scheduled"}
        </Pill>
      }
    >
      {!period.finalized ? (
        <div className="stack">
          <div className="detail-grid detail-grid--2">
            <div className="detail-item">
              <span className="field__label">Coupon per token</span>
              <span className="num detail-item__value">
                {formatToken(perToken, bond.paymentDecimals, 4)} {bond.paymentSymbol}
              </span>
            </div>
            <div className="detail-item">
              <span className="field__label">Needed at this supply</span>
              <span className="num detail-item__value">
                {formatToken(perToken * (bond.totalSupply / 10n ** 18n), bond.paymentDecimals, 2)}{" "}
                {bond.paymentSymbol}
              </span>
            </div>
          </div>
          <p className="card__note">
            The amount is fixed at finalization, from supply at block {formatBlock(period.recordDateBlock)}.
          </p>

          {!reached ? (
            <div className="form-row">
              <label className="field">
                <span className="field__label">Record block</span>
                <input
                  className="input"
                  value={recordDraft}
                  onChange={(event) => setRecordDraft(event.target.value)}
                  spellCheck={false}
                />
                <span className="field__hint">Only while the record date is still ahead.</span>
              </label>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={!wallet.walletClient || !isIssuer || busy || !wallet.isCorrectChain}
                onClick={updateRecordDate}
              >
Update
              </button>
            </div>
          ) : (
            <PqcPanel
              title="Finalize with a signature"
              description="Paste the signature from the offline signer, check it, then submit."
              loadMessage={loadFinalizeMessage}
              onSubmit={finalize}
              submitLabel="Finalize coupon"
              disabled={!isIssuer || !wallet.isCorrectChain}
              disabledReason={
                !wallet.address
                  ? "Connect the issuer wallet first."
                  : !isIssuer
                    ? "This wallet has no issuer role."
                    : !wallet.isCorrectChain
                      ? "Switch to QoreChain first."
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
        <div className="stack">
          <div className="detail-grid detail-grid--3">
            <div className="detail-item">
              <span className="field__label">Coupon per token</span>
              <span className="num detail-item__value">
                {formatToken(period.couponPerToken, bond.paymentDecimals, 4)} {bond.paymentSymbol}
              </span>
            </div>
            <div className="detail-item">
              <span className="field__label">Needed</span>
              <span className="num detail-item__value">
                {formatToken(period.required, bond.paymentDecimals, 2)} {bond.paymentSymbol}
              </span>
            </div>
            <div className="detail-item">
              <span className="field__label">Funded</span>
              <span className="num detail-item__value">
                {formatToken(period.funded, bond.paymentDecimals, 2)} {bond.paymentSymbol}
              </span>
            </div>
          </div>
          <div className="fund-status">
            <Progress value={progress} tone={progress >= 100 ? "green" : "gold"} label={`Period ${period.id} funding`} />
            <div className="fund-status__row">
              <span className="small muted">
                {progress.toFixed(1)}% funded ·{" "}
                {formatToken(remaining > 0n ? remaining : 0n, bond.paymentDecimals, 2)} {bond.paymentSymbol} to go
              </span>
              {period.funded >= period.required ? (
                <Pill tone="ok">Funded</Pill>
              ) : (
                <Pill tone="warn">Needs funding</Pill>
              )}
            </div>
          </div>
          {period.funded < period.required ? (
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
                  functionName: "fundCoupon",
                  args: [BigInt(period.id), amount],
                  account: wallet.address,
                  chain: qoreChain,
                });
              }}
              run={(label, send) => void tx.run(label, send, refreshAll)}
            />
          ) : null}
        </div>
      )}
    </Card>
  );
}
