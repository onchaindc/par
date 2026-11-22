import { ADDRESSES } from "../../src/config.ts";
import { servicingAbi } from "../../src/abis.ts";
import { assert, launch, mockWalletContext, operationalWallet, publicClient, PREVIEW_URL, enterApp } from "./lib.mjs";

const wallet = operationalWallet();
const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function expectRevert(name, request, pattern) {
  try {
    await publicClient.simulateContract(request);
    check(name, false, "call succeeded");
  } catch (error) {
    const message = error?.shortMessage ?? error?.message ?? String(error);
    const errorName =
      error?.cause?.data?.errorName ??
      error?.cause?.cause?.data?.errorName ??
      error?.walk?.((item) => item?.data?.errorName)?.data?.errorName;
    const detail = errorName ?? message.split("\n")[0];
    check(name, pattern.test(detail) || pattern.test(message), detail);
  }
}

const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400);
await expectRevert(
  "second coupon claim is rejected",
  {
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "claimCoupon",
    args: [0n],
    account: wallet.address,
  },
  /AlreadyClaimed/,
);
await expectRevert(
  "refinalizing is rejected",
  {
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "finalizeCoupon",
    args: [0n, deadline, `0x${"00".repeat(4627)}`],
    account: wallet.address,
  },
  /CouponAlreadyFinalized/,
);
await expectRevert(
  "over-funding is rejected",
  {
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "fundCoupon",
    args: [0n, 1n],
    account: wallet.address,
  },
  /FundingExceedsRequirement/,
);
await expectRevert(
  "post-record buyer has nothing to claim",
  {
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "claimCoupon",
    args: [0n],
    account: "0x1111111111111111111111111111111111111111",
  },
  /NothingToClaim/,
);
await expectRevert(
  "principal before declaration is rejected",
  {
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "redemptionEntitlement",
    args: [wallet.address],
    account: wallet.address,
  },
  /RedemptionNotDeclared/,
);

const [period, status, nonce] = await Promise.all([
  publicClient.readContract({
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "couponPeriod",
    args: [0n],
  }),
  publicClient.readContract({
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "couponStatus",
    args: [0n],
  }),
  publicClient.readContract({
    address: ADDRESSES.servicing,
    abi: servicingAbi,
    functionName: "authorizationNonce",
  }),
]);
check("period finalized", period.finalized === true);
check("coupon per token is 2.5 pUSD", period.couponPerToken === 2_500_000n, period.couponPerToken.toString());
check("nonce consumed once", nonce === 1n, nonce.toString());
check(
  "reconciliation balances",
  status[0] === 3_750_000_000n &&
    status[1] === 3_750_000_000n &&
    status[2] === 3_750_000_000n &&
    status[3] === 0n,
  `${status[0]}/${status[1]}/${status[2]}/${status[3]}`,
);
assert(nonce === 1n, "nonce");

// UI: claimed state and reconciliation, then a rejected wallet transaction.
const browser = await launch();
const context = await mockWalletContext(browser, { rejectSends: true });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.goto(PREVIEW_URL, { waitUntil: "networkidle", timeout: 90_000 });
await enterApp(page);
await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).click();
await page.getByRole("tab", { name: /Payments/ }).click();
await page.waitForTimeout(6000);
const claimsText = await page.locator(".tabs-panel").innerText();
console.log("CLAIMS_TEXT", JSON.stringify(claimsText.slice(0, 700)));
check("claims tab shows claimed status", /COLLECTED|Collected/i.test(claimsText), "");

await page.getByRole("tab", { name: /Records/ }).click();
await page.waitForTimeout(1500);
const ledgerText = (await page.locator(".tabs-panel").innerText()).replace(/\u00a0/g, " ");
console.log("LEDGER_TEXT", JSON.stringify(ledgerText.slice(0, 900)));
check("reconciliation shows funded/claimed totals", /3,750/.test(ledgerText), "");

await page.getByRole("tab", { name: /Manage the bond/ }).click();
await page.getByLabel("Record-date block").first().fill("10480000");
await page.getByRole("button", { name: "Open period" }).click();
await page.waitForTimeout(1500);
const toastText = await page.locator(".toast").innerText();
console.log("TOAST_TEXT", JSON.stringify(toastText));
check(
  "wallet rejection surfaces as a failed transaction",
  /Transaction failed/.test(toastText) && /rejected/i.test(toastText),
  toastText.split("\n")[0],
);
check("no page errors after actions", pageErrors.length === 0, pageErrors.join(" | "));

await context.close();
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} post-lifecycle checks passed`);
if (results.some((item) => !item)) process.exitCode = 1;
