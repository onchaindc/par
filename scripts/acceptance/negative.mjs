import { ADDRESSES } from "../../src/config.ts";
import { servicingAbi, authorizerAbi } from "../../src/abis.ts";
import { operationalWallet, publicClient } from "./lib.mjs";

const wallet = operationalWallet();
const outsider = "0x1111111111111111111111111111111111111111";
const results = [];

async function expectRevert(name, request, pattern) {
  try {
    await publicClient.simulateContract(request);
    results.push({ name, ok: false, detail: "call succeeded unexpectedly" });
    console.log(`FAIL ${name}: call succeeded unexpectedly`);
  } catch (error) {
    const message = error?.shortMessage ?? error?.message ?? String(error);
    const errorName =
      error?.cause?.data?.errorName ??
      error?.cause?.cause?.data?.errorName ??
      error?.walk?.((item) => item?.data?.errorName)?.data?.errorName;
    const signature = message.match(/reverted with the following signature:\s*([^\n]+)/)?.[1]?.trim();
    const detail = errorName ?? signature ?? message.split("\n")[0];
    const ok = pattern.test(detail) || pattern.test(message);
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  }
}

await expectRevert(
  "outsider cannot open a coupon period",
  {
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "openCouponPeriod",
    args: [10_480_000n],
    account: outsider,
  },
  /Unauthorized|access|role/i,
);

await expectRevert(
  "outsider cannot fund a coupon",
  {
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "fundCoupon",
    args: [0n, 1n],
    account: outsider,
  },
  /Unauthorized|access|role/i,
);

await expectRevert(
  "duplicate record date is rejected",
  {
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "openCouponPeriod",
    args: [10_470_000n],
    account: wallet.address,
  },
  /RecordDateAlreadyUsed|already used/i,
);

await expectRevert(
  "record dates must increase",
  {
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "openCouponPeriod",
    args: [10_465_000n],
    account: wallet.address,
  },
  /RecordDateOrder|order/i,
);

await expectRevert(
  "claim before finalization is rejected",
  {
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "claimCoupon",
    args: [0n],
    account: wallet.address,
  },
  /CouponNotFinalized|not finalized/i,
);

await expectRevert(
  "funding before finalization is rejected",
  {
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "fundCoupon",
    args: [0n, 1n],
    account: wallet.address,
  },
  /CouponNotFinalized|not finalized/i,
);

await expectRevert(
  "redemption before maturity is rejected",
  {
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "declareRedemption",
    args: [10463000n, 4102444800n, `0x${"00".repeat(4627)}`],
    account: wallet.address,
  },
  /BeforeMaturity|maturity/i,
);

const period = await publicClient.readContract({
  address: ADDRESSES.servicing,
  abi: servicingAbi,
  functionName: "couponPeriod",
  args: [0n],
});
const pqcIssuer = await publicClient.readContract({
  address: ADDRESSES.authorizer,
  abi: authorizerAbi,
  functionName: "pqcIssuer",
});
const dummyMessage = `0x${"00".repeat(288)}`;
const forged = await publicClient.readContract({
  address: ADDRESSES.authorizer,
  abi: authorizerAbi,
  functionName: "isAuthorized",
  args: [pqcIssuer, dummyMessage, `0x${"11".repeat(4627)}`],
});
results.push({ name: "forged PQC signature is rejected", ok: forged === false });
console.log(`${forged === false ? "PASS" : "FAIL"} forged PQC signature is rejected`);

console.log(`\nrecord block ${period.recordDateBlock}, finalized ${period.finalized}`);
console.log(`${results.filter((r) => r.ok).length}/${results.length} negative checks passed`);
if (results.some((r) => !r.ok)) process.exitCode = 1;
