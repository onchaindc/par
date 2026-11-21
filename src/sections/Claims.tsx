import type { AccountData } from "../hooks/useAccountData";
import type { BondData } from "../hooks/useBondData";
import type { WalletState } from "../hooks/useWallet";
import { ADDRESSES } from "../config";
import { servicingAbi } from "../abis";
import type { useTx } from "../hooks/useTx";
import { formatDate, formatToken, formatBlock } from "../lib/format";
import { Card, Empty, Notice, Pill } from "../components/ui";

type Tx = ReturnType<typeof useTx>;

export function Claims({
  bond,
  account,
  wallet,
  tx,
  onConnect,
  refreshAll,
}: {
  bond: BondData;
  account: AccountData | null;
  wallet: WalletState;
  tx: Tx;
  onConnect: () => void;
  refreshAll: () => void;
}) {
  const run = (label: string, send: () => Promise<`0x${string}`>) => {
    void tx.run(label, send, refreshAll);
  };

  const claimCoupon = (periodId: number) => {
    if (!wallet.walletClient || !wallet.address) return;
    run(`Claim coupon · period ${periodId}`, () =>
      wallet.walletClient!.writeContract({
        address: ADDRESSES.servicing,
        abi: servicingAbi,
        functionName: "claimCoupon",
        args: [BigInt(periodId)],
        account: wallet.address!,
        chain: wallet.walletClient!.chain,
      }),
    );
  };

  const claimPrincipal = () => {
    if (!wallet.walletClient || !wallet.address) return;
    run("Claim principal", () =>
      wallet.walletClient!.writeContract({
        address: ADDRESSES.servicing,
        abi: servicingAbi,
        functionName: "claimPrincipal",
        args: [],
        account: wallet.address!,
        chain: wallet.walletClient!.chain,
      }),
    );
  };

  const rows = bond.periods.map((period) => {
    const entry = account?.periodClaims.find((claim) => claim.id === period.id);
    return {
      period,
      entitlement: entry?.entitlement ?? 0n,
      claimed: entry?.claimed ?? false,
      funded: period.finalized && period.funded >= period.required,
    };
  });
  const available = rows.filter((row) => row.period.finalized);
  const claimableTotal = rows
    .filter((row) => row.funded && !row.claimed && row.entitlement > 0n)
    .reduce((sum, row) => sum + row.entitlement, 0n);

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Distributions</div>
        <h2 className="section-title">Claim coupons and principal</h2>
        <p className="section-sub">
          Claims are pull-based and exactly once. A coupon is claimable only when its period is finalized and the
          treasurer has funded the full requirement.
        </p>
      </div>

      {!wallet.address ? (
        <Card>
          <Empty title="Connect a wallet to claim">
            Claims are tied to the holder address at the record-date block, not to the wallet that submitted a
            previous transaction.
            <div style={{ marginTop: 16 }}>
              <button type="button" className="btn btn--primary" onClick={onConnect} disabled={wallet.connecting}>
                {wallet.connecting ? <span className="spinner" /> : null}
                Connect wallet
              </button>
            </div>
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid grid--3">
            <div className="stat">
              <div className="stat__label">Available to claim</div>
              <div className="stat__value">
                {formatToken(claimableTotal, bond.paymentDecimals, 2)}
                <small>{bond.paymentSymbol}</small>
              </div>
              <div className="stat__foot">Across fully funded, unclaimed coupon periods</div>
            </div>
            <div className="stat">
              <div className="stat__label">Redemption status</div>
              <div className="stat__value" style={{ fontSize: 24 }}>
                {bond.redemption.declared ? (account?.principalClaimed ? "Claimed" : "Declared") : "Not declared"}
              </div>
              <div className="stat__foot">
                {bond.redemption.declared
                  ? `Record date block ${formatBlock(bond.redemption.recordDateBlock)}`
                  : `Principal becomes available after maturity (${formatDate(bond.terms.maturity)})`}
              </div>
            </div>
            <div className="stat">
              <div className="stat__label">Your bond balance</div>
              <div className="stat__value">
                {account ? formatToken(account.bondBalance, bond.decimals, 2) : "—"}
                <small>{bond.symbol}</small>
              </div>
              <div className="stat__foot">Used to derive coupon and principal entitlements</div>
            </div>
          </div>

          <Card title="Coupon claims" hint="Each period can be claimed once per holder." flush>
            {available.length === 0 ? (
              <div style={{ padding: "0 24px 24px" }}>
                <Empty title="Nothing to claim yet">
                  No coupon period has been finalized. The issuer must open a period, wait for its record date,
                  finalize it with a PQC signature and then fund it.
                </Empty>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Record date</th>
                      <th>Coupon / token</th>
                      <th>Your entitlement</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ period, entitlement, claimed, funded }) => (
                      <tr key={period.id}>
                        <td className="mono">#{period.id}</td>
                        <td>
                          <span className="num">{formatBlock(period.recordDateBlock)}</span>
                          <div className="small muted">
                            {period.finalized
                              ? "frozen"
                              : bond.blockNumber > period.recordDateBlock
                                ? "reached · awaiting finalization"
                                : "not reached"}
                          </div>
                        </td>
                        <td className="num">
                          {period.finalized
                            ? `${formatToken(period.couponPerToken, bond.paymentDecimals, 4)} ${bond.paymentSymbol}`
                            : "—"}
                        </td>
                        <td className="num">
                          {period.finalized ? `${formatToken(entitlement, bond.paymentDecimals, 4)} ${bond.paymentSymbol}` : "—"}
                        </td>
                        <td>
                          {!period.finalized ? (
                            <Pill tone="warn">Unfinalized</Pill>
                          ) : claimed ? (
                            <Pill tone="ok">Claimed</Pill>
                          ) : !funded ? (
                            <Pill tone="warn">Awaiting funding</Pill>
                          ) : entitlement > 0n ? (
                            <Pill tone="gold">Ready</Pill>
                          ) : (
                            <Pill>No entitlement</Pill>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            disabled={
                              !wallet.walletClient ||
                              !wallet.isCorrectChain ||
                              !funded ||
                              claimed ||
                              entitlement === 0n ||
                              tx.status === "signing" ||
                              tx.status === "pending"
                            }
                            onClick={() => claimCoupon(period.id)}
                          >
                            Claim
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Principal redemption" hint="Declared once after maturity, then funded by the treasurer and claimed once per holder.">
            {!bond.redemption.declared ? (
              <Notice tone="warn" icon="!">
                Redemption has not been declared. It becomes possible only after maturity on{" "}
                {formatDate(bond.terms.maturity)}. Until then this panel is informational only.
              </Notice>
            ) : (
              <div className="stack" style={{ gap: 16 }}>
                <dl className="kv">
                  <dt>Record-date block</dt>
                  <dd>{formatBlock(bond.redemption.recordDateBlock)}</dd>
                  <dt>Principal per token</dt>
                  <dd>{formatToken(bond.redemption.principalPerToken, bond.paymentDecimals, 2)} {bond.paymentSymbol}</dd>
                  <dt>Required funding</dt>
                  <dd>{formatToken(bond.redemption.required, bond.paymentDecimals, 2)} {bond.paymentSymbol}</dd>
                  <dt>Funded</dt>
                  <dd>{formatToken(bond.redemption.funded, bond.paymentDecimals, 2)} {bond.paymentSymbol}</dd>
                  <dt>Your entitlement</dt>
                  <dd>
                    {account ? `${formatToken(account.principalEntitlement, bond.paymentDecimals, 2)} ${bond.paymentSymbol}` : "—"}
                  </dd>
                  <dt>Your status</dt>
                  <dd>{account?.principalClaimed ? "Claimed" : "Unclaimed"}</dd>
                </dl>
                {bond.redemption.funded < bond.redemption.required && (
                  <Notice tone="warn" icon="!">The redemption is not fully funded yet, so claims are disabled on chain.</Notice>
                )}
                <div>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={
                      !wallet.walletClient ||
                      !wallet.isCorrectChain ||
                      !account ||
                      account.principalClaimed ||
                      account.principalEntitlement === 0n ||
                      bond.redemption.funded < bond.redemption.required ||
                      tx.status === "signing" ||
                      tx.status === "pending"
                    }
                    onClick={claimPrincipal}
                  >
                    Claim principal
                  </button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
