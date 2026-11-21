import { useCallback, useEffect, useState } from "react";
import { ADDRESSES, DEPLOY_BLOCK } from "../config";
import { bondTokenAbi, servicingAbi, authorizerAbi, paymentTokenAbi } from "../abis";
import { fingerprintHex, publicClient, readPqcKeyStatus, type PqcKeyStatus } from "../lib/chain";
import { couponPerToken, errorMessage } from "../lib/format";

export type Period = {
  id: number;
  recordDateBlock: bigint;
  finalized: boolean;
  couponPerToken: bigint;
  required: bigint;
  funded: bigint;
  claimed: bigint;
  outstanding: bigint;
};

export type Redemption = {
  declared: boolean;
  recordDateBlock: bigint;
  principalPerToken: bigint;
  required: bigint;
  funded: bigint;
  claimed: bigint;
  outstanding: bigint;
};

export type Holder = { address: `0x${string}`; balance: bigint };

export type BondData = {
  blockNumber: bigint;
  name: string;
  symbol: string;
  decimals: number;
  cap: bigint;
  totalSupply: bigint;
  paymentToken: `0x${string}`;
  paymentSymbol: string;
  paymentDecimals: number;
  paymentTotalSupply: bigint;
  servicingPaymentBalance: bigint;
  terms: {
    paymentToken: `0x${string}`;
    maturity: bigint;
    couponRateBps: number;
    paymentsPerYear: number;
    faceValuePerToken: bigint;
  };
  periods: Period[];
  redemption: Redemption;
  nonce: bigint;
  pqcIssuer: `0x${string}`;
  keyStatus: PqcKeyStatus | null;
  keyFingerprint: string | null;
  holders: Holder[];
};

async function readHolders(): Promise<Holder[]> {
  let logs: Awaited<ReturnType<typeof publicClient.getContractEvents>> = [];
  try {
    logs = await publicClient.getContractEvents({
      address: ADDRESSES.bond,
      abi: bondTokenAbi,
      eventName: "Transfer",
      fromBlock: DEPLOY_BLOCK,
      toBlock: "latest",
    });
  } catch {
    const latest = await publicClient.getBlockNumber();
    let cursor = DEPLOY_BLOCK;
    const chunk = 50_000n;
    while (cursor <= latest) {
      const end = cursor + chunk > latest ? latest : cursor + chunk;
      try {
        const part = await publicClient.getContractEvents({
          address: ADDRESSES.bond,
          abi: bondTokenAbi,
          eventName: "Transfer",
          fromBlock: cursor,
          toBlock: end,
        });
        logs = [...logs, ...part];
      } catch {
        // Skip a range the RPC refuses rather than failing the whole page.
      }
      cursor = end + 1n;
    }
  }

  const seen = new Set<string>();
  for (const log of logs) {
    const { to, from } = (log as unknown as { args: { to?: string; from?: string } }).args;
    if (to) seen.add(to.toLowerCase());
    if (from) seen.add(from.toLowerCase());
  }
  seen.delete("0x0000000000000000000000000000000000000000");

  const holders = await Promise.all(
    [...seen].map(async (account) => {
      const balance = await publicClient.readContract({
        address: ADDRESSES.bond,
        abi: bondTokenAbi,
        functionName: "balanceOf",
        args: [account as `0x${string}`],
      });
      return { address: account as `0x${string}`, balance };
    }),
  );
  return holders.filter((holder) => holder.balance > 0n).sort((a, b) => (a.balance > b.balance ? -1 : 1));
}

async function loadBondData(): Promise<BondData> {
  const [blockNumber, name, symbol, decimals, cap, totalSupply, terms, periodCount, nonce] =
    await Promise.all([
      publicClient.getBlockNumber(),
      publicClient.readContract({ address: ADDRESSES.bond, abi: bondTokenAbi, functionName: "name" }),
      publicClient.readContract({ address: ADDRESSES.bond, abi: bondTokenAbi, functionName: "symbol" }),
      publicClient.readContract({ address: ADDRESSES.bond, abi: bondTokenAbi, functionName: "decimals" }),
      publicClient.readContract({ address: ADDRESSES.bond, abi: bondTokenAbi, functionName: "cap" }),
      publicClient.readContract({ address: ADDRESSES.bond, abi: bondTokenAbi, functionName: "totalSupply" }),
      publicClient.readContract({ address: ADDRESSES.servicing, abi: servicingAbi, functionName: "terms" }),
      publicClient.readContract({
        address: ADDRESSES.servicing,
        abi: servicingAbi,
        functionName: "couponPeriodCount",
      }),
      publicClient.readContract({
        address: ADDRESSES.servicing,
        abi: servicingAbi,
        functionName: "authorizationNonce",
      }),
    ]);

  const [paymentSymbol, paymentDecimals, paymentTotalSupply, servicingPaymentBalance, redemptionRaw, pqcIssuer] =
    await Promise.all([
      publicClient.readContract({
        address: terms.paymentToken,
        abi: paymentTokenAbi,
        functionName: "symbol",
      }),
      publicClient.readContract({
        address: terms.paymentToken,
        abi: paymentTokenAbi,
        functionName: "decimals",
      }),
      publicClient.readContract({
        address: terms.paymentToken,
        abi: paymentTokenAbi,
        functionName: "totalSupply",
      }),
      publicClient.readContract({
        address: terms.paymentToken,
        abi: paymentTokenAbi,
        functionName: "balanceOf",
        args: [ADDRESSES.servicing],
      }),
      publicClient.readContract({
        address: ADDRESSES.servicing,
        abi: servicingAbi,
        functionName: "redemption",
      }),
      publicClient.readContract({
        address: ADDRESSES.authorizer,
        abi: authorizerAbi,
        functionName: "pqcIssuer",
      }),
    ]);

  const periods = await Promise.all(
    Array.from({ length: Number(periodCount) }, async (_, id) => {
      const [period, status] = await Promise.all([
        publicClient.readContract({
          address: ADDRESSES.servicing,
          abi: servicingAbi,
          functionName: "couponPeriod",
          args: [BigInt(id)],
        }),
        publicClient.readContract({
          address: ADDRESSES.servicing,
          abi: servicingAbi,
          functionName: "couponStatus",
          args: [BigInt(id)],
        }),
      ]);
      return {
        id,
        recordDateBlock: period.recordDateBlock,
        finalized: period.finalized,
        couponPerToken: period.couponPerToken,
        required: status[0],
        funded: status[1],
        claimed: status[2],
        outstanding: status[3],
      } satisfies Period;
    }),
  );

  const [keyStatus, holders] = await Promise.all([readPqcKeyStatus(pqcIssuer), readHolders()]);
  const keyFingerprint = keyStatus?.publicKeyHex ? await fingerprintHex(keyStatus.publicKeyHex) : null;

  return {
    blockNumber,
    name,
    symbol,
    decimals,
    cap,
    totalSupply,
    paymentToken: terms.paymentToken,
    paymentSymbol,
    paymentDecimals,
    paymentTotalSupply,
    servicingPaymentBalance,
    terms: {
      paymentToken: terms.paymentToken,
      maturity: terms.maturity,
      couponRateBps: terms.couponRateBps,
      paymentsPerYear: terms.paymentsPerYear,
      faceValuePerToken: terms.faceValuePerToken,
    },
    periods,
    redemption: {
      declared: redemptionRaw.declared,
      recordDateBlock: redemptionRaw.recordDateBlock,
      principalPerToken: redemptionRaw.principalPerToken,
      required: redemptionRaw.requiredFunding,
      funded: redemptionRaw.funded,
      claimed: redemptionRaw.claimed,
      outstanding: redemptionRaw.funded - redemptionRaw.claimed,
    },
    nonce,
    pqcIssuer,
    keyStatus,
    keyFingerprint,
    holders,
  };
}

export function useBondData() {
  const [data, setData] = useState<BondData | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date>();

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await loadBondData();
        if (cancelled) return;
        setData(next);
        setError(undefined);
        setUpdatedAt(new Date());
      } catch (cause) {
        if (!cancelled) setError(errorMessage(cause));
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const interval = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshToken]);

  return {
    data,
    loading,
    error,
    refresh,
    updatedAt,
    couponPerTokenNow:
      data && data.terms
        ? couponPerToken(data.terms.faceValuePerToken, data.terms.couponRateBps, data.terms.paymentsPerYear)
        : 0n,
  };
}
