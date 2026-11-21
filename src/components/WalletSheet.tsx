import { useEffect, useState } from "react";
import { qoreChain } from "../config";
import type { WalletState } from "../hooks/useWallet";
import type { WalletChoice } from "../wallet/discovery";
import { shortAddress } from "../lib/format";
import { Address, Notice } from "./ui";
import { Sheet } from "./Sheet";
import { IconArrowRight, IconExternal, IconQr, IconSwitch, IconWallet } from "./icons";

function WalletAvatar({ address }: { address: string }) {
  const hue = Array.from(address.slice(2, 8)).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  return (
    <span
      className="wallet-avatar"
      aria-hidden="true"
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 32% 32%), hsl(${(hue + 48) % 360} 34% 22%))`,
      }}
    >
      {address.slice(2, 4).toUpperCase()}
    </span>
  );
}

function WalletLogo({ wallet }: { wallet: WalletChoice }) {
  if (wallet.icon) {
    return (
      <span className="wallet-logo">
        <img src={wallet.icon} alt="" width={28} height={28} />
      </span>
    );
  }
  return (
    <span
      className="wallet-logo wallet-logo--mark"
      aria-hidden="true"
      style={{ background: `color-mix(in srgb, ${wallet.accent} 16%, var(--surface))`, color: wallet.accent }}
    >
      {wallet.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function WalletSheet({
  open,
  onClose,
  wallet,
}: {
  open: boolean;
  onClose: () => void;
  wallet: WalletState;
}) {
  const [pending, setPending] = useState<string>();

  useEffect(() => {
    if (!open) setPending(undefined);
  }, [open]);

  useEffect(() => {
    if (wallet.address) setPending(undefined);
  }, [wallet.address]);

  const connected = Boolean(wallet.address);
  const installed = wallet.wallets.filter((entry) => entry.installed);
  const installable = wallet.wallets.filter((entry) => !entry.installed);

  const connect = (choice: WalletChoice) => {
    setPending(choice.id);
    void wallet.connect(choice);
  };

  const connectWalletConnect = () => {
    setPending("walletconnect");
    void wallet.connectWalletConnect();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={connected ? "Wallet" : "Connect a wallet"}
      description={
        connected
          ? "The account this session uses for reads, claims and issuer operations."
          : "Reads work without a wallet. Connect to claim distributions or run issuer operations."
      }
    >
      {wallet.error ? (
        <div className="wallet-sheet__alert">
          <Notice tone="danger" title="Wallet request failed">
            {wallet.error}
            <button type="button" className="link-btn" onClick={wallet.clearError}>
              Dismiss
            </button>
          </Notice>
        </div>
      ) : null}

      {connected && wallet.address ? (
        <div className="wallet-account">
          <div className="wallet-account__top">
            <WalletAvatar address={wallet.address} />
            <div className="wallet-account__id">
              <div className="wallet-account__label">Connected</div>
              <div className="wallet-account__address mono">{shortAddress(wallet.address, 6)}</div>
              <div className="wallet-account__wallet">{wallet.walletName}</div>
            </div>
          </div>

          <div className="wallet-account__network">
            <div>
              <div className="field__label">Network</div>
              <div className="wallet-account__network-name">
                <span
                  className={wallet.isCorrectChain ? "network-dot" : "network-dot network-dot--bad"}
                  aria-hidden="true"
                />
                {wallet.isCorrectChain ? qoreChain.name : `Chain ${wallet.chainId ?? "unknown"}`}
              </div>
            </div>
            {wallet.isCorrectChain ? (
              <span className="wallet-account__chain mono">ID {qoreChain.id}</span>
            ) : (
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => void wallet.switchNetwork()}>
                <IconSwitch size={14} />
                Switch to {qoreChain.id}
              </button>
            )}
          </div>

          {!wallet.isCorrectChain ? (
            <Notice tone="warn">
              This wallet is on chain {wallet.chainId ?? "unknown"}. Switch to {qoreChain.name} ({qoreChain.id}) before
              submitting a transaction.
            </Notice>
          ) : null}

          <div className="wallet-account__address-full">
            <div className="field__label">Address</div>
            <Address value={wallet.address} full chars={6} />
          </div>

          <div className="wallet-sheet__actions">
            <button type="button" className="btn btn--secondary btn--block" onClick={() => void wallet.disconnect()}>
              Disconnect
            </button>
          </div>
          <p className="wallet-sheet__note">
            Disconnecting only ends this browser session. It never changes the on-chain record of your holdings.
          </p>
        </div>
      ) : (
        <div className="wallet-options">
          <div className="wallet-options__section">
            <div className="wallet-options__heading">
              <span>Browser wallets</span>
              <span className="wallet-options__count">
                {installed.length > 0 ? `${installed.length} detected` : "None detected"}
              </span>
            </div>
            {installed.length > 0 ? (
              <ul className="wallet-list">
                {installed.map((choice) => (
                  <li key={choice.id}>
                    <button
                      type="button"
                      className="wallet-option"
                      onClick={() => connect(choice)}
                      disabled={wallet.connecting && pending === choice.id}
                    >
                      <WalletLogo wallet={choice} />
                      <span className="wallet-option__text">
                        <span className="wallet-option__name">{choice.name}</span>
                        <span className="wallet-option__tag">{choice.tag ?? "Extension"}</span>
                      </span>
                      {pending === choice.id && wallet.connecting ? (
                        <span className="spinner" aria-hidden="true" />
                      ) : (
                        <IconArrowRight size={16} />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="wallet-none">
                <IconWallet size={18} />
                <p>
                  No browser wallet answered this page. Install MetaMask or Rabby, unlock it and reload — or scan the
                  WalletConnect code from a mobile wallet.
                </p>
              </div>
            )}
          </div>

          {installable.length > 0 ? (
            <div className="wallet-options__section wallet-options__install">
              <div className="wallet-options__heading">
                <span>Not detected</span>
              </div>
              <ul className="install-list">
                {installable.map((entry) => (
                  <li key={entry.id}>
                    <WalletLogo wallet={entry} />
                    <span className="wallet-option__name">{entry.name}</span>
                    <a
                      className="btn btn--ghost btn--sm"
                      href={entry.installUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Install
                      <IconExternal size={13} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="wallet-options__divider">
            <span>or</span>
          </div>

          <button
            type="button"
            className="wallet-option wallet-option--walletconnect"
            onClick={connectWalletConnect}
            disabled={!wallet.walletConnectAvailable || (wallet.connecting && pending === "walletconnect")}
          >
            <span className="wallet-logo wallet-logo--mark wallet-logo--qr" aria-hidden="true">
              <IconQr size={17} />
            </span>
            <span className="wallet-option__text">
              <span className="wallet-option__name">WalletConnect</span>
              <span className="wallet-option__tag">
                {wallet.walletConnectAvailable
                  ? "Scan with any mobile wallet"
                  : "Needs a Reown project id (VITE_REOWN_PROJECT_ID)"}
              </span>
            </span>
            {wallet.connecting && pending === "walletconnect" ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <IconArrowRight size={16} />
            )}
          </button>

          <p className="wallet-sheet__note">
            PAR never asks for a seed phrase, private key or PQC key file. Transactions are approved in your wallet.
          </p>
        </div>
      )}
    </Sheet>
  );
}
