import { errorMessage } from "../lib/format";

type WalletError = {
  code?: number | string;
  message?: string;
  data?: { message?: string };
};

const MESSAGES: Record<number, string> = {
  4001: "The request was rejected in your wallet.",
  "-32002": "A wallet request is already pending. Open your wallet to finish it.",
  4100: "Your wallet has not authorised this account. Unlock it and try again.",
  4900: "Your wallet is disconnected from the network. Reconnect it and try again.",
  4901: "Your wallet is not connected to the required chain.",
};

function codeOf(error: unknown): number | undefined {
  let current = error as WalletError | undefined;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (typeof current.code === "number") return current.code;
    if (typeof current.code === "string" && /^-?\d+$/.test(current.code)) return Number(current.code);
    current = (current as { cause?: WalletError }).cause;
  }
  return undefined;
}

/** Wallet-aware error text: rejection, pending request, missing chain, then viem's decoder. */
export function walletErrorMessage(error: unknown): string {
  if (!error) return "Unknown wallet error.";
  const code = codeOf(error);
  if (code !== undefined && MESSAGES[code]) return MESSAGES[code];
  if (code === 4902) return "This network is not in your wallet yet.";
  const message = errorMessage(error);
  if (/already pending/i.test(message)) return MESSAGES[-32002];
  return message;
}

export function isUserRejection(error: unknown): boolean {
  return codeOf(error) === 4001;
}
