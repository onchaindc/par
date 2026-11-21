import { useEffect, useMemo, useState } from "react";
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

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "portfolio", label: "Portfolio" },
  { key: "issuer", label: "Issuer operations" },
  { key: "claims", label: "Claims" },
  { key: "ledger", label: "Reconciliation" },
];

export default function App() {
  const [tab, setTab] = useState<TabKey>("overview");
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
  }, [tab]);

  const data = bond.data;
  const openClaims = () => setTab("claims");

  return (
    <div className="shell">
      <header className="topbar">
        <div className="container">
          <div className="topbar__inner">
            <a className="brand" href="#top" onClick={() => setTab("overview")}>
              <span className="brand__mark">PAR</span>
              <span className="brand__sub">
                Bond servicing
                <br />
                QoreChain testnet
              </span>
            </a>
            <div className="topbar__spacer" />
            <span className="network">
              <span className={wallet.address && !wallet.isCorrectChain ? "network__dot network__dot--wrong" : "network__dot"} />
              {wallet.address
                ? wallet.isCorrectChain
                  ? qoreChain.name
                  : `Chain ${wallet.chainId ?? "?"}`
                : "Chain 9800 · Diana"}
            </span>
            {wallet.address ? (
              <>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  title="Copy address"
                  onClick={() => void navigator.clipboard.writeText(wallet.address!)}
                >
                  <span className="mono">{shortAddress(wallet.address, 4)}</span>
                </button>
                <button type="button" className="btn btn--ghost" onClick={wallet.disconnect}>
                  Disconnect
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
        <div className="container">
          <div className="banner">
            <span>
              Your wallet is on chain {wallet.chainId ?? "unknown"}. PAR is deployed on {qoreChain.name} (9800);
              reads below are unaffected, but transactions must be sent on the correct network.
            </span>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => void wallet.switchNetwork()}>
              Switch to 9800
            </button>
          </div>
        </div>
      )}

      {wallet.error && (
        <div className="container">
          <div className="banner" style={{ background: "var(--danger-tint)", color: "var(--danger)" }}>
            <span>{wallet.error}</span>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => void wallet.connect()}>
              Try again
            </button>
          </div>
        </div>
      )}

      {!wallet.hasProvider && (
        <div className="container">
          <div className="banner">
            <span>
              No browser wallet detected. Reads work without one; connect MetaMask or Rabby on QoreChain testnet to
              submit transactions.
            </span>
          </div>
        </div>
      )}

      <nav className="tabs" aria-label="Sections">
        <div className="container">
          <div className="tabs__inner" role="tablist">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                className="tab"
                onClick={() => setTab(item.key)}
              >
                {item.label}
                {item.key === "issuer" && data ? <span className="tab__count">{data.periods.length}</span> : null}
                {item.key === "claims" && data && data.periods.length > 0 ? (
                  <span className="tab__count">{data.periods.filter((period) => period.finalized).length} final</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="main" id="top">
        <div className="container">
          <div className="tabs-panel" role="tabpanel">
            {bond.error && !data ? (
              <div className="stack">
                <Notice tone="danger" icon="!">
                  Could not read the contracts from QoreChain. {bond.error}
                </Notice>
                <div>
                  <button type="button" className="btn btn--secondary" onClick={bond.refresh}>
                    Retry
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
                    <Notice tone="warn" icon="!">
                      Showing the last successful read; the latest refresh failed. {bond.error}
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

      <footer className="footer">
        <div className="container">
          <div className="footer__inner">
            <div className="stack" style={{ gap: 8 }}>
              <div className="issue-line">
                <span>Par Bond 2030 · PAR30</span>
                <span>Chain 9800</span>
                <span>{data ? `Block ${data.blockNumber.toString()}` : "Reading chain"}</span>
                <span>
                  {bond.updatedAt
                    ? `Updated ${bond.updatedAt.toLocaleTimeString("en-GB")}`
                    : "Awaiting first read"}
                </span>
              </div>
              <p className="small" style={{ maxWidth: "70ch" }}>
                Testnet demonstration only. Contracts are unaudited. This interface reads QoreChain and submits only
                the transactions you approve in your wallet; it never asks for a private key, seed phrase or PQC key
                file.
              </p>
            </div>
            <div className="stack" style={{ gap: 8, alignItems: "flex-end" }}>
              <button type="button" className="btn btn--ghost" onClick={refreshAll}>
                Refresh reads
              </button>
              <div className="btn-row" style={{ gap: 14 }}>
                <a className="link-quiet" href={DOCS.deployment} target="_blank" rel="noreferrer">
                  Deployment record
                </a>
                <a className="link-quiet" href={DOCS.issuerSetup} target="_blank" rel="noreferrer">
                  Issuer setup
                </a>
              </div>
              <div className="mono small muted">
                <Address value={ADDRESSES.servicing} chars={5} />
              </div>
            </div>
          </div>
        </div>
      </footer>

      <TxToast tx={tx} onClose={tx.reset} />
    </div>
  );
}
