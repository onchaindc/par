// Read-only QoreChain testnet preflight for PAR.
//
// Performs no writes, needs no key and sends no transaction. It reports the
// chain, block, raw precompile answers and whether the PQC precompiles are
// active. A false verification with a 32-byte response means the precompile is
// active but the supplied signature is invalid; empty data means it is not
// active (or not answering).
//
// Usage:
//   node tools/preflight/preflight.mjs [address]
//   QORE_RPC_URL=https://evm-testnet.qore.host node tools/preflight/preflight.mjs 0xYourAddress

const RPC_URL = process.env.QORE_RPC_URL ?? "https://evm-testnet.qore.host";
const PQC_VERIFY = "0x0000000000000000000000000000000000000A01";
const PQC_KEY_STATUS = "0x0000000000000000000000000000000000000A02";
const EXPECTED_CHAIN_ID = 9800n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

const word = (index, hex) => {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
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

const keyStatus = { rawLength: (keyStatusRaw.length - 2) / 2, returnedData: keyStatusRaw !== "0x" };
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
}

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
  pqcVerifyProbe: {
    calldata: verifyData,
    ...verify,
  },
  writesPerformed: false,
};

console.log(JSON.stringify(report, null, 2));
