import type { AccountData } from "../hooks/useAccountData";
import type { BondData } from "../hooks/useBondData";
import type { WalletState } from "../hooks/useWallet";
import { ADDRESSES } from "../config";
import { servicingAbi } from "../abis";
import type { useTx } from "../hooks/useTx";
import { formatBlock, formatDate, formatToken } from "../lib/format";
import { Card, Empty, KeyValue, Notice, PageHeader, Pill, Stat } from "../components/ui";
import { IconWallet } from "../components/icons";

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
  const busy = tx.status === "signing" || tx.status === "pending";
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
  const claimableTotal = rows
    .filter((row) => row.funded && !row.claimed && row.entitlement > 0n)
    .reduce((sum, row) => sum + row.entitlement, 0n);
  const claimableCount = rows.filter((row) => row.funded && !row.claimed && row.entitlement > 0n).length;
  const principalReady =
    Boolean(account) &&
    bond.redemption.declared &&
    !account!.principalClaimed &&
    account!.principalEntitlement > 0n &&
    bond.redemption.funded >= bond.redemption.required;

  const header = (
    <PageHeader
      eyebrow="Payouts"
      title="Claims"
      description="Collect your coupons and principal. Each payout can be claimed once."
      actions={
        wallet.address ? (
          <Pill tone={!wallet.isCorrectChain ? "warn" : claimableTotal > 0n ? "ok" : "neutral"}>
            {!wallet.isCorrectChain
              ? "Wrong network"
              : claimableTotal > 0n
                ? `${formatToken(claimableTotal, bond.paymentDecimals, 2)} ${bond.paymentSymbol} claimable`
                : "Nothing to claim yet"}
          </Pill>
        ) : (
          <button type="button" className="btn btn--primary" onClick={onConnect}>
            <IconWallet size={15} />
            Connect wallet
          </button>
        )
      }
    />
  );

  if (!wallet.address) {
    return (
      <div className="stack stack--lg">
        {header}
        <Card>
          <Empty title="Connect to claim">We'll show what's ready for your address.</Empty>
        </Card>
        <div className="ghost-grid">
          <div className="ghost-card">
            <span className="ghost-card__label">Ready to claim</span>
            <span className="ghost-card__value">—</span>
          </div>
          <div className="ghost-card">
            <span className="ghost-card__label">Redemption</span>
            <span className="ghost-card__value">—</span>
          </div>
          <div className="ghost-card">
            <span className="ghost-card__label">Your holding</span>
            <span className="ghost-card__value">—</span>
          </div>
        </div>
        <div className="step-list">
          <div className="step-list__item">
            <span className="step-list__num">1</span>
            <div>
              <div className="step-list__title">The issuer finalizes a period</div>
              <div className="step-list__text">The coupon amount is fixed on chain.</div>
            </div>
          </div>
          <div className="step-list__item">
            <span className="step-list__num">2</span>
            <div>
              <div className="step-list__title">The treasurer funds it</div>
              <div className="step-list__text">Claims open only when it's fully funded.</div>
            </div>
          </div>
          <div className="step-list__item">
            <span className="step-list__num">3</span>
            <div>
              <div className="step-list__title">You claim once</div>
              <div className="step-list__text">One claim per period, and one for principal.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack stack--lg">
      {header}

      <div className="stat-grid stat-grid--3">
        <Stat
          label="Ready to claim"
          tone={claimableTotal > 0n ? "positive" : "default"}
          value={formatToken(claimableTotal, bond.paymentDecimals, 2)}
          unit={bond.paymentSymbol}
          foot={claimableCount > 0 ? `${claimableCount} payout${claimableCount === 1 ? "" : "s"} waiting` : "Nothing waiting"}
        />
        <Stat
          label="Redemption"
          value={
            bond.redemption.declared ? (account?.principalClaimed ? "Claimed" : "Declared") : "Not declared"
          }
          foot={
            bond.redemption.declared
              ? `Record date block ${formatBlock(bond.redemption.recordDateBlock)}`
              : `Possible after ${formatDate(bond.terms.maturity)}`
          }
        />
        <Stat
          label="Your bond balance"
          value={account ? formatToken(account.bondBalance, bond.decimals, 2) : "—"}
          unit={bond.symbol}
          foot="sets your coupons and principal"
        />
      </div>

      <Card
        title="Coupons"
        flush
        actions={<Pill>{rows.length || "None"}</Pill>}
      >
        {rows.length === 0 ? (
          <div className="card__pad">
            <Empty title="Nothing to claim yet">A coupon appears once the issuer opens and funds a period.</Empty>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Record date</th>
                  <th className="align-end">Coupon / token</th>
                  <th className="align-end">Your entitlement</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ period, entitlement, claimed, funded }) => {
                  const claimable = funded && !claimed && entitlement > 0n;
                  return (
                    <tr key={period.id}>
                      <td data-label="Period" className="mono">
                        #{period.id}
                      </td>
                      <td data-label="Record date">
                        <span className="num">{formatBlock(period.recordDateBlock)}</span>
                        <span className="cell-note">
                          {period.finalized
                            ? "frozen"
                            : bond.blockNumber > period.recordDateBlock
                              ? "reached · awaiting finalization"
                              : "not reached"}
                        </span>
                      </td>
                      <td data-label="Coupon / token" className="num align-end">
                        {period.finalized
                          ? `${formatToken(period.couponPerToken, bond.paymentDecimals, 4)} ${bond.paymentSymbol}`
                          : "—"}
                      </td>
                      <td data-label="Entitlement" className="num align-end">
                        {period.finalized
                          ? `${formatToken(entitlement, bond.paymentDecimals, 4)} ${bond.paymentSymbol}`
                          : "—"}
                      </td>
                      <td data-label="Status">
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
                      <td className="cell--action">
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          disabled={
                            !wallet.walletClient ||
                            !wallet.isCorrectChain ||
                            !claimable ||
                            busy
                          }
                          onClick={() => claimCoupon(period.id)}
                        >
                          {busy && tx.label?.includes(`period ${period.id}`) ? <span className="spinner" /> : null}
                          Claim
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Principal"
        hint="Declared after maturity, then funded and claimed once."
        actions={
          <Pill tone={bond.redemption.declared ? "ok" : "neutral"}>
            {bond.redemption.declared ? "Declared" : "Not declared"}
          </Pill>
        }
      >
        {!bond.redemption.declared ? (
          <Notice tone="warn" title="Not open yet">
            Principal can be claimed after maturity on {formatDate(bond.terms.maturity)}.
          </Notice>
        ) : (
          <div className="stack">
            <KeyValue
              rows={[
                { label: "Record-date block", value: formatBlock(bond.redemption.recordDateBlock) },
                {
                  label: "Principal per token",
                  value: `${formatToken(bond.redemption.principalPerToken, bond.paymentDecimals, 2)} ${bond.paymentSymbol}`,
                },
                {
                  label: "Required funding",
                  value: `${formatToken(bond.redemption.required, bond.paymentDecimals, 2)} ${bond.paymentSymbol}`,
                },
                {
                  label: "Funded",
                  value: `${formatToken(bond.redemption.funded, bond.paymentDecimals, 2)} ${bond.paymentSymbol}`,
                },
                {
                  label: "Your entitlement",
                  value: account
                    ? `${formatToken(account.principalEntitlement, bond.paymentDecimals, 2)} ${bond.paymentSymbol}`
                    : "—",
                },
                { label: "Your status", value: account?.principalClaimed ? "Claimed" : "Unclaimed" },
              ]}
            />
            {bond.redemption.funded < bond.redemption.required ? (
              <Notice tone="warn">Not fully funded yet, so claims are paused.</Notice>
            ) : null}
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={!principalReady || !wallet.isCorrectChain || busy}
              onClick={claimPrincipal}
            >
              {busy && tx.label === "Claim principal" ? <span className="spinner" /> : null}
              Claim principal
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
