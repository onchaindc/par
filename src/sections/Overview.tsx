import { ADDRESSES, DEPLOY_BLOCK, DOCS, qoreChain } from "../config";
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
import { Address, Card, Empty, KeyValue, PageHeader, Pill, Progress, Stat } from "../components/ui";
import { IconArrowRight } from "../components/icons";

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
  const projected = projectedSchedule(terms.maturity, terms.paymentsPerYear, 6);
  const faceValue = (bond.totalSupply * terms.faceValuePerToken) / 10n ** 18n;
  const keyReady = Boolean(bond.keyStatus?.registered && bond.keyStatus.possessionProven);
  const fundedPeriods = bond.periods.filter(
    (period) => period.finalized && period.funded >= period.required,
  ).length;

  return (
    <div className="stack stack--lg">
      <PageHeader
        eyebrow="Issue dossier · Par Bond 2030"
        title={bond.name}
        description="A fixed-rate tokenised bond with checkpointed ownership and pull-based servicing. Coupons and principal are funded by the treasurer and claimed by holders; sensitive issuer actions carry a post-quantum signature from a separate registered identity."
      >
        <div className="page-head__meta">
          <Pill tone="ok">Live on chain {qoreChain.id}</Pill>
          <Pill>{bpsToPercent(terms.couponRateBps)}% fixed rate</Pill>
          <Pill>{formatDate(terms.maturity)} maturity</Pill>
          <Pill tone="gold">
            {bond.holders.length} holder{bond.holders.length === 1 ? "" : "s"}
          </Pill>
        </div>
      </PageHeader>

      <div className="stat-grid">
        <Stat
          label="Bond supply"
          value={formatToken(bond.totalSupply, bond.decimals, 0)}
          unit={bond.symbol}
          foot={`Face value ${formatToken(faceValue, paymentDecimals, 2)} ${bond.paymentSymbol}`}
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

      <div className="layout-split">
        <Card
          title="Terms of issue"
          hint="Immutable terms read from BondServicing. They cannot be changed after deployment."
        >
          <KeyValue
            rows={[
              { label: "Bond token", value: <Address value={ADDRESSES.bond} chars={5} /> },
              { label: "Servicing contract", value: <Address value={ADDRESSES.servicing} chars={5} /> },
              {
                label: "Payment token",
                value: (
                  <span className="inline-value">
                    {bond.paymentSymbol}
                    <Address value={ADDRESSES.paymentToken} chars={4} />
                  </span>
                ),
              },
              { label: "Coupon rate", value: `${bpsToPercent(terms.couponRateBps)}% per annum` },
              { label: "Frequency", value: `${terms.paymentsPerYear} payments / year` },
              {
                label: "Face value per token",
                value: `${formatToken(terms.faceValuePerToken, paymentDecimals, 2)} ${bond.paymentSymbol}`,
              },
              { label: "Supply cap", value: `${formatToken(bond.cap, bond.decimals, 0)} ${bond.symbol}` },
              { label: "Maturity", value: formatDate(terms.maturity) },
              { label: "Record date method", value: "Block checkpoints" },
              { label: "Deployed at block", value: formatBlock(DEPLOY_BLOCK) },
              { label: "Latest block", value: formatBlock(bond.blockNumber) },
            ]}
          />
          <div className="terms-progress">
            <div className="terms-progress__head">
              <span>Supply issued</span>
              <span className="mono">{formatPercent(utilisation)}</span>
            </div>
            <Progress value={utilisation} label="Supply utilisation" />
          </div>
        </Card>

        <Card
          title="Post-quantum authorization"
          hint="Two identities, deliberately separate."
          actions={
            <Pill tone={keyReady ? "ok" : "bad"}>{keyReady ? "Key ready" : "Key unavailable"}</Pill>
          }
        >
          <div className="auth-blocks">
            <div className="auth-block">
              <div className="auth-block__label">Registered PQC signer</div>
              <Address value={bond.pqcIssuer} chars={6} />
              <p className="auth-block__detail">
                ML-DSA-87 · algorithm {bond.keyStatus?.algorithmId ?? "—"} ·{" "}
                {bond.keyStatus ? `${bond.keyStatus.publicKeyBytes.toLocaleString()} byte key` : "no key status"} ·{" "}
                {bond.keyStatus?.possessionProven ? "possession proven" : "possession unproven"}
              </p>
              {bond.keyFingerprint ? (
                <p className="auth-block__fingerprint mono" title={bond.keyFingerprint}>
                  SHA-256 {bond.keyFingerprint.slice(0, 16)}…{bond.keyFingerprint.slice(-8)}
                </p>
              ) : null}
            </div>
            <div className="auth-block">
              <div className="auth-block__label">Operational EVM issuer</div>
              <p className="auth-block__detail">
                A separate account holds <span className="mono">DEFAULT_ADMIN_ROLE</span> and{" "}
                <span className="mono">ISSUER_ROLE</span>, submits transactions and pays gas. It cannot produce the
                PQC signature.
              </p>
            </div>
            <div className="auth-block auth-block--inline">
              <div>
                <div className="auth-block__label">Authorization nonce</div>
                <div className="auth-block__nonce mono">{bond.nonce.toString()} consumed</div>
              </div>
              <p className="auth-block__detail">
                Each finalization or redemption declaration consumes one nonce, so a signature cannot be replayed.
              </p>
            </div>
          </div>
          <button type="button" className="btn btn--secondary btn--block" onClick={onOpenIssuer}>
            Open issuer operations
            <IconArrowRight size={15} />
          </button>
        </Card>
      </div>

      <div className="layout-split">
        <Card
          title="Coupon calendar"
          hint="Derived from the maturity date and payment frequency. Actual periods are opened by the issuer with a specific future record-date block."
          flush
        >
          <ol className="timeline">
            {projected.map((date, index) => (
              <li className="timeline__item" key={date}>
                <span className="timeline__marker" aria-hidden="true" />
                <div className="timeline__body">
                  <div className="timeline__title">Coupon {String(index + 1).padStart(2, "0")}</div>
                  <div className="timeline__meta">Projected · {formatDate(date)}</div>
                </div>
                <div className="timeline__value">
                  {formatToken(perPeriod, paymentDecimals, 4)}
                  <small>{bond.paymentSymbol} / token</small>
                </div>
              </li>
            ))}
            <li className="timeline__item timeline__item--final">
              <span className="timeline__marker" aria-hidden="true" />
              <div className="timeline__body">
                <div className="timeline__title">Principal</div>
                <div className="timeline__meta">Maturity · {formatDate(terms.maturity)}</div>
              </div>
              <div className="timeline__value">
                {formatToken(terms.faceValuePerToken, paymentDecimals, 2)}
                <small>{bond.paymentSymbol} / token</small>
              </div>
            </li>
          </ol>
        </Card>

        <Card
          title="Opened periods"
          hint="Coupon periods that exist on chain."
          actions={<Pill>{bond.periods.length} open</Pill>}
        >
          {bond.periods.length === 0 ? (
            <Empty
              title="No coupon period opened yet"
              action={
                <button type="button" className="btn btn--secondary btn--sm" onClick={onOpenIssuer}>
                  Open issuer operations
                </button>
              }
            >
              Nothing can be finalized or funded until a period exists and its record date has passed.
            </Empty>
          ) : (
            <ul className="period-list">
              {bond.periods.map((period) => (
                <li className="period-list__item" key={period.id}>
                  <div className="period-list__top">
                    <span className="mono">Period {period.id}</span>
                    <Pill tone={period.finalized ? "ok" : "warn"}>
                      {period.finalized ? "Finalized" : "Awaiting finalization"}
                    </Pill>
                  </div>
                  <p className="period-list__detail">
                    Record date block {formatBlock(period.recordDateBlock)}
                    {period.finalized
                      ? ` · ${formatToken(period.couponPerToken, paymentDecimals, 4)} ${bond.paymentSymbol} per token`
                      : " · amount fixed at finalization"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="opened-summary">
            <div>
              <span className="field__label">Funded and claimable</span>
              <span className="opened-summary__value">
                {fundedPeriods} of {bond.periods.length}
              </span>
            </div>
            <div>
              <span className="field__label">Servicing balance</span>
              <span className="opened-summary__value">
                {formatToken(bond.servicingPaymentBalance, paymentDecimals, 2)} {bond.paymentSymbol}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <Card
        title="Register of holders"
        hint="Derived from BondToken Transfer events since deployment; balances are current reads, not a stored holder list."
        flush
        actions={<Pill>{bond.holders.length} accounts</Pill>}
      >
        {bond.holders.length === 0 ? (
          <div className="card__pad">
            <Empty title="No token holders" />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table table--stack">
              <thead>
                <tr>
                  <th>Holder</th>
                  <th className="align-end">Balance</th>
                  <th>Share of supply</th>
                  <th className="align-end">Face value</th>
                </tr>
              </thead>
              <tbody>
                {bond.holders.map((holder) => {
                  const share =
                    bond.totalSupply > 0n ? Number((holder.balance * 10_000n) / bond.totalSupply) / 100 : 0;
                  return (
                    <tr key={holder.address}>
                      <td data-label="Holder">
                        <span className="mono">{shortAddress(holder.address, 6)}</span>
                      </td>
                      <td data-label="Balance" className="num align-end">
                        {formatToken(holder.balance, bond.decimals, 2)} {bond.symbol}
                      </td>
                      <td data-label="Share">
                        <div className="share-cell">
                          <Progress value={share} label={`${shortAddress(holder.address)} share`} />
                          <span className="num small">{formatPercent(share)}</span>
                        </div>
                      </td>
                      <td data-label="Face value" className="num align-end">
                        {formatToken(
                          (holder.balance * terms.faceValuePerToken) / 10n ** 18n,
                          paymentDecimals,
                          2,
                        )}{" "}
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

      <p className="page-note">
        Deployment record and verification:{" "}
        <a href={DOCS.deployment} target="_blank" rel="noreferrer">
          docs/deployment.md
        </a>
        . All values on this page are read from the contracts; nothing is cached or simulated.
      </p>
    </div>
  );
}
