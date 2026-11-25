import { encodeAbiParameters, encodeFunctionData, parseAbi, decodeFunctionResult } from "viem";
import { ADDRESSES, PQC_KEY_STATUS, qoreChain } from "../config";
import { mldsa87 } from "@qorechain/pqc";

const COUPON_MESSAGE_ABI = parseAbi([
  "function couponFinalizationMessage(uint256 periodId, uint64 deadline) view returns (bytes)",
]);
const DEFAULT_ISSUER = "0x06cFd3728F669c5d2B71474eEE63f90BBDBbafA0";
const PQC_VERIFY = "0x0000000000000000000000000000000000000A01" as const;
const VERIFY_SELECTOR = "0xf52bde0a";
const SIGNATURE_BYTES = 4627;
const MESSAGE_BYTES = 288;
const PUBLIC_KEY_BYTES = 2592;

// ------------------------------------------------------------------ tiny DOM helpers

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const child of children) node.append(child);
  return node;
}

function label(text: string, hint?: string) {
  const wrap = el("div", { class: "field-label" }, text);
  if (hint) wrap.append(el("span", { class: "field-hint" }, hint));
  return wrap;
}

function logLine(text: string, tone: "info" | "ok" | "warn" | "err" = "info") {
  const line = el("div", { class: `log-line log-${tone}` }, text);
  ui.log.append(line);
  ui.log.scrollTop = ui.log.scrollHeight;
}

// ------------------------------------------------------------------ UI

const ui = {
  issuer: el("input", { class: "input mono", value: DEFAULT_ISSUER, spellcheck: "false" }),
  period: el("input", { class: "input mono", type: "number", min: "0", value: "1" }),
  deadline: el("input", { class: "input mono", type: "number", min: "0" }),
  deadlineHint: el("div", { class: "field-hint" }),
  secret: el("textarea", {
    class: "input mono",
    spellcheck: "false",
    placeholder: "paste the 4,896-byte hex secret key (or load the .dilithium file below)",
  }),
  keyFile: el("input", { class: "input", type: "file" }),
  sign: el("button", { class: "btn btn-primary" }, "Sign & verify"),
  log: el("div", { class: "log" }),
  result: el("div", { class: "result", hidden: "hidden" }),
};

const setDefaultDeadline = () => {
  const value = Math.floor(Date.now() / 1000) + 3600;
  (ui.deadline as HTMLInputElement).value = String(value);
  renderDeadlineHint();
};

const renderDeadlineHint = () => {
  const raw = Number((ui.deadline as HTMLInputElement).value || 0);
  ui.deadlineHint.textContent = raw
    ? `unix ${raw} · voids after ${new Date(raw * 1000).toLocaleTimeString()} · save this value`
    : "";
};

function readSecret(): Uint8Array {
  const raw = ui.secret.value.replace(/\s+/g, "").replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]+$/.test(raw)) throw new Error("secret key must be hex");
  const bytes = Uint8Array.from(
    (raw.match(/.{2}/g) ?? []).map((byte) => Number.parseInt(byte, 16)),
  );
  if (bytes.length !== 4896) {
    throw new Error(`ML-DSA-87 secret key must be exactly 4,896 bytes, got ${bytes.length}`);
  }
  return bytes;
}

async function rpcCall(to: string, data: string): Promise<string> {
  const response = await fetch(qoreChain.rpcUrls.default.http[0], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const json = (await response.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(`RPC: ${json.error.message}`);
  return json.result ?? "0x";
}

function verifyCalldata(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array) {
  const params = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes" }, { type: "bytes" }],
    [
      `0x${Array.from(publicKey, (b) => b.toString(16).padStart(2, "0")).join("")}`,
      `0x${Array.from(signature, (b) => b.toString(16).padStart(2, "0")).join("")}`,
      `0x${Array.from(message, (b) => b.toString(16).padStart(2, "0")).join("")}`,
    ],
  );
  return `${VERIFY_SELECTOR}${params.slice(2)}` as `0x${string}`;
}

async function run() {
  ui.log.textContent = "";
  ui.result.hidden = true;
  ui.sign.disabled = true;
  ui.sign.textContent = "Signing…";

  try {
    const issuer = ui.issuer.value.trim() as `0x${string}`;
    const periodId = BigInt(ui.period.value || "0");
    const deadline = BigInt(ui.deadline.value || "0");
    if (issuer === "0x0000000000000000000000000000000000000000") throw new Error("issuer is the zero address");
    if (deadline === 0n) throw new Error("set a deadline");
    if (BigInt(Math.floor(Date.now() / 1000)) >= deadline) throw new Error("deadline is already in the past");

    logLine(`chain ${qoreChain.id} (QoreChain testnet)`);

    // The precompile has a custom selector, so query it directly.
    const statusRaw = await rpcCall(
      PQC_KEY_STATUS,
      `0x850dfe51${issuer.slice(2).toLowerCase().padStart(64, "0")}`,
    );
    const clean = statusRaw.slice(2);
    const word = (i: number) => BigInt(`0x${clean.slice(i * 64, (i + 1) * 64)}`);
    if (clean.length < 320) throw new Error("key-status precompile returned no data");
    const registered = word(0) === 1n;
    const algorithmId = Number(word(1));
    const possessionProven = word(3) === 1n;
    const pubkeyLength = Number(word(4));
    if (!registered) throw new Error("issuer key is not registered");
    if (algorithmId !== 1) throw new Error(`expected ML-DSA-87 (algorithm 1), got ${algorithmId}`);
    if (!possessionProven) throw new Error("possession not proven for this key");
    if (pubkeyLength !== PUBLIC_KEY_BYTES) throw new Error(`public key length ${pubkeyLength} ≠ 2,592`);
    const publicKey = Uint8Array.from(
      (clean.slice(5 * 64, 5 * 64 + PUBLIC_KEY_BYTES * 2).match(/.{2}/g) ?? []).map((b) =>
        Number.parseInt(b, 16),
      ),
    );
    const fingerprint = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", publicKey)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    logLine(`key registered · ML-DSA-87 · SHA-256 ${fingerprint.slice(0, 16)}…`, "ok");

    const messageData = encodeFunctionData({
      abi: COUPON_MESSAGE_ABI,
      functionName: "couponFinalizationMessage",
      args: [periodId, deadline],
    });
    const raw = await rpcCall(ADDRESSES.servicing, messageData);
    const [messageHex] = decodeFunctionResult({
      abi: COUPON_MESSAGE_ABI,
      functionName: "couponFinalizationMessage",
      data: raw as `0x${string}`,
    });
    const message = Uint8Array.from(
      (messageHex.slice(2).match(/.{2}/g) ?? []).map((b) => Number.parseInt(b, 16)),
    );
    if (message.length !== MESSAGE_BYTES) {
      throw new Error(`unexpected message length ${message.length}, expected ${MESSAGE_BYTES}`);
    }
    logLine(`message read from BondServicing for period ${periodId} (nonce baked in by eth_call)`, "ok");

    const secretKey = readSecret();
    const signature = mldsa87.sign(secretKey, message);
    if (signature.length !== SIGNATURE_BYTES) {
      throw new Error(`signature length ${signature.length} ≠ ${SIGNATURE_BYTES}`);
    }
    logLine("signed with local key (secret never left this page)", "ok");

    const locallyVerified = mldsa87.verify(publicKey, message, signature);
    if (!locallyVerified) throw new Error("local verification failed — key does not match the registered public key");
    logLine("local verify against on-chain public key ✓", "ok");

    const liveRaw = await rpcCall(PQC_VERIFY, verifyCalldata(publicKey, signature, message));
    const liveOk = BigInt(liveRaw) === 1n;
    if (!liveOk) throw new Error("precompile verify rejected the signature");
    logLine("0x0A01 precompile verify ✓", "ok");

    const signatureHex = `0x${Array.from(signature, (b) => b.toString(16).padStart(2, "0")).join("")}`;
    showResult(signatureHex, periodId.toString(), deadline.toString());
  } catch (error) {
    logLine(error instanceof Error ? error.message : String(error), "err");
  } finally {
    ui.sign.disabled = false;
    ui.sign.textContent = "Sign & verify";
  }
}

function showResult(signatureHex: string, periodId: string, deadline: string) {
  ui.result.textContent = "";
  const sigBox = el("textarea", { class: "input mono result-sig", readonly: "readonly" });
  sigBox.value = signatureHex;
  const copy = el("button", { class: "btn" }, "Copy signature");
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(signatureHex);
    copy.textContent = "Copied ✓";
    setTimeout(() => (copy.textContent = "Copy signature"), 1500);
  });
  ui.result.append(
    el("div", { class: "result-title" }, "Signature ready"),
    el("div", { class: "result-note" },
      `1. open the app → issuer panel → coupon period ${periodId}`,
    ),
    el("div", { class: "result-note" },
      `2. paste this signature and set deadline ${deadline} (exactly as signed)`,
    ),
    el("div", { class: "result-note" }, "3. submit “Finalize” from the ISSUER_ROLE wallet"),
    sigBox,
    el("div", { class: "result-actions" }, copy),
  );
  ui.result.hidden = false;
}

// ------------------------------------------------------------------ wire up

document.getElementById("root")!.append(
  el("div", { class: "page" },
    el("header", { class: "head" },
      el("div", { class: "brand" }, "PAR · issuer signer"),
      el("h1", { class: "title" }, "Sign a BondServicing action"),
      el("p", { class: "lede" },
        "Signs the coupon-finalization message with your registered ML-DSA-87 key, entirely in this page. ",
        "The secret key is never transmitted — only read-only eth_calls go to the RPC.",
      ),
    ),
    el("section", { class: "card" },
      label("PQC issuer identity", "the registered 0x address, not your EVM wallet"),
      ui.issuer,
      el("div", { class: "row" },
        el("div", { class: "col" }, label("Period id"), ui.period),
        el("div", { class: "col" }, label("Deadline (unix seconds)"), ui.deadline, ui.deadlineHint),
      ),
      label("ML-DSA-87 secret key", "4,896-byte hex — stays in memory, never sent"),
      ui.secret,
      label("…or load the key file", "the .dilithium file produced by keygen"),
      ui.keyFile,
      el("div", { class: "actions" }, ui.sign),
      ui.log,
      ui.result,
    ),
    el("footer", { class: "foot" },
      `Servicing ${ADDRESSES.servicing} · precompiles 0x0A01/0x0A02`,
    ),
  ),
);

setDefaultDeadline();
ui.deadline.addEventListener("input", renderDeadlineHint);
ui.keyFile.addEventListener("change", async () => {
  const file = ui.keyFile.files?.[0];
  if (!file) return;
  const text = await file.text();
  ui.secret.value = text.replace(/\s+/g, "").replace(/^0x/i, "");
  logLine(`loaded ${file.name} (${ui.secret.value.length / 2} bytes)`, "info");
});
ui.sign.addEventListener("click", () => void run());

// Style: minimal, responsive, in the app's palette.
document.head.append(
  el("style", { textContent: `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #f5f2ea; color: #1c2620; font: 15px/1.5 Inter, system-ui, sans-serif; }
#root { min-height: 100vh; }
.page { max-width: 640px; margin: 0 auto; padding: clamp(16px, 4vw, 40px); }
.head { margin-bottom: clamp(14px, 3vw, 24px); }
.brand { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: #6b756d; }
.title { font-family: Fraunces, Georgia, serif; font-size: clamp(1.5rem, 6vw, 2rem); margin: .3em 0; }
.lede { color: #4c564e; margin: 0; }
.card { background: #fff; border: 1px solid #e3ded1; border-radius: 10px; padding: clamp(14px, 3vw, 22px); }
.field-label { font-weight: 600; font-size: 13px; margin: 14px 0 6px; }
.field-label:first-child { margin-top: 0; }
.field-hint { font-weight: 400; color: #6b756d; margin-left: 6px; }
.input { width: 100%; border: 1px solid #d8d2c2; border-radius: 8px; padding: 10px 12px; font-size: 14px; background: #fbfaf6; }
.input:focus { outline: 2px solid #0f4738; outline-offset: 1px; }
textarea.input { min-height: 90px; resize: vertical; word-break: break-all; }
.mono { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12.5px; }
.row { display: flex; gap: 12px; flex-wrap: wrap; }
.col { flex: 1 1 200px; }
.actions { margin-top: 18px; }
.btn { border: 1px solid #0f4738; background: #0f4738; color: #fff; border-radius: 8px; padding: 11px 18px; font-weight: 600; cursor: pointer; }
.btn:disabled { opacity: .6; cursor: default; }
.btn:disabled, .btn[disabled] { background: #9aa79e; border-color: #9aa79e; }
.log { margin-top: 16px; display: grid; gap: 4px; font-size: 13px; max-height: 220px; overflow-y: auto; }
.log-line { padding: 4px 8px; border-radius: 6px; background: #f4f1e9; word-break: break-word; }
.log-ok { color: #116149; background: #e8f3ec; }
.log-err { color: #8f2d2d; background: #f7e8e8; }
.result { margin-top: 16px; border: 1px solid #0f4738; border-radius: 10px; padding: 14px; background: #eef6f0; }
.result-title { font-weight: 700; margin-bottom: 6px; }
.result-note { font-size: 13px; color: #37423a; }
.result-sig { margin: 10px 0; min-height: 110px; }
.result-actions { display: flex; }
.foot { margin-top: 18px; font-size: 12px; color: #6b756d; word-break: break-all; }
` }));

