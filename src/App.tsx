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
import { Address, Notice, Skeleton } from "./components/ui";
import { WalletSheet } from "./components/WalletSheet";
import { TxToast } from "./components/TxToast";
import {
  IconAlert,
  IconChevron,
  IconClaims,
  IconIssuer,
  IconLedger,
  IconOverview,
  IconPortfolio,
  IconRefresh,
  IconWallet,
} from "./components/icons";
import { shortAddress } from "./lib/format";
import type { WalletState } from "./hooks/useWallet";

type TabKey = "overview" | "portfolio" | "issuer" | "claims" | "ledger";

const TABS: Array<{ key: TabKey; label: string; short: string; icon: ReactNode }> = [
  { key: "overview", label: "Overview", short: "Overview", icon: <IconOverview size={18} /> },
  { key: "portfolio", label: "Your position", short: "Position", icon: <IconPortfolio size={18} /> },
  { key: "issuer", label: "Issuer", short: "Issuer", icon: <IconIssuer size={18} /> },
  { key: "claims", label: "Claims", short: "Claims", icon: <IconClaims size={18} /> },
  { key: "ledger", label: "Funds", short: "Funds", icon: <IconLedger size={18} /> },
];

function WalletButton({ wallet, onClick }: { wallet: WalletState; onClick: () => void }) {
  const connected = Boolean(wallet.address);
  return (
    <button
      type="button"
      className={connected ? "wallet-btn wallet-btn--connected" : "wallet-btn"}
      onClick={onClick}
      aria-haspopup="dialog"
    >
      {connected ? (
        <span
          className={wallet.isCorrectChain ? "network-dot" : "network-dot network-dot--bad"}
          aria-hidden="true"
        />
      ) : (
        <IconWallet size={15} />
      )}
      <span className="wallet-btn__label">
        {connected ? shortAddress(wallet.address, 4) : "Connect wallet"}
      </span>
      <IconChevron size={14} />
    </button>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [walletOpen, setWalletOpen] = useState(false);
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
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
  }, [tab, showCover]);

  const data = bond.data;
  const current = TABS.find((entry) => entry.key === tab) ?? TABS[0];
  const openWallet = () => setWalletOpen(true);

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
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
  };

  if (showCover) {
    return (
      <div className="cover-shell">
        <header className="cover-topbar">
          <div className="container cover-topbar__inner">
            <button type="button" className="cover-brand" aria-label="PAR — issue cover">
              <span className="brand-mark">PAR</span>
              <span className="cover-brand__meta">
                <span>Par Bond 2030</span>
                <span>QoreChain testnet</span>
              </span>
            </button>
            <div className="cover-topbar__actions">
              <span className="chain-chip">
                <span className="network-dot" aria-hidden="true" />
                <span className="chain-chip__text">Chain 9800</span>
              </span>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => enter("overview")}>
                Enter app
              </button>
              <WalletButton wallet={wallet} onClick={openWallet} />
            </div>
          </div>
        </header>

        <Landing bond={data} loading={bond.loading} onEnter={enter} />

        <footer className="cover-footer">
          <div className="container cover-footer__inner">
            <span>Testnet only · contracts unaudited · no real funds. Reading needs no wallet.</span>
            <span className="cover-footer__links">
              <a href={DOCS.issuerSetup} target="_blank" rel="noreferrer">How it works</a>
              <a href={DOCS.deployment} target="_blank" rel="noreferrer">Deployment record</a>
              <a href={DOCS.acceptance} target="_blank" rel="noreferrer">Acceptance record</a>
            </span>
          </div>
        </footer>

        <WalletSheet open={walletOpen} onClose={() => setWalletOpen(false)} wallet={wallet} />
        <TxToast tx={tx} onClose={tx.reset} />
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <button type="button" className="sidebar__brand" onClick={openCover} aria-label="PAR — back to the issue cover">
          <span className="brand-mark">PAR</span>
          <span className="brand-meta">
            Par Bond 2030
            <br />
            QoreChain testnet
          </span>
        </button>

        <nav className="side-nav" aria-label="Sections">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className="side-nav__item"
              aria-current={tab === item.key ? "page" : undefined}
              onClick={() => setTab(item.key)}
            >
              <span className="side-nav__icon">{item.icon}</span>
              <span className="side-nav__label">{item.label}</span>
              {item.key === "issuer" && data ? <span className="side-nav__badge">{data.periods.length}</span> : null}
              {item.key === "claims" && data && data.periods.length > 0 ? (
                <span className="side-nav__badge">
                  {data.periods.filter((period) => period.finalized).length}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar__foot">
          <button type="button" className="wallet-card" onClick={openWallet}>
            <span className="wallet-card__icon">
              <IconWallet size={17} />
            </span>
            <span className="wallet-card__text">
              <span className="wallet-card__label">{wallet.address ? "Wallet" : "Not connected"}</span>
              <span className="wallet-card__value">
                {wallet.address ? shortAddress(wallet.address, 5) : "Connect wallet"}
              </span>
            </span>
            {wallet.address ? (
              <span
                className={wallet.isCorrectChain ? "network-dot" : "network-dot network-dot--bad"}
                aria-hidden="true"
              />
            ) : (
              <IconChevron size={14} />
            )}
          </button>

          <div className="chain-state">
            <div className="chain-state__row">
              <span>{qoreChain.name}</span>
              <span className="mono">9800</span>
            </div>
            <div className="chain-state__row chain-state__row--muted">
              <span>{data ? `Block ${data.blockNumber.toString()}` : "Reading chain"}</span>
              <span>{bond.updatedAt ? bond.updatedAt.toLocaleTimeString("en-GB") : "—"}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <button type="button" className="topbar__brand" onClick={openCover} aria-label="PAR — back to the issue cover">
            <span className="brand-mark brand-mark--sm">PAR</span>
          </button>
          <div className="topbar__eyebrow">
            <span>Par Bond 2030</span>
            <span className="topbar__sep" aria-hidden="true">
              /
            </span>
            <span className="topbar__section">{current.label}</span>
          </div>
          <div className="topbar__actions">
            <span className="chain-chip">
              <span
                className={wallet.address && !wallet.isCorrectChain ? "network-dot network-dot--bad" : "network-dot"}
                aria-hidden="true"
              />
              <span className="chain-chip__text">
                {wallet.address && !wallet.isCorrectChain ? `Chain ${wallet.chainId ?? "?"}` : "Chain 9800"}
              </span>
            </span>
            <WalletButton wallet={wallet} onClick={openWallet} />
          </div>
        </header>

        <nav className="subnav" aria-label="Sections">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className="subnav__item"
              aria-current={tab === item.key ? "page" : undefined}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <main className="page" id="top">
          {wallet.address && !wallet.isCorrectChain ? (
            <div className="banner banner--warn">
              <IconAlert size={17} />
              <div className="banner__text">
                You're on chain {wallet.chainId ?? "unknown"}. Switch to {qoreChain.name} to send transactions.
              </div>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => void wallet.switchNetwork()}>
                Switch to {qoreChain.id}
              </button>
            </div>
          ) : null}

          {wallet.error && !walletOpen ? (
            <div className="banner banner--bad">
              <IconAlert size={17} />
              <div className="banner__text">{wallet.error}</div>
              <button type="button" className="btn btn--secondary btn--sm" onClick={openWallet}>
                Open wallet
              </button>
            </div>
          ) : null}

          {bond.error && !data ? (
            <div className="state-block">
              <Notice tone="danger" title="Could not read the contracts">
                {bond.error}
              </Notice>
              <button type="button" className="btn btn--secondary" onClick={bond.refresh}>
                <IconRefresh size={15} />
                Retry
              </button>
            </div>
          ) : !data ? (
            <div className="stack stack--lg">
              <div className="stack">
                <Skeleton width="180px" height={12} />
                <Skeleton width="min(420px, 70%)" height={40} />
                <Skeleton width="min(560px, 90%)" height={14} />
              </div>
              <div className="stat-grid">
                <Skeleton stat />
                <Skeleton stat />
                <Skeleton stat />
                <Skeleton stat />
              </div>
              <div className="layout-split">
                <Skeleton height={280} />
                <Skeleton height={280} />
              </div>
            </div>
          ) : (
            <>
              {bond.error ? (
                <div className="banner banner--warn">
                  <IconAlert size={17} />
                  <div className="banner__text">
                    Showing your last read — refresh failed. {bond.error}
                  </div>
                </div>
              ) : null}

              {tab === "overview" ? <Overview bond={data} onOpenIssuer={() => setTab("issuer")} /> : null}
              {tab === "portfolio" ? (
                <Portfolio
                  bond={data}
                  account={account.data}
                  wallet={wallet}
                  onConnect={openWallet}
                  onOpenClaims={() => setTab("claims")}
                />
              ) : null}
              {tab === "issuer" ? (
                <Issuer
                  bond={data}
                  account={account.data}
                  wallet={wallet}
                  tx={tx}
                  refreshAll={refreshAll}
                  onConnect={openWallet}
                />
              ) : null}
              {tab === "claims" ? (
                <Claims
                  bond={data}
                  account={account.data}
                  wallet={wallet}
                  tx={tx}
                  onConnect={openWallet}
                  refreshAll={refreshAll}
                />
              ) : null}
              {tab === "ledger" ? <Ledger bond={data} /> : null}
            </>
          )}
        </main>

        <footer className="footer">
          <div className="footer__inner">
            <div className="footer__block">
              <div className="issue-line">
                <span>Par Bond 2030 · PAR30</span>
                <span>Chain 9800</span>
                <span>{data ? `Block ${data.blockNumber.toString()}` : "Reading chain"}</span>
                <span>
                  {bond.updatedAt ? `Updated ${bond.updatedAt.toLocaleTimeString("en-GB")}` : "Awaiting first read"}
                </span>
              </div>
              <p className="footer__note">
                Testnet demo · contracts unaudited. PAR never asks for a private key, seed phrase or PQC key file.
              </p>
            </div>
            <div className="footer__block footer__block--end">
              <button type="button" className="btn btn--ghost btn--sm" onClick={refreshAll}>
                <IconRefresh size={14} />
                Refresh
              </button>
              <div className="footer__links">
                <a href={DOCS.deployment} target="_blank" rel="noreferrer">
                  Deployment record
                </a>
                <a href={DOCS.issuerSetup} target="_blank" rel="noreferrer">
                  Issuer setup
                </a>
              </div>
              <div className="footer__address">
                <Address value={ADDRESSES.servicing} chars={5} />
              </div>
            </div>
          </div>
        </footer>
      </div>

      <nav className="bottom-nav" aria-label="Sections">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className="bottom-nav__item"
            aria-current={tab === item.key ? "page" : undefined}
            onClick={() => setTab(item.key)}
          >
            <span className="bottom-nav__icon">{item.icon}</span>
            <span className="bottom-nav__label">{item.short}</span>
          </button>
        ))}
      </nav>

      <WalletSheet open={walletOpen} onClose={() => setWalletOpen(false)} wallet={wallet} />
      <TxToast tx={tx} onClose={tx.reset} />
    </div>
  );
}
