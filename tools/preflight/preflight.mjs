// Read-only QoreChain testnet preflight for PAR.
//
// Performs no writes, needs no key and sends no transaction. It reports the
// chain, block, raw precompile answers and whether the PQC precompiles are
// active. With an issuer address it additionally applies PAR's exact
// registration rules and exits non-zero unless the account holds a registered,
// possession-proven ML-DSA-87 key of exactly 2,592 bytes.
//
// A false verification with a 32-byte response means the precompile is active
// but the supplied signature is invalid; empty data means it is not active (or
// not answering).
//
// Usage:
//   node tools/preflight/preflight.mjs [address]
//   QORE_RPC_URL=https://evm-testnet.qore.host node tools/preflight/preflight.mjs 0xYourAddress

import { createHash } from "node:crypto";

const RPC_URL = process.env.QORE_RPC_URL ?? "https://evm-testnet.qore.host";
const PQC_VERIFY = "0x0000000000000000000000000000000000000A01";
const PQC_KEY_STATUS = "0x0000000000000000000000000000000000000A02";
const EXPECTED_CHAIN_ID = 9800n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const KEY_STATUS_RESPONSE_BYTES = 2752;
const PUBLIC_KEY_BYTES = 2592;

const suppliedAddress = process.argv[2];
if (suppliedAddress !== undefined && !/^0x[0-9a-fA-F]{40}$/.test(suppliedAddress)) {
  throw new Error("address must be a 20-byte hex EVM address");
}
const probeAddress = suppliedAddress ?? ZERO_ADDRESS;

async function rpc(method, params) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

const strip0x = (value) => (value.startsWith("0x") ? value.slice(2) : value);
const word = (index, hex) => {
  const body = strip0x(hex);
  return body.slice(index * 64, (index + 1) * 64);
};
const bigintWord = (index, hex) => {
  const slice = word(index, hex);
  return slice === "" ? null : BigInt(`0x${slice}`);
};
const text = (value) => (typeof value === "bigint" ? value.toString() : value);

const chainId = BigInt(await rpc("eth_chainId", []));
const blockNumber = BigInt(await rpc("eth_blockNumber", []));
const block = await rpc("eth_getBlockByNumber", ["latest", false]);

const keyStatusData = `0x850dfe51${probeAddress.slice(2).padStart(64, "0")}`;
const keyStatusRaw = await rpc("eth_call", [{ to: PQC_KEY_STATUS, data: keyStatusData }, "latest"]);
const keyStatusClean = strip0x(keyStatusRaw);
const keyStatus = {
  rawLength: keyStatusClean.length / 2,
  returnedData: keyStatusRaw !== "0x",
};
const issuerReasons = [];
let exactFourFieldLayout = false;

if (keyStatus.returnedData && keyStatus.rawLength >= 160) {
  keyStatus.registered = bigintWord(0, keyStatusRaw) === 1n;
  keyStatus.algorithmId = text(bigintWord(1, keyStatusRaw));
  keyStatus.pubkeyOffset = text(bigintWord(2, keyStatusRaw));
  keyStatus.possessionProven = bigintWord(3, keyStatusRaw) === 1n;
  keyStatus.pubkeyLength = text(bigintWord(4, keyStatusRaw));
  keyStatus.layout =
    keyStatus.pubkeyOffset === "128"
      ? "four-field (registered, algorithmId, pubkey, possessionProven)"
      : keyStatus.pubkeyOffset === "96"
        ? "three-field legacy layout"
        : "unrecognised offset";

  if (keyStatus.rawLength !== KEY_STATUS_RESPONSE_BYTES) {
    issuerReasons.push(`expected exactly ${KEY_STATUS_RESPONSE_BYTES} bytes, got ${keyStatus.rawLength}`);
  }
  if (keyStatus.pubkeyOffset !== "128") {
    issuerReasons.push(`expected public key offset 128, got ${keyStatus.pubkeyOffset}`);
  }
  if (!keyStatus.registered) issuerReasons.push("issuer key is not registered");
  if (keyStatus.algorithmId !== "1") {
    issuerReasons.push(`expected algorithm id 1 (ML-DSA-87), got ${keyStatus.algorithmId}`);
  }
  if (!keyStatus.possessionProven) {
    issuerReasons.push("proof of possession was not verified (possessionProven is false)");
  }
  if (keyStatus.pubkeyLength !== String(PUBLIC_KEY_BYTES)) {
    issuerReasons.push(`expected a ${PUBLIC_KEY_BYTES}-byte public key, got ${keyStatus.pubkeyLength}`);
  }
  exactFourFieldLayout =
    keyStatus.rawLength === KEY_STATUS_RESPONSE_BYTES &&
    keyStatus.pubkeyOffset === "128" &&
    keyStatus.pubkeyLength === String(PUBLIC_KEY_BYTES);
  if (exactFourFieldLayout) {
    const pubkeyHex = keyStatusClean.slice(5 * 64, 5 * 64 + PUBLIC_KEY_BYTES * 2);
    keyStatus.publicKeySha256 = createHash("sha256").update(Buffer.from(pubkeyHex, "hex")).digest("hex");
  }
} else {
  issuerReasons.push("no four-field key-status response was returned");
}

const issuerReady = suppliedAddress === undefined ? null : issuerReasons.length === 0;

// (bytes,bytes,bytes) with three empty values: heads 0x60/0x80/0xa0 then three zero lengths.
const emptyBytesTriple = `0x${["60", "80", "a0"]
  .map((offset) => offset.padStart(64, "0"))
  .join("")}${"00".repeat(96)}`;
const verifyData = `0xf52bde0a${emptyBytesTriple.slice(2)}`;
const verifyRaw = await rpc("eth_call", [{ to: PQC_VERIFY, data: verifyData }, "latest"]);
const verify = {
  rawLength: (verifyRaw.length - 2) / 2,
  returnedData: verifyRaw !== "0x",
  decodedBool: verifyRaw.length === 66 ? BigInt(verifyRaw) === 1n : null,
  interpretation:
    verifyRaw.length === 66
      ? "precompile active; empty key/signature/message returned false (verification rejected, not unavailable)"
      : "no ABI bool returned: precompile inactive or unavailable",
};

const report = {
  rpc: RPC_URL,
  chainId: text(chainId),
  chainIdMatchesTestnet: chainId === EXPECTED_CHAIN_ID,
  latestBlock: text(blockNumber),
  latestBlockTimestamp: block?.timestamp ? text(BigInt(block.timestamp)) : null,
  precompilesAvailable: keyStatus.returnedData && verifyRaw.length === 66,
  precompileCode: {
    pqcVerify: await rpc("eth_getCode", [PQC_VERIFY, "latest"]),
    pqcKeyStatus: await rpc("eth_getCode", [PQC_KEY_STATUS, "latest"]),
  },
  keyStatusQuery: {
    address: probeAddress,
    addressSource: suppliedAddress ? "supplied by caller" : "synthetic zero-address probe (no address supplied)",
    calldata: keyStatusData,
    ...keyStatus,
  },
  issuerValidation: {
    required: suppliedAddress !== undefined,
    ready: issuerReady,
    checks: {
      exactFourFieldLayout,
      registered: keyStatus.registered === true,
      algorithmId: keyStatus.algorithmId,
      publicKeyLength: keyStatus.pubkeyLength,
      possessionProven: keyStatus.possessionProven === true,
    },
    reasons: issuerReasons,
  },
  pqcVerifyProbe: {
    calldata: verifyData,
    ...verify,
  },
  writesPerformed: false,
};

console.log(JSON.stringify(report, null, 2));

if (chainId !== EXPECTED_CHAIN_ID) {
  console.error(`preflight: expected EVM chain ${EXPECTED_CHAIN_ID}, got ${chainId}`);
  process.exitCode = 1;
}
if (suppliedAddress !== undefined && !issuerReady) {
  console.error("preflight: issuer is not a registered, possession-proven ML-DSA-87 key");
  process.exitCode = 1;
}
