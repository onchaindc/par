import { useCallback, useRef, useState } from "react";
import { publicClient } from "../lib/chain";
import { errorMessage } from "../lib/format";

export type TxStatus = "idle" | "signing" | "pending" | "confirmed" | "error";

export type TxState = {
  status: TxStatus;
  label?: string;
  hash?: `0x${string}`;
  error?: string;
};

export function useTx() {
  const [state, setState] = useState<TxState>({ status: "idle" });
  const timer = useRef<number | undefined>(undefined);

  const reset = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setState({ status: "idle" });
  }, []);

  const run = useCallback(
    async (
      label: string,
      send: () => Promise<`0x${string}`>,
      onSuccess?: () => void,
    ) => {
      if (timer.current) window.clearTimeout(timer.current);
      setState({ status: "signing", label });
      try {
        const hash = await send();
        setState({ status: "pending", label, hash });
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
        if (receipt.status !== "success") {
          setState({ status: "error", label, hash, error: "Transaction reverted on chain." });
          return;
        }
        setState({ status: "confirmed", label, hash });
        onSuccess?.();
        timer.current = window.setTimeout(() => setState({ status: "idle" }), 12_000);
      } catch (cause) {
        setState({ status: "error", label, error: errorMessage(cause) });
      }
    },
    [],
  );

  return { ...state, run, reset };
}
