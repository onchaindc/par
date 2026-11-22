import { chromium } from "playwright";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const PREVIEW_URL =
  process.env.PREVIEW_URL ?? "https://5173-4354c2f9-a37c-420e-b3fc-1f192225ae3b.daytonaproxy01.net";
export const RPC = "https://evm-testnet.qore.host";
export const CHAIN = {
  id: 9800,
  name: "QoreChain Diana",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  testnet: true,
};

export const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC) });

export function operationalWallet() {
  const key = process.env.PAR_DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("PAR_DEPLOYER_PRIVATE_KEY is not configured");
  return privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
}

/** Injected EIP-1193 mock: reads are proxied to the RPC, sends are signed by the operational key. */
export async function mockWalletContext(
  browser,
  { viewport = { width: 1440, height: 960 }, chainId = "0x2648", accounts, rejectSends = false } = {},
) {
  const account = operationalWallet();
  const walletClient = createWalletClient({ account, chain: CHAIN, transport: http(RPC) });
  const context = await browser.newContext({ viewport, timezoneId: "UTC" });
  await context.exposeFunction("walletRpc", async (method, params = []) => {
    if (method === "eth_sendTransaction" && rejectSends) {
      throw Object.assign(new Error("User rejected the request."), { code: 4001 });
    }
    if (method === "eth_sendTransaction") {
      const tx = params[0] ?? {};
      const hash = await walletClient.sendTransaction({
        account,
        chain: CHAIN,
        to: tx.to,
        data: tx.data,
        value: tx.value ? BigInt(tx.value) : undefined,
        gas: tx.gas ? BigInt(tx.gas) : undefined,
      });
      return hash;
    }
    if (method === "eth_sign" || method === "personal_sign") {
      throw new Error("The acceptance wallet bridge does not expose message signing");
    }
    return publicClient.request({ method, params });
  });
  await context.addInitScript(
    ({ initialChainId, initialAccounts }) => {
      const listeners = new Map();
      let chainId = initialChainId;
      let approved = false;
      const accounts = [...initialAccounts];
      window.__mockEmit = (event, payload) => {
        for (const handler of listeners.get(event) ?? []) handler(payload);
      };
      window.__mockSetAccount = (next) => {
        accounts.length = 0;
        accounts.push(next);
        window.__mockEmit("accountsChanged", [...accounts]);
      };
      window.ethereum = {
        isMetaMask: true,
        async request({ method, params }) {
          if (method === "eth_requestAccounts") {
            approved = true;
            return [...accounts];
          }
          if (method === "eth_accounts") return approved ? [...accounts] : [];
          if (method === "eth_chainId") return chainId;
          if (method === "wallet_switchEthereumChain") {
            chainId = params[0].chainId;
            window.setTimeout(() => window.__mockEmit("chainChanged", chainId), 30);
            return null;
          }
          if (method === "wallet_addEthereumChain") return null;
          return window.walletRpc(method, params ?? []);
        },
        on(event, handler) {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event).push(handler);
        },
        removeListener(event, handler) {
          listeners.set(event, (listeners.get(event) ?? []).filter((item) => item !== handler));
        },
      };
    },
    { initialChainId: chainId, initialAccounts: accounts ?? [account.address] },
  );
  return context;
}

export async function launch() {
  return chromium.launch({ channel: "chromium", headless: true });
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function waitForToast(page, text, timeout = 120_000) {
  await page.locator(".toast").filter({ hasText: text }).first().waitFor({ timeout });
}
