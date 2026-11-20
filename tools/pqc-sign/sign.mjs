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
import { AbiCoder, getBytes, hexlify, keccak256, toUtf8Bytes } from "ethers";

const DOMAIN = keccak256(toUtf8Bytes("PAR_BOND_AUTHORIZATION_V1"));
const abi = AbiCoder.defaultAbiCoder();

// Fixed sample inputs shared with test/AuthorizationMessage.t.sol.
const SAMPLE = {
  chainId: 9800n,
  servicing: "0x1111111111111111111111111111111111111111",
  bond: "0x2222222222222222222222222222222222222222",
  deadline: 1_893_456_000n, // 2030-01-01T00:00:00Z
};

const MESSAGE_TYPES = [
  "bytes32", // domain
  "uint256", // chain id
  "address", // servicing contract
  "address", // bond token
  "bytes32", // action type
  "uint256", // authorization nonce
  "uint64", // deadline
  "bytes32", // parameters hash
];

const EXPECTED_HASHES = {
  couponFinalization:
    "0x266c8e516dacb848a2b62b8970803d4d32aeea66d0409f251fe9e8d8671dcbfe",
  redemptionDeclaration:
    "0xc71335b4e6766c5b4c61a0831c0f75c07caf0e1b8bbc7a46f3ede2a4335f78b4",
};

function buildMessage(action, nonce, params) {
  const paramsHash = keccak256(abi.encode(params.types, params.values));
  const message = abi.encode(
    MESSAGE_TYPES,
    [DOMAIN, SAMPLE.chainId, SAMPLE.servicing, SAMPLE.bond, action, nonce, SAMPLE.deadline, paramsHash],
  );
  return { message, paramsHash };
}

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

const actions = [
  {
    name: "couponFinalization",
    nonce: 7n,
    action: keccak256(toUtf8Bytes("PAR_ACTION_FINALIZE_COUPON_V1")),
    params: {
      types: ["uint256", "uint64", "uint128", "uint256", "uint64"],
      values: [0n, 100n, 2_500_000n, 3_750_000_000n, SAMPLE.deadline],
    },
  },
  {
    name: "redemptionDeclaration",
    nonce: 8n,
    action: keccak256(toUtf8Bytes("PAR_ACTION_DECLARE_REDEMPTION_V1")),
    params: {
      types: ["uint64", "uint128", "uint256", "uint64"],
      values: [100n, 100_000_000n, 150_000_000_000n, SAMPLE.deadline],
    },
  },
];

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
  const { message, paramsHash } = buildMessage(entry.action, entry.nonce, entry.params);
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
    messageByteLength: (message.length - 2) / 2,
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
