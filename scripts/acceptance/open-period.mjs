import { launch, mockWalletContext, PREVIEW_URL, publicClient, waitForToast } from "./lib.mjs";
import { servicingAbi } from "../../src/abis.ts";

const browser = await launch();
const context = await mockWalletContext(browser);
const page = await context.newPage();
page.on("pageerror", (error) => console.error("pageerror", error.message));
await page.goto(PREVIEW_URL, { waitUntil: "networkidle", timeout: 90_000 });
await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).click();
await page.getByRole("tab", { name: /Issuer operations/ }).click();
await page.getByRole("button", { name: "Open period" }).waitFor({ timeout: 20_000 });

const head = await publicClient.getBlockNumber();
const target = 10_470_000n;
const input = page.getByLabel("Record-date block").first();
await input.fill(target.toString());
console.log(`opening a future period with record block ${target} (head ${head})`);
await page.getByRole("button", { name: "Open period" }).click();
await waitForToast(page, "confirmed", 150_000);
console.log("toast:", (await page.locator(".toast").innerText()).replace(/\n/g, " | "));

for (let attempt = 0; attempt < 20; attempt += 1) {
  const count = await publicClient.readContract({
    address: "0x5df199D05FB83D14eaFD2823D46982bEb13512F5",
    abi: servicingAbi,
    functionName: "couponPeriodCount",
  });
  if (count >= 2n) {
    for (let id = 0n; id < count; id += 1n) {
      const period = await publicClient.readContract({
        address: "0x5df199D05FB83D14eaFD2823D46982bEb13512F5",
        abi: servicingAbi,
        functionName: "couponPeriod",
        args: [id],
      });
      console.log(`period ${id}: record block ${period.recordDateBlock}, finalized ${period.finalized}`);
    }
    const first = await publicClient.readContract({
      address: "0x5df199D05FB83D14eaFD2823D46982bEb13512F5",
      abi: servicingAbi,
      functionName: "couponPeriod",
      args: [0n],
    });
    console.log(`ACCEPTANCE_TARGET=${first.recordDateBlock}`);
    break;
  }
  await page.waitForTimeout(1000);
}

await context.close();
await browser.close();
