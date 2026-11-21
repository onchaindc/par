import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  { key: "portfolio", label: "Portfolio", short: "Position", icon: <IconPortfolio size={18} /> },
  { key: "issuer", label: "Issuer operations", short: "Issuer", icon: <IconIssuer size={18} /> },
  { key: "claims", label: "Claims", short: "Claims", icon: <IconClaims size={18} /> },
  { key: "ledger", label: "Reconciliation", short: "Books", icon: <IconLedger size={18} /> },
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
  }, [tab]);

  const data = bond.data;
  const current = TABS.find((entry) => entry.key === tab) ?? TABS[0];
  const openWallet = () => setWalletOpen(true);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="brand-mark">PAR</span>
          <span className="brand-meta">
            Bond servicing
            <br />
            QoreChain testnet
          </span>
        </div>

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
                  {data.periods.filter((period) => period.finalized).length} final
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
              <span className="wallet-card__label">{wallet.address ? "Wallet connected" : "Wallet"}</span>
              <span className="wallet-card__value">
                {wallet.address ? shortAddress(wallet.address, 5) : "Connect to transact"}
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
          <div className="topbar__brand">
            <span className="brand-mark brand-mark--sm">PAR</span>
          </div>
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
                Your wallet is on chain {wallet.chainId ?? "unknown"}. PAR is deployed on {qoreChain.name} (9800);
                reads are unaffected, but transactions must be sent on the correct network.
              </div>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => void wallet.switchNetwork()}>
                Switch to 9800
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
                    Showing the last successful read; the latest refresh failed. {bond.error}
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
                Testnet demonstration only. Contracts are unaudited. This interface reads QoreChain and submits only
                the transactions you approve in your wallet; it never asks for a private key, seed phrase or PQC key
                file.
              </p>
            </div>
            <div className="footer__block footer__block--end">
              <button type="button" className="btn btn--ghost btn--sm" onClick={refreshAll}>
                <IconRefresh size={14} />
                Refresh reads
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
