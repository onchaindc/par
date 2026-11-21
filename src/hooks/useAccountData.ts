import { useCallback, useEffect, useState } from "react";
import { ADDRESSES } from "../config";
import { bondTokenAbi, servicingAbi, paymentTokenAbi } from "../abis";
import { publicClient } from "../lib/chain";
import { errorMessage } from "../lib/format";

export type PeriodClaim = { id: number; entitlement: bigint; claimed: boolean };

export type AccountData = {
  bondBalance: bigint;
  paymentBalance: bigint;
  allowance: bigint;
  isIssuer: boolean;
  isTreasurer: boolean;
  isMinter: boolean;
  periodClaims: PeriodClaim[];
  principalEntitlement: bigint;
  principalClaimed: boolean;
};

export function useAccountData(
  address: `0x${string}` | undefined,
  periodIds: number[],
  declared: boolean,
) {
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);
  const periodKey = periodIds.join(",");

  useEffect(() => {
    if (!address) {
      setData(null);
      return;
    }
    let cancelled = false;
    let inFlight = false;

    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      setLoading(true);
      try {
        const [bondBalance, paymentBalance, allowance, issuerRole, treasurerRole, minterRole] =
          await Promise.all([
            publicClient.readContract({
              address: ADDRESSES.bond,
              abi: bondTokenAbi,
              functionName: "balanceOf",
              args: [address],
            }),
            publicClient.readContract({
              address: ADDRESSES.paymentToken,
              abi: paymentTokenAbi,
              functionName: "balanceOf",
              args: [address],
            }),
            publicClient.readContract({
              address: ADDRESSES.paymentToken,
              abi: paymentTokenAbi,
              functionName: "allowance",
              args: [address, ADDRESSES.servicing],
            }),
            publicClient.readContract({
              address: ADDRESSES.servicing,
              abi: servicingAbi,
              functionName: "hasRole",
              args: [
                await publicClient.readContract({
                  address: ADDRESSES.servicing,
                  abi: servicingAbi,
                  functionName: "ISSUER_ROLE",
                }),
                address,
              ],
            }),
            publicClient.readContract({
              address: ADDRESSES.servicing,
              abi: servicingAbi,
              functionName: "hasRole",
              args: [
                await publicClient.readContract({
                  address: ADDRESSES.servicing,
                  abi: servicingAbi,
                  functionName: "TREASURER_ROLE",
                }),
                address,
              ],
            }),
            publicClient.readContract({
              address: ADDRESSES.bond,
              abi: bondTokenAbi,
              functionName: "hasRole",
              args: [
                await publicClient.readContract({
                  address: ADDRESSES.bond,
                  abi: bondTokenAbi,
                  functionName: "MINTER_ROLE",
                }),
                address,
              ],
            }),
          ]);

        const periodClaims = await Promise.all(
          periodIds.map(async (id) => {
            const [entitlement, claimed] = await Promise.all([
              publicClient
                .readContract({
                  address: ADDRESSES.servicing,
                  abi: servicingAbi,
                  functionName: "couponEntitlement",
                  args: [BigInt(id), address],
                })
                .catch(() => 0n),
              publicClient.readContract({
                address: ADDRESSES.servicing,
                abi: servicingAbi,
                functionName: "hasClaimedCoupon",
                args: [BigInt(id), address],
              }),
            ]);
            return { id, entitlement, claimed };
          }),
        );

        let principalEntitlement = 0n;
        let principalClaimed = false;
        if (declared) {
          [principalEntitlement, principalClaimed] = await Promise.all([
            publicClient
              .readContract({
                address: ADDRESSES.servicing,
                abi: servicingAbi,
                functionName: "redemptionEntitlement",
                args: [address],
              })
              .catch(() => 0n),
            publicClient.readContract({
              address: ADDRESSES.servicing,
              abi: servicingAbi,
              functionName: "hasClaimedPrincipal",
              args: [address],
            }),
          ]);
        }

        if (cancelled) return;
        setData({
          bondBalance,
          paymentBalance,
          allowance,
          isIssuer: issuerRole,
          isTreasurer: treasurerRole,
          isMinter: minterRole,
          periodClaims,
          principalEntitlement,
          principalClaimed,
        });
        setError(undefined);
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
  }, [address, periodKey, declared, refreshToken]);

  return { data, loading, error, refresh };
}
