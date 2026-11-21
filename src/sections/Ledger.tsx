import type { BondData } from "../hooks/useBondData";
import { formatBlock, formatPercent, formatToken } from "../lib/format";
import { Card, Empty, KeyValue, Notice, PageHeader, Pill, Progress, Stat } from "../components/ui";

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
  const claimRate =
    totals.required > 0n ? Number((totals.claimed * 10_000n) / totals.required) / 100 : 0;

  return (
    <div className="stack stack--lg">
      <PageHeader
        eyebrow="Reconciliation"
        title="Funded, claimed, outstanding"
        description={
          <>
            Every figure is a direct read of the servicing contract and the payment token. Amounts are in{" "}
            {bond.paymentSymbol} base units converted with {bond.paymentDecimals} decimals.
          </>
        }
        actions={<Pill>{formatBlock(bond.blockNumber)} latest block</Pill>}
      />

      <div className="stat-grid">
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
          foot={`${formatPercent(claimRate)} of coupon requirement paid out`}
        />
        <Stat
          label="Outstanding"
          value={formatToken(totals.outstanding + bond.redemption.outstanding, bond.paymentDecimals, 2)}
          unit={bond.paymentSymbol}
          foot="Funded but not yet claimed"
        />
      </div>

      <div className="ledger-flow">
        <Card
          title="Coupon period reconciliation"
          hint="Required is fixed at finalization; funded accumulates from treasurer top-ups; claimed accumulates from holder claims."
          flush
        >
          {bond.periods.length === 0 ? (
            <div className="card__pad">
              <Empty title="No coupon periods to reconcile">
                Nothing has been opened, finalized or funded yet. The table populates from chain reads as operations
                occur.
              </Empty>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th className="align-end">Required</th>
                    <th className="align-end">Funded</th>
                    <th className="align-end">Claimed</th>
                    <th className="align-end">Outstanding</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {bond.periods.map((period) => {
                    const fundedPct =
                      period.required > 0n ? Number((period.funded * 10_000n) / period.required) / 100 : 0;
                    return (
                      <tr key={period.id}>
                        <td data-label="Period">
                          <span className="mono">#{period.id}</span>
                          <span className="cell-note">block {formatBlock(period.recordDateBlock)}</span>
                        </td>
                        <td data-label="Required" className="num align-end">
                          {formatToken(period.required, bond.paymentDecimals, 2)}
                        </td>
                        <td data-label="Funded" className="num align-end">
                          {formatToken(period.funded, bond.paymentDecimals, 2)}
                        </td>
                        <td data-label="Claimed" className="num align-end">
                          {formatToken(period.claimed, bond.paymentDecimals, 2)}
                        </td>
                        <td data-label="Outstanding" className="num align-end">
                          {formatToken(period.outstanding, bond.paymentDecimals, 2)}
                        </td>
                        <td data-label="Funded">
                          <div className="share-cell">
                            <Progress
                              value={fundedPct}
                              tone={fundedPct >= 100 ? "green" : "gold"}
                              label={`Period ${period.id} funding`}
                            />
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

          <div className="balance-panel">
            <div className="field__label">Contract balance</div>
            <div className="balance-panel__value">
              {formatToken(contractBalance, bond.paymentDecimals, 2)}
              <small>{bond.paymentSymbol}</small>
            </div>
            <div className="balance-panel__coverage">
              <span>Coverage of liabilities</span>
              <span className="mono">{formatPercent(coverage)}</span>
            </div>
            <Progress value={coverage} tone={coverage >= 100 ? "green" : "gold"} label="Funding coverage" />
          </div>
          <KeyValue
            rows={[
              {
                label: "Total liabilities",
                value: `${formatToken(liabilities, bond.paymentDecimals, 2)} ${bond.paymentSymbol}`,
              },
              {
                label: "Unfunded coupons",
                value: `${formatToken(unfunded, bond.paymentDecimals, 2)} ${bond.paymentSymbol}`,
              },
              {
                label: "Unfunded redemption",
                value: `${formatToken(redemptionUnfunded, bond.paymentDecimals, 2)} ${bond.paymentSymbol}`,
              },
              {
                label: "Payment token supply",
                value: `${formatToken(bond.paymentTotalSupply, bond.paymentDecimals, 0)} ${bond.paymentSymbol}`,
              },
            ]}
          />
        </Card>
        <Card title="Redemption reconciliation" flush>
          {!bond.redemption.declared ? (
            <div className="card__pad">
              <Empty title="Redemption not declared">
                Principal remains unfunded and unclaimable until the issuer declares it after maturity.
              </Empty>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th className="align-end">Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td data-label="Bucket">Required</td>
                    <td data-label="Amount" className="num align-end">
                      {formatToken(bond.redemption.required, bond.paymentDecimals, 2)}
                    </td>
                    <td data-label="Status">
                      <Pill>Record block {formatBlock(bond.redemption.recordDateBlock)}</Pill>
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Bucket">Funded</td>
                    <td data-label="Amount" className="num align-end">
                      {formatToken(bond.redemption.funded, bond.paymentDecimals, 2)}
                    </td>
                    <td data-label="Status">
                      <Pill tone={bond.redemption.funded >= bond.redemption.required ? "ok" : "warn"}>
                        {bond.redemption.funded >= bond.redemption.required ? "Fully funded" : "Partial"}
                      </Pill>
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Bucket">Claimed</td>
                    <td data-label="Amount" className="num align-end">
                      {formatToken(bond.redemption.claimed, bond.paymentDecimals, 2)}
                    </td>
                    <td data-label="Status">
                      <Pill>
                        {formatPercent(
                          bond.redemption.required > 0n
                            ? Number((bond.redemption.claimed * 10_000n) / bond.redemption.required) / 100
                            : 0,
                        )}
                      </Pill>
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Bucket">Outstanding</td>
                    <td data-label="Amount" className="num align-end">
                      {formatToken(bond.redemption.outstanding, bond.paymentDecimals, 2)}
                    </td>
                    <td data-label="Status">
                      <Pill>Funded, unclaimed</Pill>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Control state">
          <KeyValue
            rows={[
              { label: "Authorization nonce", value: bond.nonce.toString() },
              { label: "PQC identity", value: `${bond.pqcIssuer.slice(0, 10)}…${bond.pqcIssuer.slice(-6)}` },
              { label: "Key registered", value: bond.keyStatus?.registered ? "Yes" : "No" },
              { label: "Possession proven", value: bond.keyStatus?.possessionProven ? "Yes" : "No" },
              { label: "Bond supply", value: `${formatToken(bond.totalSupply, bond.decimals, 0)} ${bond.symbol}` },
              { label: "Current block", value: formatBlock(bond.blockNumber) },
            ]}
          />
          {!bond.keyStatus?.registered || !bond.keyStatus.possessionProven ? (
            <div className="card__note-block">
              <Notice tone="danger" title="PQC key not usable">
                Sensitive issuer actions will revert until a possession-proven ML-DSA-87 key is registered for{" "}
                {bond.pqcIssuer}.
              </Notice>
            </div>
          ) : (
            <p className="card__note">
              Reconciliation excludes payment-token balances held outside the servicing contract; only the contract's
              own balance backs outstanding distributions.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
