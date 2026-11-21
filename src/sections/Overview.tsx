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
  const annualCoupon = (perPeriod * BigInt(terms.paymentsPerYear));
  const utilisation = bond.cap > 0n ? Number((bond.totalSupply * 10_000n) / bond.cap) / 100 : 0;
  const projected = projectedSchedule(terms.maturity, terms.paymentsPerYear, 8);
  const faceValue = (bond.totalSupply * terms.faceValuePerToken) / 10n ** 18n;
  const holders = bond.holders;

  return (
    <div className="stack">
      <div className="hero">
        <div>
          <div className="eyebrow">QoreChain testnet · Dematerialised bond issue</div>
          <h1 className="hero__title">
            {bond.name}
            <br />
            <em>{bond.symbol}</em>
          </h1>
          <p className="hero__lede">
            A fixed-rate, tokenised bond with checkpointed ownership and pull-based servicing. Coupons and
            principal are funded by the treasurer and claimed by holders; every sensitive issuer action carries
            a post-quantum signature from a separate registered identity.
          </p>
          <div className="hero__meta">
            <Pill tone="ok">Live on chain 9800</Pill>
            <Pill>{bpsToPercent(terms.couponRateBps)}% fixed</Pill>
            <Pill>{formatDate(terms.maturity)} maturity</Pill>
            <Pill tone="gold">{holders.length} holder{holders.length === 1 ? "" : "s"}</Pill>
          </div>
        </div>
        <div className="hero__facts">
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
            <span className="fact__value">{bond.paymentSymbol} · <Address value={ADDRESSES.paymentToken} chars={4} /></span>
          </div>
          <div className="fact">
            <span className="fact__label">Deployed at block</span>
            <span className="fact__value">{formatBlock(DEPLOY_BLOCK)}</span>
          </div>
          <div className="fact">
            <span className="fact__label">Latest block</span>
            <span className="fact__value">{formatBlock(bond.blockNumber)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid--4">
        <Stat
          label="Bond supply"
          value={formatToken(bond.totalSupply, bond.decimals, 0)}
          unit={bond.symbol}
          foot={`Face value ${formatToken(faceValue, paymentDecimals)} ${bond.paymentSymbol}`}
        />
        <Stat
          label="Cap utilisation"
          value={formatPercent(utilisation)}
          foot={`${formatToken(bond.totalSupply, bond.decimals, 0)} of ${formatToken(bond.cap, bond.decimals, 0)} authorised`}
        />
        <Stat
          label="Coupon per token"
          value={formatToken(perPeriod, paymentDecimals, 4)}
          unit={bond.paymentSymbol}
          foot={`Per period · ${formatToken(annualCoupon, paymentDecimals, 4)} annual`}
        />
        <Stat
          label="Maturity"
          value={formatDate(terms.maturity)}
          foot={`${relativeTime(terms.maturity)} · principal at face`}
        />
      </div>

      <div className="grid grid--sidebar">
        <Card
          title="Terms of issue"
          hint="Immutable terms read from BondServicing. The terms cannot be changed after deployment."
        >
          <dl className="kv">
            <dt>Issuer / administrator</dt>
            <dd>Operational EVM issuer</dd>
            <dt>Registered PQC signer</dt>
            <dd><Address value={bond.pqcIssuer} chars={5} /></dd>
            <dt>Payment token</dt>
            <dd>{bond.paymentSymbol} · {bond.paymentDecimals} decimals</dd>
            <dt>Coupon rate</dt>
            <dd>{bpsToPercent(terms.couponRateBps)}% per annum</dd>
            <dt>Frequency</dt>
            <dd>{terms.paymentsPerYear} payments / year</dd>
            <dt>Face value per token</dt>
            <dd>{formatToken(terms.faceValuePerToken, paymentDecimals, 2)} {bond.paymentSymbol}</dd>
            <dt>Coupon per token</dt>
            <dd>{formatToken(perPeriod, paymentDecimals, 4)} {bond.paymentSymbol}</dd>
            <dt>Supply cap</dt>
            <dd>{formatToken(bond.cap, bond.decimals, 0)} {bond.symbol}</dd>
            <dt>Maturity</dt>
            <dd>{formatDate(terms.maturity)}</dd>
            <dt>Record-date method</dt>
            <dd>Block checkpoints</dd>
          </dl>
          <div className="progress" style={{ marginTop: 18 }} aria-label="Supply utilisation">
            <div className="progress__bar" style={{ width: `${Math.min(100, utilisation)}%` }} />
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            {formatPercent(utilisation)} of the cap has been issued. Minting is capped on chain and requires the
            minter role.
          </p>
        </Card>

        <Card
          title="Post-quantum authorization"
          hint="Two identities, deliberately separate."
          actions={<Pill tone={bond.keyStatus?.registered && bond.keyStatus.possessionProven ? "ok" : "bad"}>
            {bond.keyStatus?.registered && bond.keyStatus.possessionProven ? "Key ready" : "Key unavailable"}
          </Pill>}
        >
          <div className="stack" style={{ gap: 12 }}>
            <div className="panel">
              <div className="panel__title">Registered PQC identity</div>
              <p><Address value={bond.pqcIssuer} chars={6} /></p>
              <p className="small muted" style={{ marginTop: 6 }}>
                ML-DSA-87 · algorithm {bond.keyStatus?.algorithmId ?? "—"} ·{" "}
                {bond.keyStatus ? `${bond.keyStatus.publicKeyBytes.toLocaleString()} byte key` : "no key status"} ·{" "}
                {bond.keyStatus?.possessionProven ? "possession proven" : "possession unproven"}
              </p>
              {bond.keyFingerprint ? (
                <p className="mono small muted" style={{ marginTop: 6 }} title={bond.keyFingerprint}>
                  SHA-256 {bond.keyFingerprint.slice(0, 16)}…{bond.keyFingerprint.slice(-8)}
                </p>
              ) : null}
            </div>
            <div className="panel">
              <div className="panel__title">Operational EVM issuer</div>
              <p>
                A separate account holds <span className="mono">DEFAULT_ADMIN_ROLE</span> and{" "}
                <span className="mono">ISSUER_ROLE</span>, submits transactions and pays gas. It cannot produce the
                PQC signature.
              </p>
            </div>
            <div className="panel">
              <div className="panel__title">Authorization nonce</div>
              <p className="mono">{bond.nonce.toString()} consumed</p>
              <p className="small muted" style={{ marginTop: 4 }}>
                Every finalization or redemption declaration consumes one nonce, so a signature cannot be replayed.
              </p>
            </div>
            <button type="button" className="btn btn--secondary btn--sm" onClick={onOpenIssuer}>
              Open issuer operations
            </button>
          </div>
        </Card>
      </div>

      <div className="grid grid--sidebar">
        <Card
          title="Coupon calendar"
          hint="Derived from the maturity date and payment frequency. Actual periods are opened by the issuer with a specific future record-date block."
          flush
        >
          <div className="schedule">
            {projected.map((date, index) => (
              <div className="schedule__row" key={date}>
                <span className="schedule__index">CPN {String(index + 1).padStart(2, "0")}</span>
                <span className="schedule__date">{formatDate(date)}</span>
                <span className="schedule__tag">Projected · {formatToken(perPeriod, paymentDecimals, 4)} {bond.paymentSymbol}/token</span>
              </div>
            ))}
            <div className="schedule__row" style={{ background: "var(--paper-deep)" }}>
              <span className="schedule__index">PRIN</span>
              <span className="schedule__date">{formatDate(terms.maturity)}</span>
              <span className="schedule__tag">Maturity · {formatToken(terms.faceValuePerToken, paymentDecimals, 2)} {bond.paymentSymbol}/token</span>
            </div>
          </div>
        </Card>

        <Card title="Opened periods" hint="Coupon periods that exist on chain.">
          {bond.periods.length === 0 ? (
            <Empty title="No coupon period opened yet">
              The issuer has not opened a coupon period. Nothing can be finalized or funded until a period
              exists and its record date has passed. <button type="button" className="btn btn--ghost" onClick={onOpenIssuer}>Open issuer operations</button>
            </Empty>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {bond.periods.map((period) => (
                <div className="panel" key={period.id}>
                  <div className="btn-row" style={{ justifyContent: "space-between" }}>
                    <span className="mono small">Period {period.id}</span>
                    <Pill tone={period.finalized ? "ok" : "warn"}>{period.finalized ? "Finalized" : "Awaiting finalization"}</Pill>
                  </div>
                  <p className="small muted" style={{ marginTop: 6 }}>
                    Record date block {formatBlock(period.recordDateBlock)}
                    {period.finalized
                      ? ` · ${formatToken(period.couponPerToken, paymentDecimals, 4)} ${bond.paymentSymbol}/token`
                      : " · coupon amount fixed at finalization"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Register of holders"
        hint="Derived from BondToken Transfer events since deployment; balances are current reads, not a stored holder list."
        flush
      >
        {holders.length === 0 ? (
          <div style={{ padding: "0 24px 24px" }}>
            <Empty title="No token holders" />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Holder</th>
                  <th>Balance</th>
                  <th>Share of supply</th>
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
                      <td className="num">{formatToken(holder.balance, bond.decimals, 2)} {bond.symbol}</td>
                      <td>
                        <div className="btn-row" style={{ gap: 10 }}>
                          <div className="progress" style={{ width: 90 }}>
                            <div className="progress__bar" style={{ width: `${Math.min(100, share)}%` }} />
                          </div>
                          <span className="num small">{formatPercent(share)}</span>
                        </div>
                      </td>
                      <td className="num">{formatToken((holder.balance * terms.faceValuePerToken) / 10n ** 18n, paymentDecimals, 2)} {bond.paymentSymbol}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="small muted">
        Deployment record and verification: <a href={DOCS.deployment} target="_blank" rel="noreferrer">docs/deployment.md</a>.
        All values on this page are read from the contracts; nothing is cached or simulated.
      </p>
    </div>
  );
}
