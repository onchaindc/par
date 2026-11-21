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
import { Card, Empty, Notice, Pill, Stat } from "../components/ui";

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

  if (!wallet.address) {
    return (
      <div className="stack">
        <Header />
        <Card>
          <Empty title="Connect a wallet to view your position">
            Holdings and entitlements are read directly from QoreChain for the connected address. No account is
            created and no key material is requested by this application.
            <div style={{ marginTop: 16 }}>
              <button type="button" className="btn btn--primary" onClick={onConnect} disabled={wallet.connecting}>
                {wallet.connecting ? <span className="spinner" /> : null}
                Connect wallet
              </button>
            </div>
          </Empty>
        </Card>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="stack">
        <Header />
        <Card>
          <div className="stack" style={{ gap: 12 }}>
            <div className="skeleton" style={{ width: "45%" }} />
            <div className="skeleton skeleton--stat" />
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
    <div className="stack">
      <Header />
      <div className="grid grid--4">
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
          value={formatToken(claimableTotal, bond.paymentDecimals, 2)}
          unit={bond.paymentSymbol}
          foot={claimable.length > 0 ? `${claimable.length} funded period(s)` : "No funded entitlement outstanding"}
        />
      </div>

      {account.bondBalance === 0n && (
        <Notice tone="warn" icon="!">
          This address holds no {bond.symbol}. Entitlements are based on the balance checkpointed at each period's
          record-date block, so buying after a record date does not earn that period's coupon.
        </Notice>
      )}

      <div className="grid grid--sidebar">
        <Card title="Your coupon entitlements" hint="Entitlements exist only for finalized periods and are fixed by the balance held at the record-date block." flush>
          {bond.periods.length === 0 ? (
            <div style={{ padding: "0 24px 24px" }}>
              <Empty title="No coupon period opened">
                The issuer has not opened a period yet. Your coupons will appear here once a period is finalized.
              </Empty>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Record date</th>
                    <th>Entitlement</th>
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
                        <td className="mono">#{period.id}</td>
                        <td className="num">{formatBlock(period.recordDateBlock)}</td>
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
                            <Pill tone="gold">Claimable</Pill>
                          ) : (
                            <Pill>No entitlement</Pill>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {period.finalized && funded && !claimed && entitlement > 0n ? (
                            <button type="button" className="btn btn--ghost" onClick={onOpenClaims}>
                              Claim →
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

        <Card title="Principal at maturity" hint="Redemption becomes claimable only after the issuer declares it following maturity and the treasurer funds it.">
          <dl className="kv">
            <dt>Maturity</dt>
            <dd>{formatDate(bond.terms.maturity)}</dd>
            <dt>Time to maturity</dt>
            <dd>{relativeTime(bond.terms.maturity)}</dd>
            <dt>Face per token</dt>
            <dd>{formatToken(bond.terms.faceValuePerToken, bond.paymentDecimals, 2)} {bond.paymentSymbol}</dd>
            <dt>Your principal</dt>
            <dd>
              {bond.redemption.declared
                ? `${formatToken(account.principalEntitlement, bond.paymentDecimals, 2)} ${bond.paymentSymbol}`
                : `${formatToken(principalAtFace, bond.paymentDecimals, 2)} ${bond.paymentSymbol} at face`}
            </dd>
            <dt>Redemption declared</dt>
            <dd>{bond.redemption.declared ? "Yes" : "Not yet"}</dd>
            <dt>Your status</dt>
            <dd>{account.principalClaimed ? "Claimed" : bond.redemption.declared ? "Unclaimed" : "Not available"}</dd>
          </dl>
          {bond.redemption.declared && !account.principalClaimed && account.principalEntitlement > 0n ? (
            <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 16 }} onClick={onOpenClaims}>
              Go to principal claim
            </button>
          ) : (
            <p className="small muted" style={{ marginTop: 16 }}>
              Principal is not transferable as a claim: it is paid once to whoever held tokens at the declared
              record-date block.
            </p>
          )}
        </Card>
      </div>

      <Card title="Token balance detail" hint="The bond token uses 18 decimals; the payment token uses its own precision.">
        <div className="grid grid--3">
          <div>
            <div className="field__label">Bond balance (raw units)</div>
            <p className="mono" style={{ marginTop: 6 }}>{account.bondBalance.toString()}</p>
          </div>
          <div>
            <div className="field__label">Payment token balance</div>
            <p className="mono" style={{ marginTop: 6 }}>{formatToken(account.paymentBalance, bond.paymentDecimals, 2)} {bond.paymentSymbol}</p>
          </div>
          <div>
            <div className="field__label">Servicing allowance</div>
            <p className="mono" style={{ marginTop: 6 }}>{formatToken(account.allowance, bond.paymentDecimals, 2)} {bond.paymentSymbol}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Header() {
  return (
    <div>
      <div className="eyebrow">Investor register</div>
      <h2 className="section-title">Your position</h2>
      <p className="section-sub">
        Balances, coupon entitlements and principal claim status for the connected address, read from the
        servicing and bond contracts.
      </p>
    </div>
  );
}
