import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createWalletClient, custom, type WalletClient } from "viem";
import { CHAIN_ID_HEX, qoreChain } from "../config";
import { errorMessage } from "../lib/format";
import {
  parseChainId,
  useWalletDiscovery,
  type Eip1193Provider,
  type WalletChoice,
  type WalletOrigin,
} from "../wallet/discovery";
import { walletErrorMessage } from "../wallet/errors";
import { loadWalletConnect, walletConnectConfigured, type WalletConnectSession } from "../wallet/appkit";

const STORAGE_KEY = "par.wallet.v1";

export type WalletStatus = "idle" | "connecting" | "connected" | "error";

export type WalletState = {
  address?: `0x${string}`;
  chainId?: number;
  isCorrectChain: boolean;
  status: WalletStatus;
  connecting: boolean;
  error?: string;
  /** Name of the wallet currently in use, e.g. MetaMask or WalletConnect. */
  walletName?: string;
  origin?: WalletOrigin;
  /** Detected wallets plus install entries for wallets that were not found. */
  wallets: WalletChoice[];
  hasInjectedWallet: boolean;
  walletConnectAvailable: boolean;
  connect: (choice: WalletChoice) => Promise<void>;
  connectWalletConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
  clearError: () => void;
  walletClient?: WalletClient;
};

type StoredChoice = { id: string; name: string };

function readStored(): StoredChoice | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredChoice;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

export function useWallet(): WalletState {
  const wallets = useWalletDiscovery();
  const [provider, setProvider] = useState<Eip1193Provider>();
  const [address, setAddress] = useState<`0x${string}`>();
  const [chainId, setChainId] = useState<number>();
  const [status, setStatus] = useState<WalletStatus>("idle");
  const [error, setError] = useState<string>();
  const [walletName, setWalletName] = useState<string>();
  const [origin, setOrigin] = useState<WalletOrigin>();
  const walletConnect = useRef<WalletConnectSession | null>(null);
  const originRef = useRef<WalletOrigin | undefined>(undefined);
  const restored = useRef(false);
  const connectTimeout = useRef<number | undefined>(undefined);

  const setSource = useCallback((next: WalletOrigin | undefined) => {
    originRef.current = next;
    setOrigin(next);
  }, []);

  const reset = useCallback(
    (options?: { keepError?: boolean }) => {
      if (connectTimeout.current) window.clearTimeout(connectTimeout.current);
      setProvider(undefined);
      setAddress(undefined);
      setChainId(undefined);
      setWalletName(undefined);
      setSource(undefined);
      setStatus("idle");
      if (!options?.keepError) setError(undefined);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* storage may be unavailable */
      }
    },
    [setSource],
  );

  // Live account and chain events from the active injected provider.
  useEffect(() => {
    if (!provider || origin !== "injected") return;
    const active = provider;

    const onAccounts = (...args: unknown[]) => {
      const accounts = (args[0] as string[] | undefined) ?? [];
      const next = accounts[0] as `0x${string}` | undefined;
      if (!next) {
        reset();
        return;
      }
      setAddress(next);
    };

    const onChain = (...args: unknown[]) => {
      setChainId(parseChainId(args[0]));
    };

    const onDisconnect = () => reset();

    active.on?.("accountsChanged", onAccounts);
    active.on?.("chainChanged", onChain);
    active.on?.("disconnect", onDisconnect);

    return () => {
      active.removeListener?.("accountsChanged", onAccounts);
      active.removeListener?.("chainChanged", onChain);
      active.removeListener?.("disconnect", onDisconnect);
    };
  }, [provider, origin, reset]);

  // Restore the previous injected wallet silently (eth_accounts never prompts).
  useEffect(() => {
    if (restored.current || wallets.length === 0) return;
    const stored = readStored();
    if (!stored) {
      restored.current = true;
      return;
    }
    const match = wallets.find((wallet) => wallet.id === stored.id && wallet.installed);
    restored.current = true;
    if (!match) return;

    let cancelled = false;
    void (async () => {
      try {
        const accounts = (await match.provider.request({ method: "eth_accounts" })) as string[];
        if (cancelled || !accounts?.[0]) return;
        const id = await match.provider.request({ method: "eth_chainId" });
        if (cancelled) return;
        setProvider(match.provider);
        setAddress(accounts[0] as `0x${string}`);
        setChainId(parseChainId(id));
        setWalletName(match.name);
        setSource("injected");
        setStatus("connected");
      } catch {
        /* a silent probe failure just leaves the wallet disconnected */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wallets, setSource]);

  const connect = useCallback(
    async (choice: WalletChoice) => {
      if (!choice.installed) {
        if (choice.installUrl) window.open(choice.installUrl, "_blank", "noopener,noreferrer");
        return;
      }
      setStatus("connecting");
      setError(undefined);
      try {
        const accounts = (await choice.provider.request({ method: "eth_requestAccounts" })) as string[];
        const next = accounts?.[0] as `0x${string}` | undefined;
        if (!next) throw new Error("The wallet returned no account. Unlock it and try again.");
        const id = await choice.provider.request({ method: "eth_chainId" });
        setProvider(choice.provider);
        setAddress(next);
        setChainId(parseChainId(id));
        setWalletName(choice.name);
        setSource("injected");
        setStatus("connected");
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: choice.id, name: choice.name }));
        } catch {
          /* storage may be unavailable */
        }
      } catch (cause) {
        setError(walletErrorMessage(cause));
        setStatus("error");
      }
    },
    [setSource],
  );

  const connectWalletConnect = useCallback(async () => {
    if (!walletConnectConfigured()) {
      setError(
        "WalletConnect needs a Reown project id. Add VITE_REOWN_PROJECT_ID to the environment and reload.",
      );
      setStatus("error");
      return;
    }
    setStatus("connecting");
    setError(undefined);
    try {
      const session = await loadWalletConnect();
      walletConnect.current = session;

      if (!session || !walletConnect.current) throw new Error("WalletConnect could not start.");

      const apply = async (state: { address?: `0x${string}`; chainId?: number }) => {
        if (!state.address) {
          if (originRef.current === "walletconnect") reset();
          return;
        }
        const activeProvider = await session.getProvider();
        if (activeProvider) setProvider(activeProvider);
        setAddress(state.address);
        setChainId(state.chainId);
        setWalletName("WalletConnect");
        setSource("walletconnect");
        setStatus("connected");
        if (connectTimeout.current) window.clearTimeout(connectTimeout.current);
      };

      const current = session.current();
      if (current.address) {
        await apply(current);
      } else {
        session.open();
        if (connectTimeout.current) window.clearTimeout(connectTimeout.current);
        connectTimeout.current = window.setTimeout(() => {
          setStatus((prev) => (prev === "connecting" ? "idle" : prev));
        }, 180_000);
      }

      session.watch((state) => {
        void apply(state);
      });
    } catch (cause) {
      setError(walletErrorMessage(cause));
      setStatus("error");
    }
  }, [reset, setSource]);

  const disconnect = useCallback(async () => {
    const active = walletConnect.current;
    const currentOrigin = originRef.current;
    reset();
    if (currentOrigin === "walletconnect" && active) {
      try {
        await active.disconnect();
      } catch (cause) {
        setError(errorMessage(cause));
      }
    }
  }, [reset]);

  const switchNetwork = useCallback(async () => {
    if (!provider) return;
    setError(undefined);
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    } catch (cause) {
      const unknownChain =
        (cause as { code?: number }).code === 4902 ||
        /unrecognized chain|not added|unknown chain/i.test(errorMessage(cause));
      if (!unknownChain) {
        setError(walletErrorMessage(cause));
        return;
      }
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN_ID_HEX,
              chainName: qoreChain.name,
              nativeCurrency: qoreChain.nativeCurrency,
              rpcUrls: qoreChain.rpcUrls.default.http,
            },
          ],
        });
      } catch (addCause) {
        setError(walletErrorMessage(addCause));
      }
    }
  }, [provider]);

  const walletClient = useMemo(() => {
    if (!provider) return undefined;
    return createWalletClient({
      chain: qoreChain,
      transport: custom(provider),
    });
  }, [provider]);

  const clearError = useCallback(() => {
    setError(undefined);
    setStatus((prev) => (prev === "error" ? (address ? "connected" : "idle") : prev));
  }, [address]);

  const hasInjectedWallet = wallets.some((wallet) => wallet.installed);

  return {
    address,
    chainId,
    isCorrectChain: chainId === qoreChain.id,
    status,
    connecting: status === "connecting",
    error,
    walletName,
    origin,
    wallets,
    hasInjectedWallet,
    walletConnectAvailable: walletConnectConfigured(),
    connect,
    connectWalletConnect,
    disconnect,
    switchNetwork,
    clearError,
    walletClient,
  };
}
