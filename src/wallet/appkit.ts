import { qoreChain, REOWN_PROJECT_ID } from "../config";
import type { Eip1193Provider } from "./discovery";

export type WalletConnectState = { address?: `0x${string}`; chainId?: number };

export type WalletConnectSession = {
  /** Opens the Reown AppKit modal on the connect view. */
  open: () => void;
  /** Closes the modal without disconnecting. */
  close: () => void;
  /** Ends the WalletConnect session and clears the adapter's account state. */
  disconnect: () => Promise<void>;
  /** EIP-1193 provider for the active WalletConnect session, once connected. */
  getProvider: () => Promise<Eip1193Provider | undefined>;
  current: () => WalletConnectState;
  watch: (listener: (state: WalletConnectState) => void) => () => void;
};

export function walletConnectConfigured(): boolean {
  return REOWN_PROJECT_ID.length > 0;
}

let sessionPromise: Promise<WalletConnectSession> | null = null;

/**
 * Reown AppKit is loaded on demand so the injected-wallet path stays light and
 * the app still runs when no WalletConnect project id is configured.
 */
export function loadWalletConnect(): Promise<WalletConnectSession> {
  if (!walletConnectConfigured()) {
    return Promise.reject(
      new Error(
        "WalletConnect is not configured. Set VITE_REOWN_PROJECT_ID to a Reown project id and reload.",
      ),
    );
  }
  if (!sessionPromise) {
    sessionPromise = initialise().catch((error: unknown) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

async function initialise(): Promise<WalletConnectSession> {
  const [{ createAppKit }, { WagmiAdapter }, { defineChain: defineAppKitChain }, wagmiCore] =
    await Promise.all([
      import("@reown/appkit"),
      import("@reown/appkit-adapter-wagmi"),
      import("@reown/appkit/networks"),
      import("@wagmi/core"),
    ]);

  const network = defineAppKitChain({
    id: qoreChain.id,
    caipNetworkId: `eip155:${qoreChain.id}`,
    chainNamespace: "eip155",
    name: qoreChain.name,
    nativeCurrency: qoreChain.nativeCurrency,
    rpcUrls: { default: { http: [...qoreChain.rpcUrls.default.http] } },
  });

  const adapter = new WagmiAdapter({
    networks: [network],
    projectId: REOWN_PROJECT_ID,
    ssr: false,
  });

  const origin = typeof window === "undefined" ? "https://par.example" : window.location.origin;

  const modal = createAppKit({
    adapters: [adapter],
    networks: [network],
    projectId: REOWN_PROJECT_ID,
    metadata: {
      name: "PAR Bond Servicing",
      description: "Par Bond 2030 servicing on QoreChain testnet",
      url: origin,
      icons: [`${origin}/par-mark.svg`],
    },
    themeMode: "light",
    themeVariables: {
      "--w3m-accent": "#0f4738",
      "--w3m-color-mix": "#f4f1e9",
      "--w3m-color-mix-strength": 12,
      "--w3m-border-radius-master": "3px",
      "--w3m-font-family": "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    chainImages: {
      [qoreChain.id]: `${origin}/par-mark.svg`,
    },
    features: {
      analytics: false,
      email: false,
      socials: false,
      swaps: false,
      onramp: false,
      receive: false,
      send: false,
      history: false,
    },
  });

  const readAccount = () => {
    const account = wagmiCore.getAccount(adapter.wagmiConfig);
    return {
      address: (account.address ?? undefined) as `0x${string}` | undefined,
      chainId: account.chainId ?? undefined,
    };
  };

  return {
    open: () => modal.open({ view: "Connect" }),
    close: () => modal.close(),
    disconnect: async () => {
      try {
        await modal.disconnect();
      } finally {
        await wagmiCore.disconnect(adapter.wagmiConfig).catch(() => undefined);
      }
    },
    getProvider: async () => {
      const account = wagmiCore.getAccount(adapter.wagmiConfig);
      if (!account.connector) return undefined;
      try {
        return (await account.connector.getProvider()) as unknown as Eip1193Provider;
      } catch {
        return undefined;
      }
    },
    current: readAccount,
    watch: (listener) =>
      wagmiCore.watchAccount(adapter.wagmiConfig, {
        onChange: (account) =>
          listener({
            address: (account.address ?? undefined) as `0x${string}` | undefined,
            chainId: account.chainId ?? undefined,
          }),
      }),
  };
}
