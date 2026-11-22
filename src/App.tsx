import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Landing } from "./sections/Landing";
import { Overview } from "./sections/Overview";
import { Portfolio } from "./sections/Portfolio";
import { Issuer } from "./sections/Issuer";
import { Claims } from "./sections/Claims";
import { Ledger } from "./sections/Ledger";
import { useWallet } from "./hooks/useWallet";
import { useBondData } from "./hooks/useBondData";
import { useAccountData } from "./hooks/useAccountData";
import { useTx } from "./hooks/useTx";
import { ADDRESSES, DOCS, qoreChain } from "./config";
import { Address, Notice, Skeleton, TxToast } from "./components/ui";
import { shortAddress } from "./lib/format";

type TabKey = "overview" | "portfolio" | "issuer" | "claims" | "ledger";

const TABS: Array<{ key: TabKey; label: string; aria: string }> = [
  { key: "overview", label: "Issue", aria: "Issue overview" },
  { key: "portfolio", label: "Bonds", aria: "My bonds" },
  { key: "issuer", label: "Manage", aria: "Manage the bond" },
  { key: "claims", label: "Payments", aria: "Payments" },
  { key: "ledger", label: "Records", aria: "Records" },
];

function TabIcon({ tab }: { tab: TabKey }) {
  const paths: Record<TabKey, ReactNode> = {
    overview: (
      <>
        <rect x="3.5" y="3" width="13" height="14" rx="2.5" />
        <path d="M6.5 7h7M6.5 10h7M6.5 13h4" />
      </>
    ),
    portfolio: (
      <>
        <path d="M3.5 8.5 10 5l6.5 3.5L10 12 3.5 8.5Z" />
        <path d="m3.5 12 6.5 3.5L16.5 12" />
      </>
    ),
    issuer: (
      <>
        <path d="M4 6h12M4 10h12M4 14h12" />
        <circle cx="7" cy="6" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="12.5" cy="10" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="8.5" cy="14" r="1.6" fill="currentColor" stroke="none" />
      </>
    ),
    claims: (
      <>
        <path d="M10 3v8m0 0 3-3m-3 3L7 8" />
        <path d="M4 13.5v1A2.5 2.5 0 0 0 6.5 17h7a2.5 2.5 0 0 0 2.5-2.5v-1" />
      </>
    ),
    ledger: (
      <>
        <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" />
        <path d="M3.5 8h13M8 8v8.5" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[tab]}
    </svg>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [showCover, setShowCover] = useState(() => {
    try {
      return sessionStorage.getItem("par:entered") !== "1";
    } catch {
      return true;
    }
  });
  const wallet = useWallet();
  const bond = useBondData();
  const periodIds = useMemo(() => bond.data?.periods.map((period) => period.id) ?? [], [bond.data?.periods]);
  const account = useAccountData(wallet.address, periodIds, bond.data?.redemption.declared ?? false);
  const tx = useTx();

  const refreshAll = () => {
    bond.refresh();
    account.refresh();
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [tab, showCover]);

  const data = bond.data;
  const openClaims = () => setTab("claims");

  const enter = (destination: TabKey = "overview") => {
    try {
      sessionStorage.setItem("par:entered", "1");
    } catch {
      /* private mode */
    }
    setTab(destination);
    setShowCover(false);
  };

  const openCover = () => {
    try {
      sessionStorage.removeItem("par:entered");
    } catch {
      /* private mode */
    }
    setShowCover(true);
    window.scrollTo({ top: 0 });
  };

  const networkLabel = wallet.address
    ? wallet.isCorrectChain
      ? "Testnet"
      : `Chain ${wallet.chainId ?? "?"}`
    : "Testnet";

  return (
    <div className={showCover ? "shell shell--cover" : "shell"}>
      <header className="topbar">
        <div className="container topbar__inner">
          <a
            className="brand"
            href="#top"
            aria-label="PAR — back to the issue cover"
            onClick={(event) => {
              event.preventDefault();
              openCover();
            }}
          >
            <span className="brand__mark" aria-hidden="true">
              P
            </span>
            <span className="brand__text">
              <span className="brand__word">PAR</span>
              <span className="brand__sub">Bond 2030</span>
            </span>
          </a>

          {!showCover && (
            <nav className="tabs" aria-label="Sections">
              <div className="tabs__inner" role="tablist">
                {TABS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-label={item.aria}
                    aria-selected={tab === item.key}
                    className="tab"
                    onClick={() => setTab(item.key)}
                  >
                    <TabIcon tab={item.key} />
                    <span className="tab__label">{item.label}</span>
                  </button>
                ))}
              </div>
            </nav>
          )}

          <div className="topbar__right">
            {showCover ? (
              <button type="button" className="btn btn--primary btn--sm appbar__enter" onClick={() => enter("overview")}>
                Enter app
                <span aria-hidden="true">→</span>
              </button>
            ) : null}

            <span className={`network${wallet.address && !wallet.isCorrectChain ? " network--wrong" : ""}`} title={qoreChain.name}>
              <span className="network__dot" />
              <span className="network__text">{networkLabel}</span>
            </span>

            {wallet.address ? (
              <>
                <button
                  type="button"
                  className="wallet-chip"
                  title="Copy your address"
                  onClick={() => void navigator.clipboard.writeText(wallet.address!)}
                >
                  <span className="wallet-chip__dot" aria-hidden="true" />
                  <span className="mono">{shortAddress(wallet.address, 4)}</span>
                </button>
                <button type="button" className="icon-btn" onClick={wallet.disconnect} aria-label="Disconnect" title="Disconnect">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 6V4.5A1.5 1.5 0 0 0 10.5 3h-5A1.5 1.5 0 0 0 4 4.5v11A1.5 1.5 0 0 0 5.5 17h5a1.5 1.5 0 0 0 1.5-1.5V14" />
                    <path d="M9 10h8m0 0-3-3m3 3-3 3" />
                  </svg>
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => void wallet.connect()}
                disabled={wallet.connecting}
              >
                {wallet.connecting ? <span className="spinner" /> : null}
                {wallet.connecting ? "Connecting" : "Connect wallet"}
              </button>
            )}
          </div>
        </div>
      </header>

      {wallet.address && !wallet.isCorrectChain && (
        <div className="container alerts">
          <Notice
            tone="warn"
            title="This wallet is on the wrong network"
            actions={
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => void wallet.switchNetwork()}>
                Switch network
              </button>
            }
          >
            Switch to {qoreChain.name} to manage or collect. Reading the bond works on any network.
          </Notice>
        </div>
      )}

      {wallet.error && (
        <div className="container alerts">
          <Notice tone="danger" title="The wallet didn't connect" actions={
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => void wallet.connect()}>
              Try again
            </button>
          }>
            {wallet.error}
          </Notice>
        </div>
      )}

      {showCover ? (
        <Landing bond={data} loading={bond.loading} onEnter={(destination) => enter(destination)} />
      ) : (
        <main className="main" id="top">
          <div className="container">
            <div className="tabs-panel" role="tabpanel" key={tab}>
              {bond.error && !data ? (
                <div className="stack">
                  <Notice tone="danger" title="The chain didn't answer">
                    We couldn't read the bond just now. {bond.error}
                  </Notice>
                  <div>
                    <button type="button" className="btn btn--secondary" onClick={bond.refresh}>
                      Try again
                    </button>
                  </div>
                </div>
              ) : !data ? (
                <div className="stack">
                  <div className="skeleton" style={{ width: "30%", height: 12 }} />
                  <div className="skeleton" style={{ width: "62%", height: 54 }} />
                  <div className="skeleton" style={{ width: "44%", height: 14 }} />
                  <div className="grid grid--4">
                    <Skeleton stat />
                    <Skeleton stat />
                    <Skeleton stat />
                    <Skeleton stat />
                  </div>
                  <div className="grid grid--sidebar">
                    <Skeleton height={260} />
                    <Skeleton height={260} />
                  </div>
                </div>
              ) : (
                <>
                  {bond.error ? (
                    <div className="stack" style={{ marginBottom: 20 }}>
                      <Notice tone="warn" title="Showing the last good read">
                        The latest refresh didn't go through. {bond.error}
                      </Notice>
                    </div>
                  ) : null}

                  {tab === "overview" && <Overview bond={data} onOpenIssuer={() => setTab("issuer")} />}
                  {tab === "portfolio" && (
                    <Portfolio
                      bond={data}
                      account={account.data}
                      wallet={wallet}
                      onConnect={() => void wallet.connect()}
                      onOpenClaims={openClaims}
                    />
                  )}
                  {tab === "issuer" && (
                    <Issuer
                      bond={data}
                      account={account.data}
                      wallet={wallet}
                      tx={tx}
                      refreshAll={refreshAll}
                      onConnect={() => void wallet.connect()}
                    />
                  )}
                  {tab === "claims" && (
                    <Claims
                      bond={data}
                      account={account.data}
                      wallet={wallet}
                      tx={tx}
                      onConnect={() => void wallet.connect()}
                      refreshAll={refreshAll}
                    />
                  )}
                  {tab === "ledger" && <Ledger bond={data} />}
                </>
              )}
            </div>
          </div>
        </main>
      )}

      <footer className={showCover ? "footer footer--cover" : "footer"}>
        <div className="container">
          <div className="footer__top">
            <div className="footer__brand">
              <span className="brand__mark brand__mark--light" aria-hidden="true">
                P
              </span>
              <div>
                <div className="footer__word">PAR</div>
                <p>
                  A small, transparent bond desk on QoreChain. Read every number, follow every payout, connect a
                  wallet only when you need to act.
                </p>
              </div>
            </div>

            <div className="footer__links">
              <div>
                <span className="footer__label">The bond</span>
                <button type="button" onClick={() => enter("overview")}>Issue details</button>
                <button type="button" onClick={() => enter("portfolio")}>My bonds</button>
                <button type="button" onClick={() => enter("claims")}>Collect a payment</button>
              </div>
              <div>
                <span className="footer__label">Reference</span>
                <a href={DOCS.issuerSetup} target="_blank" rel="noreferrer">How it works</a>
                <a href={DOCS.deployment} target="_blank" rel="noreferrer">Deployment record</a>
                <a href={DOCS.acceptance} target="_blank" rel="noreferrer">Acceptance record</a>
              </div>
            </div>

            <div className="footer__status">
              <span className="footer__label">Live status</span>
              <div className="footer__status-row">
                <span className="network__dot" />
                <span>{qoreChain.name}</span>
              </div>
              <div className="footer__status-row footer__status-row--muted">
                <span>Block</span>
                <span className="mono">{data ? data.blockNumber.toString() : "reading…"}</span>
              </div>
              <div className="footer__status-row footer__status-row--muted">
                <span>Updated</span>
                <span>{bond.updatedAt ? bond.updatedAt.toLocaleTimeString("en-GB") : "—"}</span>
              </div>
              <button type="button" className="footer__refresh" onClick={refreshAll}>
                Refresh data
                <span aria-hidden="true">↻</span>
              </button>
            </div>
          </div>

          <div className="footer__bottom">
            <span>Testnet only · unaudited · no real funds</span>
            <span className="footer__contract">
              Servicing
              <span className="mono">
                <Address value={ADDRESSES.servicing} chars={5} />
              </span>
            </span>
            <span>Par Bond 2030 · PAR30</span>
          </div>
        </div>
      </footer>

      <TxToast tx={tx} onClose={tx.reset} />
    </div>
  );
}
