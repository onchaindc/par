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
        <div className="eyebrow">Records</div>
        <h2 className="section-title">Every amount, in one place</h2>
        <p className="section-sub">
          What the bond promises, what has been funded and what holders have collected. Read straight from the
          contracts; nothing is cached or simulated.
        </p>
      </div>

      <div className="grid grid--4">
        <Stat
          label="Promised"
          value={formatToken(totals.required + bond.redemption.required, bond.paymentDecimals, 2)}
          unit={bond.paymentSymbol}
          foot={`${bond.periods.length} interest round${bond.periods.length === 1 ? "" : "s"} plus principal`}
        />
        <Stat
          label="Funded"
          value={formatToken(totals.funded + bond.redemption.funded, bond.paymentDecimals, 2)}
          unit={bond.paymentSymbol}
          foot={`${formatToken(unfunded + redemptionUnfunded, bond.paymentDecimals, 2)} still to add`}
        />
        <Stat
          label="Collected"
          value={formatToken(totals.claimed + bond.redemption.claimed, bond.paymentDecimals, 2)}
          unit={bond.paymentSymbol}
          foot="Already in holders' wallets"
        />
        <Stat
          label="Waiting to collect"
          value={formatToken(totals.outstanding + bond.redemption.outstanding, bond.paymentDecimals, 2)}
          unit={bond.paymentSymbol}
          foot="Funded and ready for holders"
        />
      </div>

      <div className="grid grid--sidebar">
        <Card
          title="Interest rounds"
          hint="What each round needs, what has been added and what holders have collected."
          flush
        >
          {bond.periods.length === 0 ? (
            <div style={{ padding: "0 24px 24px" }}>
              <Empty title="No rounds to show">
                Open the first round and its numbers will appear here automatically.
              </Empty>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Round</th>
                    <th>Needed</th>
                    <th>Funded</th>
                    <th>Collected</th>
                    <th>Waiting</th>
                    <th>Covered</th>
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
                          <div className="small muted">snapshot {formatBlock(period.recordDateBlock)}</div>
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

        <Card title="Money held" hint="Funds sitting in the contract for payments that have not been collected yet.">
          <div className="stack" style={{ gap: 14 }}>
            <div>
              <div className="field__label">In the contract</div>
              <p className="stat__value" style={{ fontSize: 34, marginTop: 4 }}>
                {formatToken(contractBalance, bond.paymentDecimals, 2)}
                <small>{bond.paymentSymbol}</small>
              </p>
            </div>
            <dl className="kv">
              <dt>Promised in total</dt>
              <dd>{formatToken(liabilities, bond.paymentDecimals, 2)} {bond.paymentSymbol}</dd>
              <dt>Covered</dt>
              <dd>{formatPercent(coverage)}</dd>
              <dt>Still needed for interest</dt>
              <dd>{formatToken(unfunded, bond.paymentDecimals, 2)} {bond.paymentSymbol}</dd>
              <dt>Still needed for principal</dt>
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
        <Card title="Principal">
          {!bond.redemption.declared ? (
            <Empty title="Principal is not open yet">
              It becomes available after maturity, once the issuer declares it and adds the full amount.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Needed</td>
                    <td className="num">{formatToken(bond.redemption.required, bond.paymentDecimals, 2)}</td>
                    <td><Pill>Snapshot {formatBlock(bond.redemption.recordDateBlock)}</Pill></td>
                  </tr>
                  <tr>
                    <td>Funded</td>
                    <td className="num">{formatToken(bond.redemption.funded, bond.paymentDecimals, 2)}</td>
                    <td>
                      <Pill tone={bond.redemption.funded >= bond.redemption.required ? "ok" : "warn"}>
                        {bond.redemption.funded >= bond.redemption.required ? "Fully funded" : "Partly funded"}
                      </Pill>
                    </td>
                  </tr>
                  <tr>
                    <td>Collected</td>
                    <td className="num">{formatToken(bond.redemption.claimed, bond.paymentDecimals, 2)}</td>
                    <td><Pill>{formatPercent(bond.redemption.required > 0n ? Number((bond.redemption.claimed * 10_000n) / bond.redemption.required) / 100 : 0)}</Pill></td>
                  </tr>
                  <tr>
                    <td>Waiting</td>
                    <td className="num">{formatToken(bond.redemption.outstanding, bond.paymentDecimals, 2)}</td>
                    <td><Pill>Ready to collect</Pill></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Integrity checks">
          <dl className="kv">
            <dt>Approvals used</dt>
            <dd>{bond.nonce.toString()}</dd>
            <dt>Approval key</dt>
            <dd className="mono">{bond.pqcIssuer.slice(0, 10)}…{bond.pqcIssuer.slice(-6)}</dd>
            <dt>Key registered</dt>
            <dd>{bond.keyStatus?.registered ? "Yes" : "No"}</dd>
            <dt>Key verified</dt>
            <dd>{bond.keyStatus?.possessionProven ? "Yes" : "No"}</dd>
            <dt>Bonds issued</dt>
            <dd>{formatToken(bond.totalSupply, bond.decimals, 0)} {bond.symbol}</dd>
            <dt>Current block</dt>
            <dd>{formatBlock(bond.blockNumber)}</dd>
          </dl>
          {!bond.keyStatus?.registered || !bond.keyStatus.possessionProven ? (
            <div style={{ marginTop: 14 }}>
              <Notice tone="danger" title="The approval key needs attention">
                Payments cannot be approved until a valid key is registered for {bond.pqcIssuer}.
              </Notice>
            </div>
          ) : (
            <p className="small muted" style={{ marginTop: 14 }}>
              Only money inside the servicing contract counts towards these numbers. Wallet balances elsewhere are
              not included.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
