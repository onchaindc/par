// Read-only check of the live QoreChain pqcVerify precompile.
//
// Generates an ephemeral ML-DSA-87 key, signs a message with the official
// @qorechain/pqc library and asks the testnet precompile (eth_call, no
// transaction, no registration, no key on chain) whether the signature is
// valid. It then repeats the call with a tampered message, which must return
// false. The secret key is never printed or persisted.
//
// Usage:
//   node tools/pqc-sign/verify-live.mjs
//   QORE_RPC_URL=https://evm-testnet.qore.host node tools/pqc-sign/verify-live.mjs

import { mldsa87, shake256 } from "@qorechain/pqc";
import { AbiCoder, getBytes, hexlify, toUtf8Bytes } from "ethers";

const RPC_URL = process.env.QORE_RPC_URL ?? "https://evm-testnet.qore.host";
const PQC_VERIFY = "0x0000000000000000000000000000000000000A01";
const abi = AbiCoder.defaultAbiCoder();

async function ethCall(to, data) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data, gas: "0x7a120" }, "latest"],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  if (body.error) throw new Error(`eth_call: ${JSON.stringify(body.error)}`);
  return body.result;
}

const { publicKey, secretKey } = mldsa87.keygen();
const message = getBytes(hexlify(toUtf8Bytes("PAR live pqcVerify preflight")));
const signature = mldsa87.sign(secretKey, message);
const tampered = new Uint8Array(message);
tampered[0] ^= 0x01;

const encodeCall = (messageBytes) =>
  `0xf52bde0a${abi.encode(["bytes", "bytes", "bytes"], [hexlify(publicKey), hexlify(signature), hexlify(messageBytes)]).slice(2)}`;

const [validRaw, tamperedRaw] = await Promise.all([
  ethCall(PQC_VERIFY, encodeCall(message)),
  ethCall(PQC_VERIFY, encodeCall(tampered)),
]);

const asBool = (raw) => (raw === "0x" ? null : BigInt(raw) === 1n);

const report = {
  rpc: RPC_URL,
  precompile: PQC_VERIFY,
  method: "eth_call (read-only, no transaction, no registration)",
  library: "@qorechain/pqc 0.2.3",
  publicKeyLength: publicKey.length,
  publicKeyHashShake256_32: hexlify(shake256(publicKey, 32)),
  messageLength: message.length,
  signatureLength: signature.length,
  validSignatureReturned: asBool(validRaw),
  validSignatureRaw: validRaw,
  tamperedSignatureReturned: asBool(tamperedRaw),
  tamperedSignatureRaw: tamperedRaw,
  note:
    asBool(validRaw) === true
      ? "live precompile accepted the locally generated ML-DSA-87 signature over the raw message"
      : "live precompile did NOT accept the signature; do not rely on this path",
};

console.log(JSON.stringify(report, null, 2));
if (asBool(validRaw) !== true || asBool(tamperedRaw) !== false) process.exitCode = 1;
