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
          <Empty title="Connect to see your bonds">
            Your balance and payments are read straight from QoreChain for the wallet you connect. No account is created, and this app never asks for a private key.
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
          label="Your bonds"
          value={formatToken(account.bondBalance, bond.decimals, 2)}
          unit={bond.symbol}
          foot={`${formatPercent(share)} of all bonds issued`}
        />
        <Stat
          label="Face value"
          value={formatToken(principalAtFace, bond.paymentDecimals, 2)}
          unit={bond.paymentSymbol}
          foot="What you get back at maturity"
        />
        <Stat
          label="Interest per payment"
          value={formatToken(couponPerPeriod, bond.paymentDecimals, 4)}
          unit={bond.paymentSymbol}
          foot={`Paid ${bond.terms.paymentsPerYear === 2 ? "twice" : `${bond.terms.paymentsPerYear} times`} a year`}
        />
        <Stat
          label="Ready to collect"
          value={formatToken(claimableTotal, bond.paymentDecimals, 2)}
          unit={bond.paymentSymbol}
          foot={claimable.length > 0 ? `${claimable.length} payment${claimable.length === 1 ? "" : "s"} ready` : "Nothing waiting right now"}
        />
      </div>

      {account.bondBalance === 0n && (
        <Notice tone="warn" title="No bonds in this wallet">
          This address holds no {bond.symbol}. Payments go to whoever holds bonds at each snapshot, so buying after
          a snapshot does not earn that round.
        </Notice>
      )}

      <div className="grid grid--sidebar">
        <Card title="Your interest payments" hint="One payment per round, based on the bonds you held at that round's snapshot." flush>
          {bond.periods.length === 0 ? (
            <div style={{ padding: "0 24px 24px" }}>
              <Empty title="No payment rounds yet">
                Your payments will appear here once the issuer opens the first round.
              </Empty>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Round</th>
                    <th>Snapshot</th>
                    <th>Your payment</th>
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
                          {period.finalized && funded && !claimed && entitlement > 0n ? (
                            <button type="button" className="btn btn--ghost" onClick={onOpenClaims}>
                              Collect →
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

        <Card title="Principal at maturity" hint="Your original stake comes back after maturity, once it is declared and funded.">
          <dl className="kv">
            <dt>Maturity</dt>
            <dd>{formatDate(bond.terms.maturity)}</dd>
            <dt>Time left</dt>
            <dd>{relativeTime(bond.terms.maturity)}</dd>
            <dt>Face value per bond</dt>
            <dd>{formatToken(bond.terms.faceValuePerToken, bond.paymentDecimals, 2)} {bond.paymentSymbol}</dd>
            <dt>Your principal</dt>
            <dd>
              {bond.redemption.declared
                ? `${formatToken(account.principalEntitlement, bond.paymentDecimals, 2)} ${bond.paymentSymbol}`
                : `${formatToken(principalAtFace, bond.paymentDecimals, 2)} ${bond.paymentSymbol} at face`}
            </dd>
            <dt>Declared</dt>
            <dd>{bond.redemption.declared ? "Yes" : "Not yet"}</dd>
            <dt>Your status</dt>
            <dd>{account.principalClaimed ? "Collected" : bond.redemption.declared ? "Ready" : "Not open yet"}</dd>
          </dl>
          {bond.redemption.declared && !account.principalClaimed && account.principalEntitlement > 0n ? (
            <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 16 }} onClick={onOpenClaims}>
              Collect principal
            </button>
          ) : (
            <p className="small muted" style={{ marginTop: 16 }}>
              Principal is paid once to whoever held bonds at the declared snapshot. It is not a separate tradable token.
            </p>
          )}
          <details className="details">
            <summary>Wallet balances</summary>
            <div className="details__body">
              <div className="fact">
                <span className="fact__label">Bonds (raw units)</span>
                <span className="fact__value mono">{account.bondBalance.toString()}</span>
              </div>
              <div className="fact">
                <span className="fact__label">Payment balance</span>
                <span className="fact__value mono">{formatToken(account.paymentBalance, bond.paymentDecimals, 2)} {bond.paymentSymbol}</span>
              </div>
              <div className="fact">
                <span className="fact__label">Approved for servicing</span>
                <span className="fact__value mono">{formatToken(account.allowance, bond.paymentDecimals, 2)} {bond.paymentSymbol}</span>
              </div>
            </div>
          </details>
        </Card>
      </div>

    </div>
  );
}

function Header() {
  return (
    <div>
      <div className="eyebrow">My bonds</div>
      <h2 className="section-title">Your bonds</h2>
      <p className="section-sub">
        Your balance, interest payments and principal status, read straight from the contracts.
      </p>
    </div>
  );
}
