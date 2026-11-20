// Local integration check for PAR's issuer authorization messages.
//
// It reproduces the exact ABI encoding built by
// contracts/lib/AuthorizationMessage.sol and signs it with the official
// QoreChain ML-DSA-87 implementation (@qorechain/pqc). It never writes or
// prints a secret key.
//
// Usage:
//   npm install
//   npm start
//   PAR_PQC_TEST_SEED=<64 hex chars> npm start   # deterministic test key
//
// A seed supplied this way is a TEST key only. It lives in the environment,
// is never persisted, and must never control a funded account.

import { mldsa87 } from "@qorechain/pqc";
import { getBytes, hexlify, keccak256 } from "ethers";
import { COUPON_FIXTURE, EXPECTED_HASHES, REDEMPTION_FIXTURE, buildMessage } from "./fixture.mjs";

function makeKey() {
  const seedHex = process.env.PAR_PQC_TEST_SEED;
  if (seedHex === undefined) {
    return { keySource: "generated-ephemeral", ...mldsa87.keygen() };
  }
  if (!/^[0-9a-fA-F]{64}$/.test(seedHex)) {
    throw new Error("PAR_PQC_TEST_SEED must be exactly 32 bytes of hex (64 characters)");
  }
  return {
    keySource: "PAR_PQC_TEST_SEED test seed",
    ...mldsa87.keygen(Uint8Array.from(Buffer.from(seedHex, "hex"))),
  };
}

const { keySource, publicKey, secretKey } = makeKey();
const actions = [COUPON_FIXTURE, REDEMPTION_FIXTURE];

const report = {
  generatedAt: new Date().toISOString(),
  algorithm: "ML-DSA-87 (FIPS 204)",
  library: "@qorechain/pqc 0.2.3",
  keySource,
  publicKeyHex: hexlify(publicKey),
  publicKeyLength: publicKey.length,
  messages: [],
};

let failed = false;

for (const entry of actions) {
  const { message, paramsHash } = buildMessage(entry);
  const messageHash = keccak256(message);

  if (messageHash !== EXPECTED_HASHES[entry.name]) {
    throw new Error(
      `${entry.name}: message encoding drifted from the Solidity fixture: ${messageHash} != ${EXPECTED_HASHES[entry.name]}`,
    );
  }

  const messageBytes = getBytes(message);
  const signature = mldsa87.sign(secretKey, messageBytes);
  const verified = mldsa87.verify(publicKey, messageBytes, signature);
  const tampered = new Uint8Array(messageBytes);
  tampered[tampered.length - 1] ^= 0x01;
  const tamperedRejected = !mldsa87.verify(publicKey, tampered, signature);
  if (!verified || !tamperedRejected) failed = true;

  report.messages.push({
    action: entry.name,
    actionHash: entry.action,
    nonce: entry.nonce.toString(),
    paramsHash,
    messageHex: hexlify(message),
    messageHash,
    messageByteLength: messageBytes.length,
    signatureLength: signature.length,
    verified,
    tamperedRejected,
  });
}

console.log(JSON.stringify(report, null, 2));

if (failed) {
  console.error("ML-DSA-87 verification failed");
  process.exitCode = 1;
}
