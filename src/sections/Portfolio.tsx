import type { AccountData } from "../hooks/useAccountData";
import type { BondData } from "../hooks/useBondData";
import type { WalletState } from "../hooks/useWallet";
import {
  couponPerToken,
  formatBlock,
  formatDate,
  formatPercent,
  formatToken,
  relativeTime,
} from "../lib/format";
import { Card, Empty, KeyValue, Notice, PageHeader, Pill, Skeleton, Stat } from "../components/ui";
import { IconArrowRight, IconWallet } from "../components/icons";

export function Portfolio({
  bond,
  account,
  wallet,
  onConnect,
  onOpenClaims,
}: {
  bond: BondData;
  account: AccountData | null;
  wallet: WalletState;
  onConnect: () => void;
  onOpenClaims: () => void;
}) {
  const perPeriod = couponPerToken(
    bond.terms.faceValuePerToken,
    bond.terms.couponRateBps,
    bond.terms.paymentsPerYear,
  );

  const header = (
    <PageHeader
      eyebrow="Investor register"
      title="Your position"
      description="Balances, coupon entitlements and principal claim status for the connected address, read from the servicing and bond contracts."
      actions={
        wallet.address ? (
          <Pill tone={wallet.isCorrectChain ? "ok" : "warn"}>
            {wallet.isCorrectChain ? "Connected" : "Wrong network"}
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
          <Empty
            title="Connect a wallet to view your position"
            action={
              <button type="button" className="btn btn--primary" onClick={onConnect} disabled={wallet.connecting}>
                {wallet.connecting ? <span className="spinner" /> : null}
                Connect wallet
              </button>
            }
          >
            Holdings and entitlements are read directly from QoreChain for the connected address. No account is
            created and no key material is requested by this application.
          </Empty>
        </Card>
        <div className="ghost-grid">
          <div className="ghost-card">
            <span className="ghost-card__label">Bond holding</span>
            <span className="ghost-card__value">—</span>
          </div>
          <div className="ghost-card">
            <span className="ghost-card__label">Face value</span>
            <span className="ghost-card__value">—</span>
          </div>
          <div className="ghost-card">
            <span className="ghost-card__label">Claimable now</span>
            <span className="ghost-card__value">—</span>
          </div>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="stack stack--lg">
        {header}
        <div className="stat-grid">
          <Skeleton stat />
          <Skeleton stat />
          <Skeleton stat />
          <Skeleton stat />
        </div>
        <Card>
          <div className="stack">
            <Skeleton width="45%" />
            <Skeleton height={90} />
            <Skeleton width="70%" />
          </div>
        </Card>
      </div>
    );
  }

  const share = bond.totalSupply > 0n ? Number((account.bondBalance * 10_000n) / bond.totalSupply) / 100 : 0;
  const principalAtFace = (account.bondBalance * bond.terms.faceValuePerToken) / 10n ** 18n;
  const couponPerPeriod = (account.bondBalance * perPeriod) / 10n ** 18n;
  const claimable = bond.periods
    .filter((period) => period.finalized && period.funded >= period.required)
    .map((period) => {
      const claim = account.periodClaims.find((entry) => entry.id === period.id);
      return { period, entitlement: claim?.entitlement ?? 0n, claimed: claim?.claimed ?? false };
    })
    .filter((entry) => entry.entitlement > 0n && !entry.claimed);
  const claimableTotal = claimable.reduce((sum, entry) => sum + entry.entitlement, 0n);

  return (
    <div className="stack stack--lg">
      {header}

      <div className="stat-grid">
        <Stat
          label="Bond holding"
          value={formatToken(account.bondBalance, bond.decimals, 2)}
          unit={bond.symbol}
          foot={`${formatPercent(share)} of outstanding supply`}
        />
        <Stat
          label="Face value"
          value={formatToken(principalAtFace, bond.paymentDecimals, 2)}
          unit={bond.paymentSymbol}
          foot="Principal at maturity, before any distribution"
        />
        <Stat
          label="Coupon per period"
          value={formatToken(couponPerPeriod, bond.paymentDecimals, 4)}
          unit={bond.paymentSymbol}
          foot={`${bond.terms.paymentsPerYear} payments per year`}
        />
        <Stat
          label="Claimable now"
          tone={claimableTotal > 0n ? "positive" : "default"}
          value={formatToken(claimableTotal, bond.paymentDecimals, 2)}
          unit={bond.paymentSymbol}
          foot={claimable.length > 0 ? `${claimable.length} funded period(s)` : "No funded entitlement outstanding"}
        />
      </div>

      {account.bondBalance === 0n ? (
        <Notice tone="warn" title="No bond tokens at this address">
          Entitlements are based on the balance checkpointed at each period's record-date block, so buying after a
          record date does not earn that period's coupon.
        </Notice>
      ) : null}

      <div className="layout-split">
        <Card
          title="Coupon entitlements"
          hint="Entitlements exist only for finalized periods and are fixed by the balance held at the record-date block."
          flush
          actions={
            claimableTotal > 0n ? (
              <button type="button" className="btn btn--primary btn--sm" onClick={onOpenClaims}>
                Claim {formatToken(claimableTotal, bond.paymentDecimals, 2)} {bond.paymentSymbol}
                <IconArrowRight size={14} />
              </button>
            ) : undefined
          }
        >
          {bond.periods.length === 0 ? (
            <div className="card__pad">
              <Empty title="No coupon period opened">
                The issuer has not opened a period yet. Your coupons will appear here once a period is finalized.
              </Empty>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Record date</th>
                    <th className="align-end">Entitlement</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {bond.periods.map((period) => {
                    const entry = account.periodClaims.find((claim) => claim.id === period.id);
                    const entitlement = entry?.entitlement ?? 0n;
                    const claimed = entry?.claimed ?? false;
                    const funded = period.finalized && period.funded >= period.required;
                    return (
                      <tr key={period.id}>
                        <td data-label="Period" className="mono">
                          #{period.id}
                        </td>
                        <td data-label="Record date" className="num">
                          {formatBlock(period.recordDateBlock)}
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
                            <Pill tone="gold">Claimable</Pill>
                          ) : (
                            <Pill>No entitlement</Pill>
                          )}
                        </td>
                        <td className="cell--action">
                          {period.finalized && funded && !claimed && entitlement > 0n ? (
                            <button type="button" className="btn btn--secondary btn--sm" onClick={onOpenClaims}>
                              Claim
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Principal at maturity" hint="Paid once to whoever held tokens at the declared record date.">
          <KeyValue
            rows={[
              { label: "Maturity", value: formatDate(bond.terms.maturity) },
              { label: "Time to maturity", value: relativeTime(bond.terms.maturity) },
              {
                label: "Face per token",
                value: `${formatToken(bond.terms.faceValuePerToken, bond.paymentDecimals, 2)} ${bond.paymentSymbol}`,
              },
              {
                label: "Your principal",
                value: bond.redemption.declared
                  ? `${formatToken(account.principalEntitlement, bond.paymentDecimals, 2)} ${bond.paymentSymbol}`
                  : `${formatToken(principalAtFace, bond.paymentDecimals, 2)} ${bond.paymentSymbol} at face`,
              },
              { label: "Redemption declared", value: bond.redemption.declared ? "Yes" : "Not yet" },
              {
                label: "Your status",
                value: account.principalClaimed
                  ? "Claimed"
                  : bond.redemption.declared
                    ? "Unclaimed"
                    : "Not available",
              },
            ]}
          />
          {bond.redemption.declared && !account.principalClaimed && account.principalEntitlement > 0n ? (
            <button type="button" className="btn btn--primary btn--block principal-action" onClick={onOpenClaims}>
              Go to principal claim
            </button>
          ) : (
            <p className="card__note">
              Principal is not a transferable claim: it is paid once to whoever held tokens at the declared record-date
              block.
            </p>
          )}
        </Card>
      </div>

      <Card title="Token balance detail" hint="The bond token uses 18 decimals; the payment token uses its own precision.">
        <div className="detail-grid">
          <div className="detail-item">
            <span className="field__label">Bond balance (raw units)</span>
            <span className="mono detail-item__value">{account.bondBalance.toString()}</span>
          </div>
          <div className="detail-item">
            <span className="field__label">Payment token balance</span>
            <span className="mono detail-item__value">
              {formatToken(account.paymentBalance, bond.paymentDecimals, 2)} {bond.paymentSymbol}
            </span>
          </div>
          <div className="detail-item">
            <span className="field__label">Servicing allowance</span>
            <span className="mono detail-item__value">
              {formatToken(account.allowance, bond.paymentDecimals, 2)} {bond.paymentSymbol}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
