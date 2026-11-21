import { ADDRESSES } from "../config";
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
        eyebrow="Par Bond 2030"
        title={bond.name}
        description="A fixed-rate bond on QoreChain. Coupons are paid twice a year, principal at maturity."
      >
        <div className="page-head__meta">
          <Pill tone="ok">Live</Pill>
          <Pill>{bpsToPercent(terms.couponRateBps)}% fixed</Pill>
          <Pill>Matures {formatDate(terms.maturity)}</Pill>
          <Pill tone="gold">
            {bond.holders.length} holder{bond.holders.length === 1 ? "" : "s"}
          </Pill>
        </div>
      </PageHeader>

      <div className="stat-grid">
        <Stat
          label="Issued"
          value={formatToken(bond.totalSupply, bond.decimals, 0)}
          unit={bond.symbol}
          foot={`${formatToken(faceValue, paymentDecimals, 2)} ${bond.paymentSymbol} face value`}
        />
        <Stat
          label="Cap used"
          value={formatPercent(utilisation)}
          foot={`of ${formatToken(bond.cap, bond.decimals, 0)} ${bond.symbol} authorised`}
        />
        <Stat
          label="Coupon"
          value={formatToken(perPeriod, paymentDecimals, 4)}
          unit={bond.paymentSymbol}
          foot={`per token · ${formatToken(annualCoupon, paymentDecimals, 4)} a year`}
        />
        <Stat
          label="Maturity"
          value={formatDate(terms.maturity)}
          foot={`${relativeTime(terms.maturity)} · paid at face`}
        />
      </div>

      <div className="layout-split">
        <Card title="Terms" hint="Fixed at deployment and cannot change.">
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
          title="Signing keys"
          hint="Issuer actions need two separate identities."
          actions={<Pill tone={keyReady ? "ok" : "bad"}>{keyReady ? "Key ready" : "Key unavailable"}</Pill>}
        >
          <div className="auth-blocks">
            <div className="auth-block">
              <div className="auth-block__label">Post-quantum signer</div>
              <Address value={bond.pqcIssuer} chars={6} />
              <p className="auth-block__detail">
                ML-DSA-87 · {bond.keyStatus ? `${bond.keyStatus.publicKeyBytes.toLocaleString()} byte key` : "no key"} ·{" "}
                {bond.keyStatus?.possessionProven ? "proven" : "unproven"}
              </p>
              {bond.keyFingerprint ? (
                <p className="auth-block__fingerprint mono" title={bond.keyFingerprint}>
                  SHA-256 {bond.keyFingerprint.slice(0, 16)}…{bond.keyFingerprint.slice(-8)}
                </p>
              ) : null}
            </div>
            <div className="auth-block">
              <div className="auth-block__label">Operations wallet</div>
              <p className="auth-block__detail">Holds the issuer role and pays gas. It can't produce the PQC signature.</p>
            </div>
            <div className="auth-block auth-block--inline">
              <div className="auth-block__label">Nonce</div>
              <p className="auth-block__detail">
                <span className="mono">{bond.nonce.toString()}</span> used · each signature works once.
              </p>
            </div>
          </div>
          <button type="button" className="btn btn--secondary btn--block" onClick={onOpenIssuer}>
            Issuer operations
            <IconArrowRight size={15} />
          </button>
        </Card>
      </div>

      <div className="layout-split">
        <Card title="Coupon schedule" hint="Projected dates. The issuer opens each period on chain." flush>
          <ol className="timeline">
            {projected.map((date, index) => (
              <li className="timeline__item" key={date}>
                <span className="timeline__marker" aria-hidden="true" />
                <div className="timeline__body">
                  <div className="timeline__title">Coupon {index + 1}</div>
                  <div className="timeline__meta">{formatDate(date)}</div>
                </div>
                <div className="timeline__value">
                  {formatToken(perPeriod, paymentDecimals, 4)} {bond.paymentSymbol}
                  <small>per token</small>
                </div>
              </li>
            ))}
            <li className="timeline__item timeline__item--final">
              <span className="timeline__marker" aria-hidden="true" />
              <div className="timeline__body">
                <div className="timeline__title">Principal</div>
                <div className="timeline__meta">{formatDate(terms.maturity)}</div>
              </div>
              <div className="timeline__value">
                {formatToken(terms.faceValuePerToken, paymentDecimals, 2)} {bond.paymentSymbol}
                <small>per token</small>
              </div>
            </li>
          </ol>
        </Card>

        <Card
          title="Active periods"
          actions={<Pill>{bond.periods.length || "None"}</Pill>}
        >
          {bond.periods.length === 0 ? (
            <Empty
              title="No coupon period yet"
              action={
                <button type="button" className="btn btn--secondary btn--sm" onClick={onOpenIssuer}>
                  Issuer operations
                </button>
              }
            >
              The issuer hasn't opened one. Once they do, it appears here.
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
                    Record block {formatBlock(period.recordDateBlock)}
                    {period.finalized
                      ? ` · ${formatToken(period.couponPerToken, paymentDecimals, 4)} ${bond.paymentSymbol} per token`
                      : " · amount set at finalization"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="opened-summary">
            <div>
              <span className="field__label">Funded</span>
              <span className="opened-summary__value">
                {fundedPeriods} of {bond.periods.length}
              </span>
            </div>
            <div>
              <span className="field__label">Held for payouts</span>
              <span className="opened-summary__value">
                {formatToken(bond.servicingPaymentBalance, paymentDecimals, 2)} {bond.paymentSymbol}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <Card
        title="Holders"
        flush
        actions={<Pill>{bond.holders.length || "None"}</Pill>}
      >
        {bond.holders.length === 0 ? (
          <div className="card__pad">
            <Empty title="No holders yet" />
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

    </div>
  );
}
