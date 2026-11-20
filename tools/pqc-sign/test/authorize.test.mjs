// Tests for authorize.mjs external-signature support.
//
// These tests never touch a real node: a local JSON-RPC server implements
// eth_chainId, the pqcKeyStatus precompile and the pqcVerify precompile using
// the same @qorechain/pqc library. The verification path is therefore real
// cryptography, while the network stays offline.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { AbiCoder, getBytes, hexlify, keccak256 } from "ethers";
import { mldsa87 } from "@qorechain/pqc";
import {
  ML_DSA_87_SECRET_KEY_BYTES,
  ML_DSA_87_SIGNATURE_BYTES,
  PQC_KEY_STATUS,
  PQC_VERIFY,
  publicKeyFingerprint,
} from "../common.mjs";
import { COUPON_FIXTURE, buildMessage } from "../fixture.mjs";

const abi = AbiCoder.defaultAbiCoder();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const issuer = "0x1111111111111111111111111111111111111111";

const { publicKey, secretKey } = mldsa87.keygen();
const message = getBytes(buildMessage(COUPON_FIXTURE).message);
const validSignature = mldsa87.sign(secretKey, message);

const word = (value) => BigInt(value).toString(16).padStart(64, "0");
const keyStatusRaw = `0x${word(1)}${word(1)}${word(128)}${word(1)}${word(publicKey.length)}${hexlify(publicKey).slice(2)}`;

const server = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    try {
      const { id, method, params } = JSON.parse(body);
      let result;
      if (method === "eth_chainId") {
        result = "0x2648"; // 9800, qorechain-diana
      } else if (method === "eth_call") {
        const { to, data } = params[0];
        if (to.toLowerCase() === PQC_KEY_STATUS.toLowerCase()) {
          result = keyStatusRaw;
        } else if (to.toLowerCase() === PQC_VERIFY.toLowerCase()) {
          const [pk, signature, signedMessage] = abi.decode(
            ["bytes", "bytes", "bytes"],
            `0x${data.slice(10)}`,
          );
          const accepted = mldsa87.verify(
            getBytes(pk),
            getBytes(signedMessage),
            getBytes(signature),
          );
          result = `0x${word(accepted ? 1 : 0)}`;
        } else {
          result = "0x";
        }
      } else {
        throw new Error(`unexpected method ${method}`);
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end(String(error));
    }
  });
});

let rpcUrl;
let tmpDir;
let validFile;
let wrongKeyFile;
let malformedFile;
let shortFile;
let longFile;
let secretKeyFile;

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  rpcUrl = `http://127.0.0.1:${server.address().port}`;

  tmpDir = await mkdtemp(path.join(os.tmpdir(), "par-pqc-authorize-"));
  validFile = path.join(tmpDir, "valid.sig");
  wrongKeyFile = path.join(tmpDir, "wrong-key.sig");
  malformedFile = path.join(tmpDir, "malformed.sig");
  shortFile = path.join(tmpDir, "short.sig");
  longFile = path.join(tmpDir, "long.sig");
  secretKeyFile = path.join(tmpDir, "secret.dilithium");

  await writeFile(validFile, hexlify(validSignature));
  const otherKey = mldsa87.keygen();
  await writeFile(wrongKeyFile, hexlify(mldsa87.sign(otherKey.secretKey, message)));
  await writeFile(malformedFile, "not-hex-signature-data");
  await writeFile(shortFile, "ab".repeat(ML_DSA_87_SIGNATURE_BYTES - 1));
  await writeFile(longFile, "ab".repeat(ML_DSA_87_SIGNATURE_BYTES + 1));
  await writeFile(secretKeyFile, Buffer.from(secretKey).toString("hex"), { mode: 0o600 });
});

after(() => {
  server.close();
});

function run(args) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [path.join(root, "authorize.mjs"), "--issuer", issuer, "--rpc", rpcUrl, ...args],
      { cwd: root },
      (error, stdout, stderr) => {
        resolve({ code: error?.code ?? 0, stdout, stderr });
      },
    );
  });
}

function parseReport(result) {
  assert.equal(result.stderr, "", result.stderr);
  return JSON.parse(result.stdout);
}

test("accepts a valid external signature and reports signingSource external", async () => {
  const result = await run(["--signature-file", validFile, "--skip-live"]);
  const report = parseReport(result);

  assert.equal(result.code, 0);
  assert.equal(report.signingSource, "external");
  assert.equal(report.message.byteLength, 288);
  assert.equal(report.message.keccak256, keccak256(buildMessage(COUPON_FIXTURE).message));
  assert.equal(report.signature.byteLength, ML_DSA_87_SIGNATURE_BYTES);
  assert.equal(report.signature.hex, hexlify(validSignature));
  assert.deepEqual(report.localChecks, {
    validSignature: true,
    wrongKeyRejected: true,
    tamperedMessageRejected: true,
  });
  assert.equal(report.issuer.keyStatus.publicKeySha256, publicKeyFingerprint(publicKey));
  assert.equal(report.safety.privateKeyRead, false);
  assert.equal(report.pqcVerifyCall.to, PQC_VERIFY);
});

test("rejects a signature that does not verify", async () => {
  const bad = Uint8Array.from({ length: ML_DSA_87_SIGNATURE_BYTES }, (_, index) => index % 251);
  const file = path.join(tmpDir, "invalid.sig");
  await writeFile(file, hexlify(bad));

  const result = await run(["--signature-file", file, "--skip-live"]);
  const report = parseReport(result);

  assert.equal(result.code, 1);
  assert.equal(report.localChecks.validSignature, false);
});

test("rejects a signature made by a different key", async () => {
  const result = await run(["--signature-file", wrongKeyFile, "--skip-live"]);
  const report = parseReport(result);

  assert.equal(result.code, 1);
  assert.equal(report.localChecks.validSignature, false);
});

test("rejects a signature file that is not hex", async () => {
  const result = await run(["--signature-file", malformedFile, "--skip-live"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /hex/);
});

test("rejects a signature file that is too short", async () => {
  const result = await run(["--signature-file", shortFile, "--skip-live"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, new RegExp(`exactly ${ML_DSA_87_SIGNATURE_BYTES} bytes, got ${ML_DSA_87_SIGNATURE_BYTES - 1}`));
});

test("rejects a signature file that is too long", async () => {
  const result = await run(["--signature-file", longFile, "--skip-live"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, new RegExp(`exactly ${ML_DSA_87_SIGNATURE_BYTES} bytes, got ${ML_DSA_87_SIGNATURE_BYTES + 1}`));
});

test("rejects passing both --key-file and --signature-file", async () => {
  const result = await run(["--key-file", secretKeyFile, "--signature-file", validFile]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /exactly one of --key-file or --signature-file/);
});

test("requires one of --key-file or --signature-file", async () => {
  const result = await run([]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /exactly one of --key-file or --signature-file/);
});

test("still signs locally with --key-file", async () => {
  const result = await run(["--key-file", secretKeyFile, "--skip-live"]);
  const report = parseReport(result);

  assert.equal(result.code, 0);
  assert.equal(report.signingSource, "local-key-file");
  assert.equal(report.safety.privateKeyRead, true);
  assert.equal(report.localChecks.validSignature, true);
  assert.equal(report.signature.byteLength, ML_DSA_87_SIGNATURE_BYTES);
});

test("runs the live pqcVerify checks for an external signature", async () => {
  const result = await run(["--signature-file", validFile]);
  const report = parseReport(result);

  assert.equal(result.code, 0);
  assert.equal(report.livePrecompile.checked, true);
  assert.equal(report.livePrecompile.validSignatureReturned, true);
  assert.equal(report.livePrecompile.wrongKeyReturned, false);
  assert.equal(report.livePrecompile.tamperedMessageReturned, false);
});

test("the mocked keyStatus matches the PAR decoder and key length", () => {
  assert.equal(keyStatusRaw.length, 2 + 2752 * 2);
  assert.equal(publicKey.length, 2592);
  assert.equal(Buffer.from(secretKey).length, ML_DSA_87_SECRET_KEY_BYTES);
});
