import { launch, mockWalletContext, operationalWallet, PREVIEW_URL, publicClient, assert } from "./lib.mjs";

const browser = await launch();
const wallet = operationalWallet();
const findings = [];
const failures = [];

function record(name, ok, detail) {
  findings.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

async function layout(viewport, label) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(PREVIEW_URL, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(3000);
  const metrics = await page.evaluate(() => {
    const clipped = [];
    for (const element of document.querySelectorAll(".btn, .tab, .pill, .stat__value")) {
      if (element.scrollWidth > element.clientWidth + 2) {
        clipped.push(`${element.className}: ${(element.textContent ?? "").trim().slice(0, 36)}`);
      }
    }
    const cardsOutside = [...document.querySelectorAll(".card")].filter((card) => {
      const box = card.getBoundingClientRect();
      return box.right > window.innerWidth + 1 || box.left < -1;
    }).length;
    const heading = document.querySelector("h1");
    const tabs = document.querySelector(".tabs__inner");
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cardsOutside,
      clipped,
      h1Font: heading ? getComputedStyle(heading).fontFamily : null,
      h1Size: heading ? getComputedStyle(heading).fontSize : null,
      bodyFont: getComputedStyle(document.body).fontFamily,
      fontsReady: document.fonts.status,
      tabsOverflow: tabs ? tabs.scrollWidth - tabs.clientWidth : 0,
      cards: document.querySelectorAll(".card").length,
      tables: document.querySelectorAll(".table-wrap").length,
      text: document.body.innerText,
    };
  });
  record(`${label}: no horizontal page overflow`, metrics.pageOverflow <= 1, `delta ${metrics.pageOverflow}px`);
  record(`${label}: cards inside viewport`, metrics.cardsOutside === 0, `${metrics.cardsOutside} outside`);
  record(`${label}: no clipped controls`, metrics.clipped.length === 0, metrics.clipped.join(" | "));
  record(`${label}: display font`, /Fraunces/.test(metrics.h1Font ?? ""), metrics.h1Font ?? "none");
  record(`${label}: body font`, /Inter/.test(metrics.bodyFont), metrics.bodyFont);
  record(`${label}: content rendered`, /Par Bond 2030/.test(metrics.text), JSON.stringify(metrics.text.slice(0, 60)));
  record(`${label}: navigation present`, /Issuer operations/.test(metrics.text) && /Reconciliation/.test(metrics.text), "");
  record(`${label}: rendered without page errors`, errors.length === 0, errors.join(" | "));
  console.log(`${label} metrics`, JSON.stringify({ ...metrics, text: undefined }));
  await context.close();
}

await layout({ width: 1440, height: 960 }, "desktop 1440");
await layout({ width: 768, height: 1024 }, "tablet 768");
await layout({ width: 390, height: 844 }, "mobile 390");

// Connected wallet on the correct chain, then account change and disconnect.
{
  const context = await mockWalletContext(browser);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(PREVIEW_URL, { waitUntil: "networkidle", timeout: 90_000 });
  await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).click();
  await page.waitForTimeout(1200);
  record("wallet connects", await page.getByRole("button", { name: "Disconnect" }).isVisible(), wallet.address);
  await page.getByRole("tab", { name: /Portfolio/ }).click();
  await page.waitForTimeout(800);
  const portfolioText = await page.locator(".tabs-panel").innerText();
  record("portfolio shows holding", /1,000/.test(portfolioText), portfolioText.slice(0, 80).replace(/\n/g, " / "));

  await page.getByRole("tab", { name: /Issuer operations/ }).click();
  const issuerRole = page.getByText("Issuer role", { exact: true });
  const treasurerRole = page.getByText("Treasurer role", { exact: true });
  await issuerRole.waitFor({ timeout: 15_000 }).catch(() => {});
  record(
    "issuer roles detected",
    (await issuerRole.count()) > 0 && (await treasurerRole.count()) > 0,
    "",
  );

  await page.evaluate(() => window.__mockSetAccount("0x1111111111111111111111111111111111111111"));
  await page.getByText("No issuer role", { exact: true }).waitFor({ timeout: 15_000 }).catch(() => {});
  const rolelessText = await page.locator(".tabs-panel").innerText();
  record(
    "account change updates roles",
    /no issuer role/i.test(rolelessText) && /holds neither/i.test(rolelessText),
    rolelessText.slice(0, 90).replace(/\n/g, " / "),
  );

  await page.evaluate(() => window.__mockSetAccount(window.__mockOperational ?? "0x3270c190500BCA8e26da8279c88d2C54035CAFba"));
  await page.getByRole("button", { name: "Disconnect" }).click();
  await page.waitForTimeout(600);
  record(
    "disconnect",
    await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).isVisible(),
    "",
  );
  record("connected flow page errors", errors.length === 0, errors.join(" | "));
  await context.close();
}

// Wrong network handling.
{
  const context = await mockWalletContext(browser, { chainId: "0x1" });
  const page = await context.newPage();
  await page.goto(PREVIEW_URL, { waitUntil: "networkidle", timeout: 90_000 });
  await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).click();
  await page.waitForTimeout(1200);
  record(
    "wrong network banner",
    /Your wallet is on chain 1/.test(await page.locator("body").innerText()),
    "",
  );
  await page.getByRole("button", { name: "Switch to 9800" }).click();
  await page.waitForTimeout(1500);
  const text = await page.locator("body").innerText();
  record("network switch", /QoreChain Diana/.test(text) && !/Your wallet is on chain 1/.test(text), "");
  await context.close();
}

// No wallet installed.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(PREVIEW_URL, { waitUntil: "networkidle", timeout: 90_000 });
  const text = await page.locator("body").innerText();
  record("no-wallet notice", /No browser wallet detected/.test(text), "");
  await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).click();
  await page.waitForTimeout(400);
  record("no-wallet connect error", /No browser wallet found/.test(await page.locator("body").innerText()), "");
  await context.close();
}

const block = await publicClient.getBlockNumber();
console.log(`head block ${block}`);
console.log(`\n${findings.length - failures.length}/${findings.length} checks passed`);
if (failures.length) {
  console.log("FAILURES:", failures);
  process.exitCode = 1;
}
await browser.close();
