import { useRef, type PointerEvent } from "react";
import { ADDRESSES, DOCS } from "../config";
import type { BondData } from "../hooks/useBondData";
import {
  bpsToPercent,
  couponPerToken,
  formatDate,
  formatPercent,
  formatToken,
  projectedSchedule,
} from "../lib/format";
import { Address, CopyButton, Pill } from "../components/ui";

export function Landing({
  bond,
  loading,
  onEnter,
}: {
  bond: BondData | null;
  loading: boolean;
  onEnter: (destination: "overview" | "portfolio") => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const terms = bond?.terms;
  const perToken = terms
    ? couponPerToken(terms.faceValuePerToken, terms.couponRateBps, terms.paymentsPerYear)
    : 0n;
  const schedule = terms ? projectedSchedule(terms.maturity, terms.paymentsPerYear, 6) : [];
  const now = Math.floor(Date.now() / 1000);
  const nextCoupon = schedule.find((date) => date > now);
  const paid = bond?.periods.reduce((sum, period) => sum + period.claimed, 0n) ?? 0n;
  const funded = bond?.periods.reduce((sum, period) => sum + period.funded, 0n) ?? 0n;
  const declared = bond?.redemption.declared ?? false;
  const issued = bond ? formatPercent(bond.totalSupply > 0n ? Number((bond.totalSupply * 10_000n) / bond.cap) / 100 : 0) : "—";

  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const element = stage.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    element.style.setProperty("--ry", `${x * 10}deg`);
    element.style.setProperty("--rx", `${y * -8}deg`);
  };

  const resetTilt = () => {
    const element = stage.current;
    if (!element) return;
    element.style.removeProperty("--ry");
    element.style.removeProperty("--rx");
  };

  return (
    <main className="cover">
      <div className="cover__ambient" aria-hidden="true" />
      <div className="container">
        <section className="cover__grid" aria-labelledby="cover-title">
          <div className="cover__main">
            <div className="eyebrow eyebrow--live">
              <span className="live-dot" aria-hidden="true" />
              PAR30 · QoreChain testnet
            </div>
            <h1 className="cover__title" id="cover-title">
              Par Bond
              <br />
              <em>2030</em>
            </h1>
            <p className="cover__lede">
              A fixed {terms ? `${bpsToPercent(terms.couponRateBps)}%` : "5%"} bond that pays twice a year. Every
              payout is approved, funded and recorded before anyone collects it.
            </p>

            <div className="cover__actions">
              <button type="button" className="btn btn--primary" onClick={() => onEnter("overview")}>
                Explore the bond
                <span aria-hidden="true">→</span>
              </button>
              <button type="button" className="btn btn--secondary" onClick={() => onEnter("portfolio")}>
                My holdings
              </button>
            </div>

            <dl className="tape" aria-label="Key terms">
              <div className="tape__item">
                <dt>Interest</dt>
                <dd>{terms ? `${bpsToPercent(terms.couponRateBps)}%` : "—"}</dd>
                <span>fixed a year</span>
              </div>
              <div className="tape__item">
                <dt>Paid</dt>
                <dd>{terms ? `${terms.paymentsPerYear}×` : "—"}</dd>
                <span>every year</span>
              </div>
              <div className="tape__item">
                <dt>Matures</dt>
                <dd>{terms ? formatDate(terms.maturity) : "—"}</dd>
                <span>principal back</span>
              </div>
              <div className="tape__item">
                <dt>Face value</dt>
                <dd>{terms ? formatToken(terms.faceValuePerToken, bond?.paymentDecimals ?? 6, 0) : "—"}</dd>
                <span>{bond?.paymentSymbol ?? "pUSD"} per bond</span>
              </div>
            </dl>

            <div className="cover__footnote">
              <span>Testnet demonstration · unaudited · no real funds</span>
              <span>{issued} of the maximum issued</span>
            </div>
          </div>

          <div
            className="certificate-stage"
            ref={stage}
            onPointerMove={tilt}
            onPointerLeave={resetTilt}
          >
            <div className="float-note float-note--a">
              <span className="float-note__dot" />
              Two keys approve every payout
            </div>

            <aside className="certificate" aria-label="Live bond certificate">
              <div className="certificate__head">
                <span>Bond certificate</span>
                <span className="certificate__serial">PAR30 · live</span>
              </div>

              <div className="certificate__seal" aria-hidden="true">
                <span className="certificate__seal-ring">Live</span>
                <span className="certificate__seal-small">QoreChain</span>
              </div>

              <div className="certificate__body">
                <div className="certificate__row certificate__row--large">
                  <span>Bond</span>
                  <strong>{bond?.name ?? "Par Bond 2030"}</strong>
                </div>
                <div className="certificate__row">
                  <span>In circulation</span>
                  <strong>
                    {bond
                      ? `${formatToken(bond.totalSupply, bond.decimals, 0)} ${bond.symbol}`
                      : loading
                        ? "reading…"
                        : "—"}
                  </strong>
                </div>
                <div className="certificate__row">
                  <span>Maximum issue</span>
                  <strong>{bond ? `${formatToken(bond.cap, bond.decimals, 0)} ${bond.symbol}` : "—"}</strong>
                </div>
                <div className="certificate__row">
                  <span>Interest per bond</span>
                  <strong>
                    {bond && terms
                      ? `${formatToken(perToken, bond.paymentDecimals, 2)} ${bond.paymentSymbol}`
                      : "—"}
                  </strong>
                </div>
                <div className="certificate__row">
                  <span>Holders</span>
                  <strong>{bond ? (bond.holdersComplete ? bond.holders.length : "—") : "—"}</strong>
                </div>
                <div className="certificate__row">
                  <span>Next interest</span>
                  <strong>{nextCoupon ? formatDate(nextCoupon) : "—"}</strong>
                </div>
                <div className="certificate__row">
                  <span>Approval key</span>
                  <strong className="mono">{bond ? <Address value={bond.pqcIssuer} chars={4} /> : "—"}</strong>
                </div>
              </div>

              <div className="certificate__foot">
                <div className="certificate__stamp">
                  <Pill tone="ok">Servicing live</Pill>
                  <Pill tone="gold">Two-key approved</Pill>
                </div>
                <div className="certificate__contract">
                  <span>Servicing contract</span>
                  <span className="mono">
                    {ADDRESSES.servicing.slice(0, 10)}…{ADDRESSES.servicing.slice(-6)}
                    <CopyButton value={ADDRESSES.servicing} label="Copy servicing address" />
                  </span>
                </div>
                <span className="certificate__fine">Live data · testnet certificate</span>
              </div>
            </aside>

            <div className="float-note float-note--b">
              {bond ? `${bond.periods.length} round${bond.periods.length === 1 ? "" : "s"} on chain` : "Reading the chain"}
            </div>
          </div>
        </section>

        <section className="cover__calendar" aria-label="Projected interest calendar">
          <div className="cover__calendar-head">
            <div>
              <span className="eyebrow">Interest calendar</span>
              <h2>When money is due</h2>
            </div>
            <span className="small muted">Projected dates. Each round gets its own snapshot.</span>
          </div>
          <div className="calendar-strip">
            {schedule.map((date, index) => {
              const past = date <= now;
              return (
                <div className={`calendar-tick${past ? " calendar-tick--past" : ""}`} key={date}>
                  <span className="calendar-tick__mark" />
                  <span className="calendar-tick__label">Interest {String(index + 1).padStart(2, "0")}</span>
                  <span className="calendar-tick__date">{formatDate(date)}</span>
                </div>
              );
            })}
            <div className="calendar-tick calendar-tick--maturity">
              <span className="calendar-tick__mark" />
              <span className="calendar-tick__label">Principal</span>
              <span className="calendar-tick__date">{terms ? formatDate(terms.maturity) : "—"}</span>
            </div>
          </div>
        </section>

        <section className="cover__section">
          <div className="cover__section-head">
            <div>
              <div className="eyebrow">How it works</div>
              <h2 className="cover__section-title">Three steps. Every payout.</h2>
            </div>
            <p>
              Nothing is paid from a spreadsheet. Each round is opened, approved, funded and collected on chain,
              in that order.
            </p>
          </div>
          <div className="mechanics">
            <div className="mechanic">
              <span className="mechanic__num">01</span>
              <h3>Set the snapshot</h3>
              <p>The issuer picks a future block. Whoever holds bonds at that moment earns this round's interest.</p>
            </div>
            <div className="mechanic">
              <span className="mechanic__num">02</span>
              <h3>Approve the amount</h3>
              <p>The amount is fixed, then approved with a second key that never touches the operating wallet.</p>
            </div>
            <div className="mechanic">
              <span className="mechanic__num">03</span>
              <h3>Fund, then collect</h3>
              <p>The full amount is added first. Each holder collects once, and the balance stays public.</p>
            </div>
          </div>
        </section>

        <section className="cover__split">
          <div>
            <div className="eyebrow">Two keys</div>
            <h2 className="cover__section-title">One wallet runs it. A separate key approves it.</h2>
            <p className="cover__split-copy">
              The operating wallet holds the role and pays network fees. A separate post-quantum key signs the
              exact payout offline and holds no role of its own. Neither can release money alone.
            </p>
            <div className="cover__split-actions">
              <a className="btn btn--secondary" href={DOCS.issuerSetup} target="_blank" rel="noreferrer">
                Read how approvals work
              </a>
              <a className="link-quiet" href={DOCS.deployment} target="_blank" rel="noreferrer">
                Deployment record
              </a>
            </div>
          </div>
          <div className="keys">
            <div className="keys__row">
              <span className="keys__tag">Key 01 · operating wallet</span>
              <span className="keys__value">Issuer</span>
              <span className="keys__role">Holds the role, sends the transaction, pays the fee</span>
            </div>
            <div className="keys__connector" aria-hidden="true">
              <span>signs the exact message · approval {bond ? bond.nonce.toString() : "0"}</span>
            </div>
            <div className="keys__row keys__row--pqc">
              <span className="keys__tag">Key 02 · approval</span>
              <span className="keys__value mono">
                {bond ? `${bond.pqcIssuer.slice(0, 8)}…${bond.pqcIssuer.slice(-4)}` : "ML-DSA-87"}
              </span>
              <span className="keys__role">
                {bond?.keyStatus?.registered && bond.keyStatus.possessionProven
                  ? "Signs offline · no role · cannot move money"
                  : "Status unavailable"}
              </span>
            </div>
            <div className="keys__note">
              Any authorised wallet can carry the signature on chain. The approval key never sends a transaction.
            </div>
          </div>
        </section>

        <section className="cover__ledger">
          <div className="cover__ledger-head">
            <div>
              <div className="eyebrow">Live records</div>
              <h2 className="cover__section-title">
                {bond && bond.periods.length > 0
                  ? `${bond.periods.length} round${bond.periods.length === 1 ? "" : "s"} on chain`
                  : "No payouts yet"}
              </h2>
            </div>
            <Pill tone="ok">Read from chain</Pill>
          </div>
          <div className="ledger-grid">
            <div>
              <span className="ledger-grid__label">Funded</span>
              <span className="ledger-grid__value">
                {bond ? formatToken(funded, bond.paymentDecimals, 2) : "—"}
                <small>{bond?.paymentSymbol}</small>
              </span>
            </div>
            <div>
              <span className="ledger-grid__label">Collected</span>
              <span className="ledger-grid__value">
                {bond ? formatToken(paid, bond.paymentDecimals, 2) : "—"}
                <small>{bond?.paymentSymbol}</small>
              </span>
            </div>
            <div>
              <span className="ledger-grid__label">Still to collect</span>
              <span className="ledger-grid__value">
                {bond ? formatToken(funded - paid, bond.paymentDecimals, 2) : "—"}
                <small>{bond?.paymentSymbol}</small>
              </span>
            </div>
            <div>
              <span className="ledger-grid__label">Principal</span>
              <span className="ledger-grid__value ledger-grid__value--text">
                {declared ? "Declared" : "Not yet"}
              </span>
            </div>
          </div>
          <p className="cover__ledger-note">
            {bond && bond.periods.length === 0
              ? "The first round appears here once the issuer opens it. Nothing can be funded or collected before then."
              : "A payout can only be collected after the full amount is funded. Every movement stays visible here."}
          </p>
        </section>

        <section className="cover__cta">
          <div>
            <span className="eyebrow eyebrow--light">Par Bond 2030 · {issued} issued</span>
            <h2>See the whole bond.</h2>
            <p>Read the terms, follow the rounds, check the numbers yourself.</p>
          </div>
          <div className="cover__cta-actions">
            <button type="button" className="btn btn--primary" onClick={() => onEnter("overview")}>
              Open the bond
            </button>
            <a className="btn btn--secondary" href={DOCS.acceptance} target="_blank" rel="noreferrer">
              How it was tested
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
