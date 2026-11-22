import { launch, mockWalletContext, operationalWallet, PREVIEW_URL, publicClient, assert, enterApp } from "./lib.mjs";

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
  const cover = await page.evaluate(() => {
    const title = document.querySelector(".cover__title");
    const cert = document.querySelector(".certificate");
    const outside = [...document.querySelectorAll(".certificate, .tape, .cover__cta, .cover__ledger, .mechanics")].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.right > window.innerWidth + 1 || box.left < -1;
    }).length;
    const seal = document.querySelector(".certificate__seal");
    let sealOverlaps = 0;
    if (seal) {
      const a = seal.getBoundingClientRect();
      for (const element of document.querySelectorAll(".certificate__row strong, .certificate__head")) {
        const b = element.getBoundingClientRect();
        const overlap =
          Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
          Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (overlap > 4) sealOverlaps += 1;
      }
    }
    return {
      hasTitle: Boolean(title),
      sealOverlaps,
      titleFont: title ? getComputedStyle(title).fontFamily : null,
      titleSize: title ? getComputedStyle(title).fontSize : null,
      hasCertificate: Boolean(cert),
      tapeItems: document.querySelectorAll(".tape__item").length,
      hasCta: Boolean(document.querySelector(".cover__actions .btn--primary")),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      outside,
      text: document.body.innerText,
    };
  });
  record(`${label} cover: rendered`, cover.hasTitle && cover.hasCertificate && /Par Bond/.test(cover.text), "");
  record(`${label} cover: terms tape`, cover.tapeItems === 4, `${cover.tapeItems} items`);
  record(`${label} cover: entry CTA`, cover.hasCta, "");
  record(`${label} cover: display font`, /Fraunces/.test(cover.titleFont ?? ""), cover.titleFont ?? "none");
  record(`${label} cover: no horizontal overflow`, cover.overflow <= 1, `delta ${cover.overflow}px`);
  record(`${label} cover: blocks inside viewport`, cover.outside === 0, `${cover.outside} outside`);
  record(`${label} cover: seal does not cover text`, cover.sealOverlaps === 0, `${cover.sealOverlaps} overlaps`);
  console.log(`${label} cover metrics`, JSON.stringify({ ...cover, text: undefined }));
  await enterApp(page);
  await page.waitForTimeout(900);
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
    const nav = document.querySelector(".tabs");
    const navBox = nav ? nav.getBoundingClientRect() : null;
    const header = document.querySelector(".topbar");
    const headerBox = header ? header.getBoundingClientRect() : null;
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
      navPosition: nav ? getComputedStyle(nav).position : null,
      navGap: navBox ? Math.round(window.innerHeight - navBox.bottom) : null,
      headerHeight: headerBox ? Math.round(headerBox.height) : null,
      holderRows: document.querySelectorAll(".table tbody tr").length,
      text: document.body.innerText,
    };
  });
  record(`${label}: no horizontal page overflow`, metrics.pageOverflow <= 1, `delta ${metrics.pageOverflow}px`);
  record(`${label}: cards inside viewport`, metrics.cardsOutside === 0, `${metrics.cardsOutside} outside`);
  record(`${label}: no clipped controls`, metrics.clipped.length === 0, metrics.clipped.join(" | "));
  record(`${label}: display font`, /Fraunces/.test(metrics.h1Font ?? ""), metrics.h1Font ?? "none");
  record(`${label}: body font`, /Inter/.test(metrics.bodyFont), metrics.bodyFont);
  record(`${label}: content rendered`, /Par Bond 2030/.test(metrics.text), JSON.stringify(metrics.text.slice(0, 60)));
  record(`${label}: navigation present`, /Manage/.test(metrics.text) && /Records/.test(metrics.text), "");
  record(
    `${label}: navigation placement`,
    viewport.width <= 980
      ? metrics.navPosition === "fixed" && metrics.navGap !== null && metrics.navGap >= 0 && metrics.navGap <= 28
      : metrics.navPosition === "static" && metrics.headerHeight <= 74,
    `${metrics.navPosition} · gap ${metrics.navGap}px · header ${metrics.headerHeight}px`,
  );
  record(`${label}: holder register readable`, /Who holds the bonds/.test(metrics.text) && metrics.holderRows > 0, `${metrics.holderRows} rows`);
  record(`${label}: rendered without page errors`, errors.length === 0, errors.join(" | "));
  console.log(`${label} metrics`, JSON.stringify({ ...metrics, text: undefined }));
  await context.close();
}

await layout({ width: 1440, height: 960 }, "desktop 1440");
await layout({ width: 768, height: 1024 }, "tablet 768");
await layout({ width: 390, height: 844 }, "mobile 390");
await layout({ width: 360, height: 780 }, "mobile 360");

// Connected wallet on the correct chain, then account change and disconnect.
{
  const context = await mockWalletContext(browser);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(PREVIEW_URL, { waitUntil: "networkidle", timeout: 90_000 });
  await enterApp(page);
  await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).click();
  await page.waitForTimeout(1200);
  record("wallet connects", await page.getByRole("button", { name: "Disconnect" }).isVisible(), wallet.address);
  await page.getByRole("tab", { name: /My bonds/ }).click();
  await page.waitForTimeout(800);
  const portfolioText = await page.locator(".tabs-panel").innerText();
  record("portfolio shows holding", /1,000/.test(portfolioText), portfolioText.slice(0, 80).replace(/\n/g, " / "));

  await page.getByRole("tab", { name: /Manage the bond/ }).click();
  const issuerRole = page.getByText("Can manage", { exact: true });
  const treasurerRole = page.getByText("Can fund", { exact: true });
  await issuerRole.waitFor({ timeout: 15_000 }).catch(() => {});
  record(
    "issuer roles detected",
    (await issuerRole.count()) > 0 && (await treasurerRole.count()) > 0,
    "",
  );

  await page.evaluate(() => window.__mockSetAccount("0x1111111111111111111111111111111111111111"));
  await page.getByText("View only", { exact: true }).waitFor({ timeout: 15_000 }).catch(() => {});
  const rolelessText = await page.locator(".tabs-panel").innerText();
  record(
    "account change updates roles",
    /view only/i.test(rolelessText) && /view-only/i.test(rolelessText),
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
  await enterApp(page);
  await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).click();
  await page.waitForTimeout(1200);
  record(
    "wrong network banner",
    /wrong network/i.test(await page.locator("body").innerText()),
    "",
  );
  await page.getByRole("button", { name: "Switch network" }).click();
  await page.waitForTimeout(1500);
  const text = await page.locator("body").innerText();
  record("network switch", /QoreChain Diana/.test(text) && !/wrong network/i.test(text), "");
  await context.close();
}

// No wallet installed.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(PREVIEW_URL, { waitUntil: "networkidle", timeout: 90_000 });
  await enterApp(page);
  await page.getByRole("tab", { name: /My bonds/ }).click();
  await page.waitForTimeout(300);
  const text = await page.locator(".tabs-panel").innerText();
  record("no-wallet reading", /Connect to see your bonds/i.test(text), text.slice(0, 70));
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
