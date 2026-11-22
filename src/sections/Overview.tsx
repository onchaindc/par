import { ADDRESSES, DEPLOY_BLOCK, DOCS } from "../config";
import type { BondData } from "../hooks/useBondData";
import {
  bpsToPercent,
  couponPerToken,
  formatBlock,
  formatDate,
  formatPercent,
  formatToken,
  projectedSchedule,
  relativeTime,
  shortAddress,
} from "../lib/format";
import { Address, Card, Empty, Pill, Stat } from "../components/ui";

export function Overview({
  bond,
  onOpenIssuer,
}: {
  bond: BondData;
  onOpenIssuer: () => void;
}) {
  const { terms, paymentDecimals } = bond;
  const perPeriod = couponPerToken(terms.faceValuePerToken, terms.couponRateBps, terms.paymentsPerYear);
  const annualCoupon = perPeriod * BigInt(terms.paymentsPerYear);
  const utilisation = bond.cap > 0n ? Number((bond.totalSupply * 10_000n) / bond.cap) / 100 : 0;
  const projected = projectedSchedule(terms.maturity, terms.paymentsPerYear, 8);
  const faceValue = (bond.totalSupply * terms.faceValuePerToken) / 10n ** 18n;
  const holders = bond.holders;
  const keyReady = Boolean(bond.keyStatus?.registered && bond.keyStatus.possessionProven);

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero__copy">
          <div className="eyebrow">PAR30 · QoreChain testnet</div>
          <h1 className="hero__title">
            Par Bond <em>2030</em>
          </h1>
          <p className="hero__lede">
            A fixed-rate bond that pays {bpsToPercent(terms.couponRateBps)}% a year in two payments, until it matures in
            2030. Every payout is approved, funded and recorded on chain before anyone can collect it.
          </p>
          <div className="hero__meta">
            <Pill tone="ok">Live on testnet</Pill>
            <Pill>{bpsToPercent(terms.couponRateBps)}% a year</Pill>
            <Pill>{formatDate(terms.maturity)} maturity</Pill>
            <Pill tone="gold">
              {holders.length} holder{holders.length === 1 ? "" : "s"}
            </Pill>
          </div>
        </div>

        <div className="hero__art" aria-hidden="true">
          <span className="hero__art-ring hero__art-ring--outer" />
          <span className="hero__art-ring hero__art-ring--inner" />
          <div className="hero__art-core">
            <span>{bpsToPercent(terms.couponRateBps)}%</span>
            <small>fixed · paid twice a year</small>
          </div>
          <span className="hero__art-chip hero__art-chip--top">Matures 2030</span>
          <span className="hero__art-chip hero__art-chip--bottom">{formatToken(perPeriod, paymentDecimals, 2)} {bond.paymentSymbol} per bond</span>
        </div>
      </section>

      <div className="grid grid--4">
        <Stat
          label="Bonds issued"
          value={formatToken(bond.totalSupply, bond.decimals, 0)}
          unit={bond.symbol}
          foot={`Face value ${formatToken(faceValue, paymentDecimals)} ${bond.paymentSymbol}`}
        />
        <Stat
          label="Of maximum"
          value={formatPercent(utilisation)}
          foot={`${formatToken(bond.cap, bond.decimals, 0)} authorised in total`}
        />
        <Stat
          label="Interest per bond"
          value={formatToken(perPeriod, paymentDecimals, 4)}
          unit={bond.paymentSymbol}
          foot={`${formatToken(annualCoupon, paymentDecimals, 4)} a year`}
        />
        <Stat
          label="Matures"
          value={formatDate(terms.maturity)}
          foot={`${relativeTime(terms.maturity)} · principal at face`}
        />
      </div>

      <div className="grid grid--sidebar">
        <Card title="The basics" hint="Fixed when the bond launched. These terms cannot change.">
          <dl className="kv">
            <dt>Who runs it</dt>
            <dd>The issuer</dd>
            <dt>Second signing key</dt>
            <dd>
              <Address value={bond.pqcIssuer} chars={5} />
            </dd>
            <dt>Payments in</dt>
            <dd>{bond.paymentSymbol}</dd>
            <dt>Interest</dt>
            <dd>{bpsToPercent(terms.couponRateBps)}% a year</dd>
            <dt>Paid</dt>
            <dd>{terms.paymentsPerYear === 2 ? "Twice a year" : `${terms.paymentsPerYear} times a year`}</dd>
            <dt>Face value</dt>
            <dd>
              {formatToken(terms.faceValuePerToken, paymentDecimals, 2)} {bond.paymentSymbol} per bond
            </dd>
            <dt>Each payment</dt>
            <dd>
              {formatToken(perPeriod, paymentDecimals, 4)} {bond.paymentSymbol} per bond
            </dd>
            <dt>Maximum issue</dt>
            <dd>
              {formatToken(bond.cap, bond.decimals, 0)} {bond.symbol}
            </dd>
            <dt>Maturity</dt>
            <dd>{formatDate(terms.maturity)}</dd>
            <dt>Who gets paid</dt>
            <dd>Balance at a set block</dd>
          </dl>
          <div className="progress" style={{ marginTop: 18 }} aria-label="Supply utilisation">
            <div className="progress__bar" style={{ width: `${Math.min(100, utilisation)}%` }} />
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            {formatPercent(utilisation)} of the maximum has been issued. The cap is enforced on chain.
          </p>
          <details className="details">
            <summary>Contract details</summary>
            <div className="details__body">
              <div className="fact">
                <span className="fact__label">Bond token</span>
                <span className="fact__value"><Address value={ADDRESSES.bond} chars={5} /></span>
              </div>
              <div className="fact">
                <span className="fact__label">Servicing</span>
                <span className="fact__value"><Address value={ADDRESSES.servicing} chars={5} /></span>
              </div>
              <div className="fact">
                <span className="fact__label">Payment token</span>
                <span className="fact__value">{bond.paymentSymbol} · {bond.paymentDecimals} decimals</span>
              </div>
              <div className="fact">
                <span className="fact__label">Deployed</span>
                <span className="fact__value">Block {formatBlock(DEPLOY_BLOCK)}</span>
              </div>
              <div className="fact">
                <span className="fact__label">Latest block</span>
                <span className="fact__value">{formatBlock(bond.blockNumber)}</span>
              </div>
            </div>
          </details>
        </Card>

        <Card
          title="Two-key approval"
          hint="Every payout needs a second, independent signature. One key alone cannot release money."
          actions={
            <Pill tone={keyReady ? "ok" : "bad"}>{keyReady ? "Key ready" : "Key unavailable"}</Pill>
          }
        >
          <div className="keys-mini">
            <div className="keys-mini__step">
              <span className="keys-mini__num">1</span>
              <div>
                <strong>The issuer sets the amount</strong>
                <p>The operational wallet prepares the payout and pays the network fee.</p>
              </div>
            </div>
            <div className="keys-mini__step">
              <span className="keys-mini__num">2</span>
              <div>
                <strong>The second key approves it</strong>
                <p>A separate post-quantum key signs the exact amount offline.</p>
              </div>
            </div>
            <div className="keys-mini__step">
              <span className="keys-mini__num">3</span>
              <div>
                <strong>The chain checks both</strong>
                <p>Money can only be funded and collected after both checks pass.</p>
              </div>
            </div>
          </div>

          <details className="details">
            <summary>Technical details</summary>
            <div className="details__body">
              <p className="small muted">
                ML-DSA-87 · algorithm {bond.keyStatus?.algorithmId ?? "—"} ·{" "}
                {bond.keyStatus ? `${bond.keyStatus.publicKeyBytes.toLocaleString()} byte key` : "no key status"} ·{" "}
                {bond.keyStatus?.possessionProven ? "possession proven" : "possession unproven"}
              </p>
              {bond.keyFingerprint ? (
                <p className="mono small muted" title={bond.keyFingerprint}>
                  SHA-256 {bond.keyFingerprint.slice(0, 16)}…{bond.keyFingerprint.slice(-8)}
                </p>
              ) : null}
              <p className="small muted">
                Approvals used: {bond.nonce.toString()}. Each approval can be used once, so a signature cannot be
                replayed.
              </p>
            </div>
          </details>

          <button type="button" className="btn btn--secondary btn--block" style={{ marginTop: 16 }} onClick={onOpenIssuer}>
            Manage the bond
          </button>
        </Card>
      </div>

      <div className="grid grid--sidebar">
        <Card
          title="Interest schedule"
          hint="Projected from the maturity date and payment frequency. The issuer sets the exact date for each round."
          flush
        >
          <div className="schedule">
            {projected.map((date, index) => (
              <div className="schedule__row" key={date}>
                <span className="schedule__index">{String(index + 1).padStart(2, "0")}</span>
                <span className="schedule__date">{formatDate(date)}</span>
                <span className="schedule__tag">
                  {formatToken(perPeriod, paymentDecimals, 4)} {bond.paymentSymbol} per bond
                </span>
              </div>
            ))}
            <div className="schedule__row schedule__row--final">
              <span className="schedule__index">End</span>
              <span className="schedule__date">{formatDate(terms.maturity)}</span>
              <span className="schedule__tag">
                Principal · {formatToken(terms.faceValuePerToken, paymentDecimals, 2)} {bond.paymentSymbol} per bond
              </span>
            </div>
          </div>
        </Card>

        <Card title="Interest rounds" hint="Each round is one payout. Hold the bond at the snapshot block to qualify.">
          {bond.periods.length === 0 ? (
            <Empty title="No rounds opened yet">
              When the issuer opens the first round, it will appear here with its snapshot date and amount.
            </Empty>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {bond.periods.map((period) => (
                <div className="round" key={period.id}>
                  <div className="round__top">
                    <span className="round__name">Round {period.id}</span>
                    <Pill tone={period.finalized ? "ok" : "warn"}>
                      {period.finalized ? "Paid" : "Waiting for approval"}
                    </Pill>
                  </div>
                  <p className="round__meta">
                    Snapshot at block {formatBlock(period.recordDateBlock)}
                    {period.finalized
                      ? ` · ${formatToken(period.couponPerToken, paymentDecimals, 4)} ${bond.paymentSymbol} per bond`
                      : " · amount is set when approved"}
                  </p>
                  {period.finalized ? (
                    <div className="progress">
                      <div
                        className="progress__bar"
                        style={{ width: `${period.required > 0n ? Math.min(100, Number((period.funded * 100n) / period.required)) : 100}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Who holds the bonds"
        hint="Built from transfer history. Balances are live reads, not a stored list."
        flush
      >
        {!bond.holdersComplete && holders.length === 0 ? (
          <div style={{ padding: "0 24px 24px" }}>
            <Empty title="The holder list isn't available right now">
              The network didn't return the full transfer history. Your own balance still reads correctly, and the
              list will rebuild on the next refresh.
            </Empty>
          </div>
        ) : holders.length === 0 ? (
          <div style={{ padding: "0 24px 24px" }}>
            <Empty title="No bonds are held yet">
              Once the bond is issued to a holder, their balance will appear here.
            </Empty>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Holder</th>
                  <th>Bonds</th>
                  <th>Share</th>
                  <th>Face value</th>
                </tr>
              </thead>
              <tbody>
                {holders.map((holder) => {
                  const share = bond.totalSupply > 0n ? Number((holder.balance * 10_000n) / bond.totalSupply) / 100 : 0;
                  return (
                    <tr key={holder.address}>
                      <td>
                        <span className="mono">{shortAddress(holder.address, 6)}</span>
                      </td>
                      <td className="num">
                        {formatToken(holder.balance, bond.decimals, 2)} {bond.symbol}
                      </td>
                      <td>
                        <div className="share">
                          <div className="progress" style={{ width: 80 }}>
                            <div className="progress__bar" style={{ width: `${Math.min(100, share)}%` }} />
                          </div>
                          <span className="num small">{formatPercent(share)}</span>
                        </div>
                      </td>
                      <td className="num">
                        {formatToken((holder.balance * terms.faceValuePerToken) / 10n ** 18n, paymentDecimals, 2)}{" "}
                        {bond.paymentSymbol}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="small muted">
        Every number here comes from the contracts.{" "}
        <a href={DOCS.deployment} target="_blank" rel="noreferrer">
          See how the bond was deployed
        </a>
        .
      </p>
    </div>
  );
}
