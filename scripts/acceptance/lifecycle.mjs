import fs from "node:fs";
import { toHex, hexToBytes } from "viem";
import { mldsa87 } from "../../tools/pqc-sign/node_modules/@qorechain/pqc/src/index.js";
import { ADDRESSES } from "../../src/config.ts";
import { servicingAbi, bondTokenAbi } from "../../src/abis.ts";
import {
  CHAIN,
  PREVIEW_URL,
  assert,
  launch,
  mockWalletContext,
  operationalWallet,
  publicClient,
  waitForToast,
  enterApp,
} from "./lib.mjs";
import { createWalletClient, http } from "viem";

const KEY_FILE =
  process.env.PAR_PQC_KEY_FILE ?? "/home/daytona/.par-signer/home/pqc/par-issuer-mldsa.dilithium";
const TEST_HOLDER = "0x1111111111111111111111111111111111111111";
const DEADLINE_LOCAL = "2026-11-21T10:00";
const DEADLINE = BigInt(Math.floor(Date.parse(`${DEADLINE_LOCAL}:00Z`) / 1000));

const head = await publicClient.getBlockNumber();
const period = await publicClient.readContract({
  address: ADDRESSES.servicing,
  abi: servicingAbi,
  functionName: "couponPeriod",
  args: [0n],
});
console.log(`head ${head}, record date ${period.recordDateBlock}, finalized ${period.finalized}`);
if (head <= period.recordDateBlock) {
  console.log(`NOT_READY blocks_to_go=${period.recordDateBlock - head}`);
  process.exit(2);
}
if (period.finalized) {
  console.log("Period already finalized");
  process.exit(3);
}

// Move part of the holding after the record date, to prove the entitlement is checkpointed.
const account = operationalWallet();
const wallet = createWalletClient({ account, chain: CHAIN, transport: http() });
const testBalance = await publicClient.readContract({
  address: ADDRESSES.bond,
  abi: bondTokenAbi,
  functionName: "balanceOf",
  args: [TEST_HOLDER],
});
if (testBalance < 500n * 10n ** 18n) {
  const transferHash = await wallet.writeContract({
    address: ADDRESSES.bond,
    abi: bondTokenAbi,
    functionName: "transfer",
    args: [TEST_HOLDER, 500n * 10n ** 18n],
    account,
    chain: CHAIN,
  });
  const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferHash });
  console.log(`post-record transfer ${transferHash} status ${transferReceipt.status}`);
} else {
  console.log(`post-record holder already holds ${testBalance} base units; skipping transfer`);
}

const browser = await launch();
const context = await mockWalletContext(browser);
const page = await context.newPage();
page.on("pageerror", (error) => console.error("pageerror", error.message));
await page.goto(PREVIEW_URL, { waitUntil: "networkidle", timeout: 90_000 });
await enterApp(page);
await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).click();
await page.getByRole("tab", { name: /Manage the bond/ }).click();

const panel = page.locator(".panel--green").first();
await panel.waitFor({ timeout: 30_000 });
await panel.getByLabel("Signature deadline (local time)").fill(DEADLINE_LOCAL);
await page.waitForTimeout(1200);

const messageHex = (await panel.locator("details pre.code").textContent()).trim();
assert(messageHex.startsWith("0x") && messageHex.length === 2 + 288 * 2, `unexpected message ${messageHex.slice(0, 20)}`);
console.log(`message read from UI: ${messageHex.length / 2 - 1} bytes`);

const secretHex = fs.readFileSync(KEY_FILE, "utf8").trim().replace(/^0x/, "");
const secretKey = Uint8Array.from(Buffer.from(secretHex, "hex"));
const signature = toHex(mldsa87.sign(secretKey, hexToBytes(messageHex)));
assert(signature.length === 2 + 4627 * 2, "signature length");
console.log("fresh ML-DSA-87 signature produced for the exact UI message");

// Negative: a tampered signature must be rejected by the on-chain verifier.
const tampered = `${signature.slice(0, -1)}${signature.endsWith("0") ? "1" : "0"}`;
const textarea = panel.locator("textarea");
await textarea.fill(tampered);
await panel.getByRole("button", { name: "Verify signature on chain" }).click();
await panel.getByText(/rejected|invalid/i).first().waitFor({ timeout: 30_000 });
console.log("tampered signature rejected by the UI verifier");

await textarea.fill(signature);
await panel.getByRole("button", { name: "Verify signature on chain" }).click();
await panel.getByText("Signature accepted by 0x0A01").waitFor({ timeout: 30_000 });
console.log("valid signature accepted on chain");

await panel.getByRole("button", { name: "Approve round" }).click();
await waitForToast(page, "Transaction confirmed", 150_000);
console.log("toast:", (await page.locator(".toast").innerText()).replace(/\n/g, " | "));

// Funding: approve then fund the exact requirement.
await page.waitForTimeout(1500);
const fundPanel = page.locator(".panel").filter({ hasText: "Fund this period" }).first();
await fundPanel.waitFor({ timeout: 30_000 });
await fundPanel.getByLabel(/Amount/).fill("3750");
const approve = fundPanel.getByRole("button", { name: /Approve pUSD/ });
if (await approve.count()) {
  await approve.click();
  await waitForToast(page, "Transaction confirmed", 150_000);
  console.log("approval confirmed");
}
await fundPanel.getByRole("button", { name: "Fund", exact: true }).click({ timeout: 60_000 });
await waitForToast(page, "Transaction confirmed", 150_000);
console.log("funding confirmed");

// Claim the coupon.
await page.getByRole("tab", { name: /Payments/ }).click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Collect", exact: true }).first().click({ timeout: 30_000 });
await waitForToast(page, "Transaction confirmed", 150_000);
console.log("claim confirmed");

const [status, entitlementOperator, entitlementTest, balanceTest, contractBalance, claimed] = await Promise.all([
  publicClient.readContract({
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "couponStatus",
    args: [0n],
  }),
  publicClient.readContract({
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "couponEntitlement",
    args: [0n, account.address],
  }),
  publicClient.readContract({
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "couponEntitlement",
    args: [0n, TEST_HOLDER],
  }),
  publicClient.readContract({
    address: ADDRESSES.bond,
    abi: bondTokenAbi,
    functionName: "balanceOf",
    args: [TEST_HOLDER],
  }),
  publicClient.readContract({
    address: ADDRESSES.paymentToken,
    abi: (await import("../../src/abis.ts")).paymentTokenAbi,
    functionName: "balanceOf",
    args: [ADDRESSES.servicing],
  }),
  publicClient.readContract({
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "hasClaimedCoupon",
    args: [0n, account.address],
  }),
]);

const result = {
  required: status[0].toString(),
  funded: status[1].toString(),
  claimed: status[2].toString(),
  outstanding: status[3].toString(),
  entitlementOperator: entitlementOperator.toString(),
  entitlementPostRecordHolder: entitlementTest.toString(),
  postRecordHolderBalance: balanceTest.toString(),
  servicingBalance: contractBalance.toString(),
  operatorClaimed: claimed,
  finalizeTx: (await page.locator(".toast").innerText()).slice(0, 120),
};
console.log("RESULT", JSON.stringify(result, null, 2));

assert(status[0] === 3_750_000_000n, "required funding");
assert(status[1] === 3_750_000_000n, "funded");
assert(status[2] === 3_750_000_000n, "claimed");
assert(status[3] === 0n, "outstanding");
assert(entitlementOperator === 3_750_000_000n, "operator entitlement");
assert(entitlementTest === 0n, "post-record holder has no entitlement");
assert(balanceTest >= 500n * 10n ** 18n, "post-record holder balance");
assert(contractBalance === 0n, "servicing balance after claim");
assert(claimed === true, "claim flag");

await context.close();
await browser.close();
console.log("LIFECYCLE_OK");
