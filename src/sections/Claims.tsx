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
    run(`Collect interest · round ${periodId}`, () =>
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
    run("Collect principal", () =>
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
        <div className="eyebrow">Payments</div>
        <h2 className="section-title">Collect your interest</h2>
        <p className="section-sub">
          Each payment is approved and fully funded first, then collected once. You always see the exact amount before
          you sign.
        </p>
      </div>

      {!wallet.address ? (
        <Card>
          <Empty title="Connect to collect">
            Payments belong to whoever held bonds at each snapshot. Connect the wallet that holds them to see what is ready.
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
              <div className="stat__label">Ready to collect</div>
              <div className="stat__value">
                {formatToken(claimableTotal, bond.paymentDecimals, 2)}
                <small>{bond.paymentSymbol}</small>
              </div>
              <div className="stat__foot">Across funded, uncollected rounds</div>
            </div>
            <div className="stat">
              <div className="stat__label">Principal</div>
              <div className="stat__value" style={{ fontSize: 24 }}>
                {bond.redemption.declared ? (account?.principalClaimed ? "Collected" : "Ready") : "Not open yet"}
              </div>
              <div className="stat__foot">
                {bond.redemption.declared
                  ? `Snapshot at block ${formatBlock(bond.redemption.recordDateBlock)}`
                  : `Available after maturity on ${formatDate(bond.terms.maturity)}`}
              </div>
            </div>
            <div className="stat">
              <div className="stat__label">Your bonds</div>
              <div className="stat__value">
                {account ? formatToken(account.bondBalance, bond.decimals, 2) : "—"}
                <small>{bond.symbol}</small>
              </div>
              <div className="stat__foot">Your balance at each snapshot sets your payment</div>
            </div>
          </div>

          <Card title="Interest payments" hint="One payment per round, once per holder." flush>
            {available.length === 0 ? (
              <div style={{ padding: "0 24px 24px" }}>
                <Empty title="No payments yet">
                  When a round is opened, approved and funded, it will show up here ready to collect.
                </Empty>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Round</th>
                      <th>Snapshot</th>
                      <th>Interest per bond</th>
                      <th>Your payment</th>
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
                              ? "locked"
                              : bond.blockNumber > period.recordDateBlock
                                ? "reached · waiting for approval"
                                : "not reached yet"}
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
                            <Pill tone="warn">Not approved</Pill>
                          ) : claimed ? (
                            <Pill tone="ok">Collected</Pill>
                          ) : !funded ? (
                            <Pill tone="warn">Waiting for funding</Pill>
                          ) : entitlement > 0n ? (
                            <Pill tone="gold">Ready</Pill>
                          ) : (
                            <Pill>No payment</Pill>
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
                            Collect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Principal" hint="Your original stake, returned once after maturity and collected once per holder.">
            {!bond.redemption.declared ? (
              <Notice tone="warn" title="Not open yet">
                Principal becomes available after maturity on {formatDate(bond.terms.maturity)}. Nothing is required
                from you before then.
              </Notice>
            ) : (
              <div className="stack" style={{ gap: 16 }}>
                <dl className="kv">
                  <dt>Snapshot block</dt>
                  <dd>{formatBlock(bond.redemption.recordDateBlock)}</dd>
                  <dt>Principal per bond</dt>
                  <dd>{formatToken(bond.redemption.principalPerToken, bond.paymentDecimals, 2)} {bond.paymentSymbol}</dd>
                  <dt>Needed in total</dt>
                  <dd>{formatToken(bond.redemption.required, bond.paymentDecimals, 2)} {bond.paymentSymbol}</dd>
                  <dt>Funded so far</dt>
                  <dd>{formatToken(bond.redemption.funded, bond.paymentDecimals, 2)} {bond.paymentSymbol}</dd>
                  <dt>Your principal</dt>
                  <dd>
                    {account ? `${formatToken(account.principalEntitlement, bond.paymentDecimals, 2)} ${bond.paymentSymbol}` : "—"}
                  </dd>
                  <dt>Your status</dt>
                  <dd>{account?.principalClaimed ? "Collected" : "Not collected"}</dd>
                </dl>
                {bond.redemption.funded < bond.redemption.required && (
                  <Notice tone="warn" title="Funding isn't complete">The full principal has not been added yet, so collection is paused.</Notice>
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
                    Collect principal
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
