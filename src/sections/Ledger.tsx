import type { BondData } from "../hooks/useBondData";
import { formatBlock, formatPercent, formatToken } from "../lib/format";
import { Card, Empty, Notice, Pill, Stat } from "../components/ui";

export function Ledger({ bond }: { bond: BondData }) {
  const totals = bond.periods.reduce(
    (acc, period) => ({
      required: acc.required + period.required,
      funded: acc.funded + period.funded,
      claimed: acc.claimed + period.claimed,
      outstanding: acc.outstanding + period.outstanding,
    }),
    { required: 0n, funded: 0n, claimed: 0n, outstanding: 0n },
  );

  const unfunded = bond.periods.reduce(
    (sum, period) => sum + (period.required > period.funded ? period.required - period.funded : 0n),
    0n,
  );
  const redemptionUnfunded =
    bond.redemption.required > bond.redemption.funded ? bond.redemption.required - bond.redemption.funded : 0n;
  const liabilities = totals.required + bond.redemption.required;
  const contractBalance = bond.servicingPaymentBalance;
  const coverage = liabilities > 0n ? Number((contractBalance * 10_000n) / liabilities) / 100 : 0;

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Reconciliation</div>
        <h2 className="section-title">Funded, claimed, outstanding</h2>
        <p className="section-sub">
          Every figure is a direct read of the servicing contract and the payment token. Amounts are in{" "}
          {bond.paymentSymbol} base units converted with {bond.paymentDecimals} decimals.
        </p>
      </div>

      <div className="grid grid--4">
        <Stat
          label="Total required"
          value={formatToken(totals.required + bond.redemption.required, bond.paymentDecimals, 2)}
          unit={bond.paymentSymbol}
          foot={`${bond.periods.length} coupon period(s) + redemption`}
        />
        <Stat
          label="Total funded"
          value={formatToken(totals.funded + bond.redemption.funded, bond.paymentDecimals, 2)}
          unit={bond.paymentSymbol}
          foot={`${formatToken(unfunded + redemptionUnfunded, bond.paymentDecimals, 2)} still unfunded`}
        />
        <Stat
          label="Total claimed"
          value={formatToken(totals.claimed + bond.redemption.claimed, bond.paymentDecimals, 2)}
          unit={bond.paymentSymbol}
          foot="Paid out to holders"
        />
        <Stat
          label="Outstanding"
          value={formatToken(totals.outstanding + bond.redemption.outstanding, bond.paymentDecimals, 2)}
          unit={bond.paymentSymbol}
          foot="Funded but not yet claimed"
        />
      </div>

      <div className="grid grid--sidebar">
        <Card
          title="Coupon period reconciliation"
          hint="Required is fixed at finalization; funded accumulates from treasurer top-ups; claimed accumulates from holder claims."
          flush
        >
          {bond.periods.length === 0 ? (
            <div style={{ padding: "0 24px 24px" }}>
              <Empty title="No coupon periods to reconcile">
                Nothing has been opened, finalized or funded yet. The reconciliation table will populate from chain
                reads as operations occur.
              </Empty>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Required</th>
                    <th>Funded</th>
                    <th>Claimed</th>
                    <th>Outstanding</th>
                    <th>Funded %</th>
                  </tr>
                </thead>
                <tbody>
                  {bond.periods.map((period) => {
                    const fundedPct =
                      period.required > 0n ? Number((period.funded * 10_000n) / period.required) / 100 : 0;
                    return (
                      <tr key={period.id}>
                        <td>
                          <span className="mono">#{period.id}</span>
                          <div className="small muted">block {formatBlock(period.recordDateBlock)}</div>
                        </td>
                        <td className="num">{formatToken(period.required, bond.paymentDecimals, 2)}</td>
                        <td className="num">{formatToken(period.funded, bond.paymentDecimals, 2)}</td>
                        <td className="num">{formatToken(period.claimed, bond.paymentDecimals, 2)}</td>
                        <td className="num">{formatToken(period.outstanding, bond.paymentDecimals, 2)}</td>
                        <td>
                          <div className="btn-row" style={{ gap: 8 }}>
                            <div className="progress" style={{ width: 64 }}>
                              <div className="progress__bar" style={{ width: `${Math.min(100, fundedPct)}%` }} />
                            </div>
                            <span className="num small">{formatPercent(fundedPct)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Servicing balance" hint="Payment tokens held by the servicing contract for funded, unclaimed distributions.">
          <div className="stack" style={{ gap: 14 }}>
            <div>
              <div className="field__label">Contract balance</div>
              <p className="stat__value" style={{ fontSize: 34, marginTop: 4 }}>
                {formatToken(contractBalance, bond.paymentDecimals, 2)}
                <small>{bond.paymentSymbol}</small>
              </p>
            </div>
            <dl className="kv">
              <dt>Total liabilities</dt>
              <dd>{formatToken(liabilities, bond.paymentDecimals, 2)} {bond.paymentSymbol}</dd>
              <dt>Coverage</dt>
              <dd>{formatPercent(coverage)}</dd>
              <dt>Unfunded coupons</dt>
              <dd>{formatToken(unfunded, bond.paymentDecimals, 2)} {bond.paymentSymbol}</dd>
              <dt>Unfunded redemption</dt>
              <dd>{formatToken(redemptionUnfunded, bond.paymentDecimals, 2)} {bond.paymentSymbol}</dd>
              <dt>Payment token supply</dt>
              <dd>{formatToken(bond.paymentTotalSupply, bond.paymentDecimals, 0)} {bond.paymentSymbol}</dd>
            </dl>
            <div className="progress" aria-label="Funding coverage">
              <div
                className={coverage >= 100 ? "progress__bar" : "progress__bar progress__bar--gold"}
                style={{ width: `${Math.min(100, coverage)}%` }}
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid--sidebar">
        <Card title="Redemption reconciliation">
          {!bond.redemption.declared ? (
            <Empty title="Redemption not declared">
              Principal remains un-funded and un-claimable until the issuer declares it after maturity.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Required</td>
                    <td className="num">{formatToken(bond.redemption.required, bond.paymentDecimals, 2)}</td>
                    <td><Pill>Record block {formatBlock(bond.redemption.recordDateBlock)}</Pill></td>
                  </tr>
                  <tr>
                    <td>Funded</td>
                    <td className="num">{formatToken(bond.redemption.funded, bond.paymentDecimals, 2)}</td>
                    <td>
                      <Pill tone={bond.redemption.funded >= bond.redemption.required ? "ok" : "warn"}>
                        {bond.redemption.funded >= bond.redemption.required ? "Fully funded" : "Partial"}
                      </Pill>
                    </td>
                  </tr>
                  <tr>
                    <td>Claimed</td>
                    <td className="num">{formatToken(bond.redemption.claimed, bond.paymentDecimals, 2)}</td>
                    <td><Pill>{formatPercent(bond.redemption.required > 0n ? Number((bond.redemption.claimed * 10_000n) / bond.redemption.required) / 100 : 0)}</Pill></td>
                  </tr>
                  <tr>
                    <td>Outstanding</td>
                    <td className="num">{formatToken(bond.redemption.outstanding, bond.paymentDecimals, 2)}</td>
                    <td><Pill>Funded, unclaimed</Pill></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Control state">
          <dl className="kv">
            <dt>Authorization nonce</dt>
            <dd>{bond.nonce.toString()}</dd>
            <dt>PQC identity</dt>
            <dd className="mono">{bond.pqcIssuer.slice(0, 10)}…{bond.pqcIssuer.slice(-6)}</dd>
            <dt>Key registered</dt>
            <dd>{bond.keyStatus?.registered ? "Yes" : "No"}</dd>
            <dt>Possession proven</dt>
            <dd>{bond.keyStatus?.possessionProven ? "Yes" : "No"}</dd>
            <dt>Bond supply</dt>
            <dd>{formatToken(bond.totalSupply, bond.decimals, 0)} {bond.symbol}</dd>
            <dt>Current block</dt>
            <dd>{formatBlock(bond.blockNumber)}</dd>
          </dl>
          {!bond.keyStatus?.registered || !bond.keyStatus.possessionProven ? (
            <div style={{ marginTop: 14 }}>
              <Notice tone="danger" icon="!">
                The registered PQC key is not usable. Sensitive issuer actions will revert until a possession-proven
                ML-DSA-87 key is registered for {bond.pqcIssuer}.
              </Notice>
            </div>
          ) : (
            <p className="small muted" style={{ marginTop: 14 }}>
              Reconciliation excludes payment-token balances held outside the servicing contract; only the
              contract's own balance backs outstanding distributions.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
