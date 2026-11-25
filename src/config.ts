import { defineChain } from "viem";

export const qoreChain = defineChain({
  id: 9800,
  name: "QoreChain Diana",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://evm-testnet.qore.host"] },
  },
  testnet: true,
});

/** EIP-155 chain id as a hex string, used for wallet_switchEthereumChain. */
export const CHAIN_ID_HEX = `0x${qoreChain.id.toString(16)}`;

export const ADDRESSES = {
  bond: "0xC3d195C5A5e2c476888050205D55DfBe3C453840",
  authorizer: "0x8FC2F2B42C4e1bfe203FE3e4F0F126593990784F",
  servicing: "0x5df199D05FB83D14eaFD2823D46982bEb13512F5",
  paymentToken: "0xD6EE9c3918507eb7DDB77Bb6E6f74176d9140262",
} as const satisfies Record<string, `0x${string}`>;

/** Block the demo deployment landed in, used as the log-scan start. */
export const DEPLOY_BLOCK = 10_462_390n;

/**
 * Reown (WalletConnect Cloud) project id. Set VITE_REOWN_PROJECT_ID in the
 * deployment environment; when absent the WalletConnect option stays hidden
 * and injected wallets keep working.
 */
export const REOWN_PROJECT_ID = (import.meta.env.VITE_REOWN_PROJECT_ID ?? "").trim();

export const PQC_KEY_STATUS = "0x0000000000000000000000000000000000000a02" as const;

export const REST_API = "https://api-testnet.qore.host";

export const DOCS = {
  issuerSetup:
    "https://github.com/onchaindc/par/blob/main/docs/issuer-setup.md",
  deployment:
    "https://github.com/onchaindc/par/blob/main/docs/deployment.md",
  frontend:
    "https://github.com/onchaindc/par/blob/main/docs/frontend.md",
  acceptance:
    "https://github.com/onchaindc/par/blob/main/docs/acceptance.md",
} as const;

export const WALLET_INSTALL_LINKS = [
  { name: "MetaMask", url: "https://metamask.io/download/", detail: "Browser extension or mobile app" },
  { name: "Rabby", url: "https://rabby.io/", detail: "Browser extension" },
] as const;
