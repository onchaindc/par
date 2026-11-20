// Shared QoreChain constants and helpers for PAR's read-only issuer tooling.
//
// Nothing in this module broadcasts a transaction or prints secret key bytes.
// The only secret it handles is read from a local file and returned to the
// caller for signing.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AbiCoder, computeAddress, getAddress } from "ethers";

export const TESTNET = {
  chainId: "qorechain-diana",
  evmChainId: 9800,
  rpc: "https://evm-testnet.qore.host",
  rest: "https://api-testnet.qore.host",
};

export const PQC_VERIFY = "0x0000000000000000000000000000000000000A01";
export const PQC_KEY_STATUS = "0x0000000000000000000000000000000000000A02";

export const ML_DSA_87 = 1;
export const ML_DSA_87_PUBLIC_KEY_BYTES = 2592;
export const ML_DSA_87_SECRET_KEY_BYTES = 4896;
export const ML_DSA_87_SIGNATURE_BYTES = 4627;
export const KEY_STATUS_RESPONSE_BYTES = 2752;
export const VERIFY_SELECTOR = "0xf52bde0a";
export const KEY_STATUS_SELECTOR = "0x850dfe51";
export const PROOF_OF_POSSESSION_DOMAIN = "qorechain-pqc-pop-v1";

const abi = AbiCoder.defaultAbiCoder();
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function strip0x(value) {
  return typeof value === "string" && value.startsWith("0x") ? value.slice(2) : value;
}

export function isHex(value) {
  return typeof value === "string" && /^[0-9a-fA-F]*$/.test(value) && value.length % 2 === 0;
}

function bech32Polymod(values) {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i += 1) {
      if ((top >>> i) & 1) checksum ^= BECH32_GENERATOR[i];
    }
  }
  return checksum >>> 0;
}

function bech32HrpExpand(hrp) {
  const values = [];
  for (const character of hrp) values.push(character.charCodeAt(0) >> 5);
  values.push(0);
  for (const character of hrp) values.push(character.charCodeAt(0) & 31);
  return values;
}

function bech32Checksum(hrp, data) {
  const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const polymod = bech32Polymod(values) ^ 1;
  const result = [];
  for (let i = 0; i < 6; i += 1) result.push((polymod >>> (5 * (5 - i))) & 31);
  return result;
}

function convertBits(data, fromBits, toBits, pad) {
  let accumulator = 0;
  let bits = 0;
  const result = [];
  const maxValue = (1 << toBits) - 1;
  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) throw new Error("invalid bech32 data");
    accumulator = (accumulator << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((accumulator >> bits) & maxValue);
    }
  }
  if (pad) {
    if (bits > 0) result.push((accumulator << (toBits - bits)) & maxValue);
  } else if (bits >= fromBits || ((accumulator << (toBits - bits)) & maxValue) !== 0) {
    throw new Error("invalid bech32 padding");
  }
  return result;
}

function bech32Encode(hrp, data) {
  const checksum = bech32Checksum(hrp, data);
  return `${hrp}1${[...data, ...checksum].map((value) => BECH32_CHARSET[value]).join("")}`;
}

function bech32Decode(value) {
  if (value !== value.toLowerCase() && value !== value.toUpperCase()) {
    throw new Error("bech32 string must not mix case");
  }
  const lower = value.toLowerCase();
  const separator = lower.lastIndexOf("1");
  if (separator < 1 || separator + 7 > lower.length) throw new Error("invalid bech32 separator");
  const hrp = lower.slice(0, separator);
  const data = [];
  for (const character of lower.slice(separator + 1)) {
    const index = BECH32_CHARSET.indexOf(character);
    if (index === -1) throw new Error("invalid bech32 character");
    data.push(index);
  }
  if (bech32Polymod([...bech32HrpExpand(hrp), ...data]) !== 1) {
    throw new Error("invalid bech32 checksum");
  }
  return { hrp, data: data.slice(0, -6) };
}

export function qorAddressFromBytes(bytes) {
  return bech32Encode("qor", convertBits([...bytes], 8, 5, true));
}

export function bytesFromQorAddress(address) {
  const decoded = bech32Decode(address);
  if (decoded.hrp !== "qor") throw new Error(`expected a qor1 address, got ${decoded.hrp}1...`);
  const bytes = Uint8Array.from(convertBits(decoded.data, 5, 8, false));
  if (bytes.length !== 20) throw new Error("qor1 account must contain 20 address bytes");
  return bytes;
}

export function parseAccount(value) {
  if (typeof value !== "string") throw new Error("account must be a 0x EVM address or qor1 address");
  let bytes;
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) {
    const evmAddress = getAddress(value);
    bytes = Uint8Array.from(Buffer.from(strip0x(evmAddress), "hex"));
  } else if (/^qor1[0-9a-z]+$/.test(value)) {
    bytes = bytesFromQorAddress(value);
  } else {
    throw new Error("account must be a 20-byte 0x EVM address or a qor1 bech32 address");
  }
  const evmAddress = getAddress(`0x${Buffer.from(bytes).toString("hex")}`);
  return { bytes, evmAddress, qorAddress: qorAddressFromBytes(bytes) };
}

export function validateClassicalPubkey(publicKeyHex, expectedEvmAddress) {
  const value = strip0x(publicKeyHex);
  if (!isHex(value) || value.length !== 66) {
    throw new Error("ecdsa public key must be a 33-byte compressed secp256k1 key");
  }
  if (!value.startsWith("02") && !value.startsWith("03")) {
    throw new Error("ecdsa public key must start with 02 or 03 (compressed form)");
  }
  const derived = computeAddress(`0x${value}`);
  if (derived.toLowerCase() !== expectedEvmAddress.toLowerCase()) {
    throw new Error(`ecdsa public key controls ${derived}, not ${expectedEvmAddress}`);
  }
  return value.toLowerCase();
}

export function assertTestnet(chainId) {
  if (BigInt(chainId) !== BigInt(TESTNET.evmChainId)) {
    throw new Error(
      `refusing chain ${BigInt(chainId)}: this tooling is restricted to ${TESTNET.chainId} (EVM ${TESTNET.evmChainId})`,
    );
  }
}

export function assertOutsideRepository(target) {
  const resolved = path.resolve(target);
  const relative = path.relative(projectRoot, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error(`refusing to write secret or generated data inside the repository: ${resolved}`);
  }
  return resolved;
}

export function readSecretKeyFile(file) {
  const resolved = path.resolve(file);
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`PQC key file must be a regular file, not a symlink: ${resolved}`);
  }
  if ((stat.mode & 0o777) !== 0o600) {
    throw new Error(
      `PQC key file must have mode 0600 (found ${(stat.mode & 0o777).toString(8).padStart(3, "0")}): ${resolved}`,
    );
  }
  const raw = fs.readFileSync(resolved, "utf8").trim();
  if (!isHex(raw) || raw.length !== ML_DSA_87_SECRET_KEY_BYTES * 2) {
    throw new Error(`PQC key file is not a ${ML_DSA_87_SECRET_KEY_BYTES}-byte hex secret key: ${resolved}`);
  }
  return Uint8Array.from(Buffer.from(raw, "hex"));
}

export function proofOfPossessionMessage({ chainId, algorithmId, account, publicKey }) {
  return Buffer.from(
    `${PROOF_OF_POSSESSION_DOMAIN}|${chainId}|${algorithmId}|${account}|${Buffer.from(publicKey).toString("hex")}`,
    "utf8",
  );
}

export function encodeKeyStatusCalldata(address) {
  const clean = strip0x(getAddress(address));
  return `${KEY_STATUS_SELECTOR}${clean.padStart(64, "0")}`;
}

export function encodeVerifyCalldata(publicKey, signature, message) {
  return `${VERIFY_SELECTOR}${strip0x(
    abi.encode(["bytes", "bytes", "bytes"], [
      `0x${Buffer.from(publicKey).toString("hex")}`,
      `0x${Buffer.from(signature).toString("hex")}`,
      `0x${Buffer.from(message).toString("hex")}`,
    ]),
  )}`;
}

export function decodeBool(raw) {
  if (typeof raw !== "string" || raw.length !== 66) return null;
  const value = BigInt(raw);
  return value === 0n ? false : value === 1n ? true : null;
}

export function decodeKeyStatus(raw) {
  const clean = strip0x(raw ?? "");
  const reasons = [];
  if (!isHex(clean) || clean.length < 160) {
    return {
      rawLength: isHex(clean) ? clean.length / 2 : 0,
      returnedData: clean.length > 0,
      valid: false,
      reasons: ["no four-field key-status response was returned"],
    };
  }

  const word = (index) => BigInt(`0x${clean.slice(index * 64, (index + 1) * 64)}`);
  const rawLength = clean.length / 2;
  const registered = word(0) === 1n;
  const algorithmId = Number(word(1));
  const pubkeyOffset = Number(word(2));
  const possessionProven = word(3) === 1n;
  const pubkeyLength = Number(word(4));
  const exactLayout = rawLength === KEY_STATUS_RESPONSE_BYTES;
  const exactOffset = pubkeyOffset === 128;
  const exactLength = pubkeyLength === ML_DSA_87_PUBLIC_KEY_BYTES;

  let pubkey = null;
  if (exactLayout && exactOffset && exactLength) {
    pubkey = Uint8Array.from(Buffer.from(clean.slice(5 * 64, 5 * 64 + ML_DSA_87_PUBLIC_KEY_BYTES * 2), "hex"));
    if (pubkey.length !== ML_DSA_87_PUBLIC_KEY_BYTES) reasons.push("public key bytes are truncated");
  }

  if (!exactLayout) reasons.push(`expected exactly ${KEY_STATUS_RESPONSE_BYTES} bytes, got ${rawLength}`);
  if (!exactOffset) reasons.push(`expected public key offset 128, got ${pubkeyOffset}`);
  if (!registered) reasons.push("issuer key is not registered");
  if (algorithmId !== ML_DSA_87) reasons.push(`expected algorithm id 1 (ML-DSA-87), got ${algorithmId}`);
  if (!possessionProven) reasons.push("proof of possession was not verified (possessionProven is false)");
  if (!exactLength) reasons.push(`expected a ${ML_DSA_87_PUBLIC_KEY_BYTES}-byte public key, got ${pubkeyLength}`);

  return {
    rawLength,
    returnedData: true,
    registered,
    algorithmId,
    pubkeyOffset,
    possessionProven,
    pubkeyLength,
    layout: exactOffset ? "four-field" : "unrecognised",
    pubkey,
    valid:
      exactLayout &&
      exactOffset &&
      registered &&
      algorithmId === ML_DSA_87 &&
      possessionProven &&
      exactLength &&
      pubkey !== null,
    reasons,
  };
}

export async function rpc(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
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

export async function ethCall(rpcUrl, to, data) {
  return rpc(rpcUrl, "eth_call", [{ to, data, gas: "0x7a120" }, "latest"]);
}

export function publicKeyFingerprint(publicKey) {
  // SHA-256 is only a readable fingerprint; it is not used as key material.
  return createHash("sha256").update(Buffer.from(publicKey)).digest("hex");
}
