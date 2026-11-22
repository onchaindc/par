import { useEffect, useState } from "react";

/** Minimal EIP-1193 surface used by the app. */
export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isBraveWallet?: boolean;
  providers?: Eip1193Provider[];
};

export type WalletOrigin = "injected" | "walletconnect";

export type WalletChoice = {
  /** Stable identifier: the EIP-6963 rdns when announced, otherwise a synthetic id. */
  id: string;
  name: string;
  provider: Eip1193Provider;
  accent: string;
  /** Wallet-announced logo (data URI) when the wallet supports EIP-6963. */
  icon?: string;
  tag?: string;
  /** Detected in the browser. Entries with `installUrl` are not installed. */
  installed: boolean;
  installUrl?: string;
};

type AnnounceDetail = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193Provider;
};

const KNOWN: Record<string, { name: string; accent: string }> = {
  "io.metamask": { name: "MetaMask", accent: "#e2761b" },
  "io.rabby": { name: "Rabby", accent: "#6b7cff" },
  "com.coinbase.wallet": { name: "Coinbase Wallet", accent: "#0052ff" },
  "io.brave": { name: "Brave Wallet", accent: "#fb542b" },
  "app.phantom": { name: "Phantom", accent: "#ab9ff2" },
};

const INSTALLABLE = [
  { id: "io.metamask", name: "MetaMask", accent: "#e2761b", installUrl: "https://metamask.io/download/" },
  { id: "io.rabby", name: "Rabby", accent: "#6b7cff", installUrl: "https://rabby.io/" },
];

function knownId(provider: Eip1193Provider): string | undefined {
  if (provider.isRabby) return "io.rabby";
  if (provider.isMetaMask) return "io.metamask";
  if (provider.isCoinbaseWallet) return "com.coinbase.wallet";
  if (provider.isBraveWallet) return "io.brave";
  return undefined;
}

function legacyProviders(): Eip1193Provider[] {
  if (typeof window === "undefined") return [];
  const injected = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  if (!injected) return [];
  const nested = Array.isArray(injected.providers) ? injected.providers.filter(Boolean) : [];
  return nested.length > 0 ? nested : [injected];
}

/**
 * EIP-6963 discovery with a legacy `window.ethereum` fallback. Announcements are
 * the authoritative source; the legacy provider is only added when no wallet
 * already announced the same provider object.
 */
export function useWalletDiscovery(): WalletChoice[] {
  const [wallets, setWallets] = useState<WalletChoice[]>([]);

  useEffect(() => {
    const announced = new Map<string, WalletChoice>();

    const publish = () => {
      const announcedProviders = new Set([...announced.values()].map((entry) => entry.provider));
      const legacy: WalletChoice[] = [];
      for (const provider of legacyProviders()) {
        if (announcedProviders.has(provider)) continue;
        const id = knownId(provider);
        const meta = id ? KNOWN[id] : undefined;
        const synthetic = id ?? "injected";
        if (announced.has(synthetic) || legacy.some((entry) => entry.id === synthetic)) continue;
        legacy.push({
          id: synthetic,
          name: meta?.name ?? "Browser wallet",
          provider,
          accent: meta?.accent ?? "#124b3a",
          tag: id ? "Extension" : "Injected",
          installed: true,
        });
      }

      const rank = (name: string) => {
        if (name === "MetaMask") return 0;
        if (name === "Rabby") return 1;
        if (name === "Browser wallet") return 9;
        return 4;
      };

      const list = [...announced.values(), ...legacy]
        .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
        .concat(
          INSTALLABLE.filter((entry) => !announced.has(entry.id))
            .filter((entry) => ![...announced.values(), ...legacy].some((wallet) => wallet.id === entry.id))
            .map((entry) => ({
              id: entry.id,
              name: entry.name,
              accent: entry.accent,
              provider: null as unknown as Eip1193Provider,
              installed: false,
              installUrl: entry.installUrl,
            })),
        );

      setWallets(list);
    };

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<AnnounceDetail>).detail;
      if (!detail?.info?.rdns || !detail.provider) return;
      const meta = KNOWN[detail.info.rdns];
      announced.set(detail.info.rdns, {
        id: detail.info.rdns,
        name: meta?.name ?? detail.info.name,
        provider: detail.provider,
        icon: detail.info.icon,
        accent: meta?.accent ?? "#124b3a",
        tag: "Extension",
        installed: true,
      });
      publish();
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    publish();

    // Some legacy wallets never announce; settle the list once they have had a chance to answer.
    const timer = window.setTimeout(publish, 400);

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      window.clearTimeout(timer);
    };
  }, []);

  return wallets;
}

export function parseChainId(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = value.startsWith("0x") ? Number.parseInt(value, 16) : Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
