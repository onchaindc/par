import type { Eip1193Provider } from "./discovery";

export type WalletConnectState = { address?: `0x${string}`; chainId?: number };

export type WalletConnectSession = {
  open: () => void;
  close: () => void;
  disconnect: () => Promise<void>;
  getProvider: () => Promise<Eip1193Provider | undefined>;
  current: () => WalletConnectState;
  watch: (listener: (state: WalletConnectState) => void) => () => void;
};

/**
 * WalletConnect is intentionally disabled in this build. The AppKit adapter
 * pulls a very large dependency graph that does not fit the deployment build
 * budget; injected wallets (MetaMask, Rabby, and mobile in-app browsers)
 * remain fully supported. Re-enable by restoring the AppKit loader and its
 * dependencies when a larger build environment is available.
 */
export function walletConnectConfigured(): boolean {
  return false;
}

export function loadWalletConnect(): Promise<WalletConnectSession> {
  return Promise.reject(
    new Error("WalletConnect is not enabled in this build. Use an injected wallet or a mobile wallet browser."),
  );
}
