import { useCallback, useEffect, useMemo, useState } from "react";
import { createWalletClient, custom, type WalletClient } from "viem";
import { qoreChain } from "../config";
import { errorMessage } from "../lib/format";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

const CHAIN_ID_HEX = `0x${qoreChain.id.toString(16)}`;

export type WalletState = {
  address?: `0x${string}`;
  chainId?: number;
  isCorrectChain: boolean;
  hasProvider: boolean;
  connecting: boolean;
  error?: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  walletClient?: WalletClient;
};

export function useWallet(): WalletState {
  const [address, setAddress] = useState<`0x${string}`>();
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();

  const provider = typeof window !== "undefined" ? window.ethereum : undefined;

  useEffect(() => {
    if (!provider) return;
    let active = true;

    const read = async () => {
      try {
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        const id = (await provider.request({ method: "eth_chainId" })) as string;
        if (!active) return;
        setAddress(accounts[0] ? (accounts[0] as `0x${string}`) : undefined);
        setChainId(Number.parseInt(id, 16));
      } catch {
        /* ignore silent probe failures */
      }
    };
    void read();

    const onAccounts = (...args: never[]) => {
      const accounts = args[0] as unknown as string[];
      setAddress(accounts?.[0] ? (accounts[0] as `0x${string}`) : undefined);
    };
    const onChain = (...args: never[]) => {
      const id = args[0] as unknown as string;
      setChainId(Number.parseInt(id, 16));
    };

    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    return () => {
      active = false;
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [provider]);

  const connect = useCallback(async () => {
    if (!provider) {
      setError("No browser wallet found. Install MetaMask or Rabby, then reload.");
      return;
    }
    setConnecting(true);
    setError(undefined);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const id = (await provider.request({ method: "eth_chainId" })) as string;
      setAddress(accounts[0] ? (accounts[0] as `0x${string}`) : undefined);
      setChainId(Number.parseInt(id, 16));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setConnecting(false);
    }
  }, [provider]);

  const disconnect = useCallback(() => {
    setAddress(undefined);
    setError(undefined);
  }, []);

  const switchNetwork = useCallback(async () => {
    if (!provider) return;
    setError(undefined);
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    } catch (cause) {
      const code = (cause as { code?: number }).code;
      if (code === 4902) {
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
          return;
        } catch (addCause) {
          setError(errorMessage(addCause));
          return;
        }
      }
      setError(errorMessage(cause));
    }
  }, [provider]);

  const walletClient = useMemo(() => {
    if (!provider) return undefined;
    return createWalletClient({
      chain: qoreChain,
      transport: custom(provider),
    });
  }, [provider]);

  return {
    address,
    chainId,
    isCorrectChain: chainId === qoreChain.id,
    hasProvider: Boolean(provider),
    connecting,
    error,
    connect,
    disconnect,
    switchNetwork,
    walletClient,
  };
}
