// Generate a dedicated ML-DSA-87 key in the official qorechaind key format.
//
// The file contains hex(secretKey) with mode 0600 under
// <home>/pqc/<name>.dilithium, exactly as `qorechaind tx pqc gen-key` writes it.
// The secret is never printed to stdout/stderr and is never written inside the
// repository. This tool does not register the key or touch the network.
//
// Usage:
//   npm run keygen -- --name par-issuer-mldsa
//   npm run keygen -- --name par-issuer-mldsa --home /secure/qorechaind
//
// Back up the key file like a mnemonic. It is unencrypted, as required by the
// qorechaind --pqc-key flow.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mldsa87 } from "@qorechain/pqc";
import {
  ML_DSA_87_PUBLIC_KEY_BYTES,
  ML_DSA_87_SECRET_KEY_BYTES,
  assertOutsideRepository,
  isHex,
  publicKeyFingerprint,
} from "./common.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
    args[key] = value;
    i += 1;
  }
  return args;
}

function usage() {
  console.log(`Usage: node keygen.mjs --name <name> [--home <qorechaind-home> | --out <file>]

Generates an ML-DSA-87 keypair and writes hex(secretKey) with mode 0600.
Defaults to <home>/pqc/<name>.dilithium, where <home> is ~/.qorechaind.
The secret is never printed. The public key is printed for registration.
Refuses to write inside this repository or to overwrite an existing file.`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  if (!args.name && !args.out) throw new Error("--name is required (or pass --out)");
  if (args.name && !/^[A-Za-z0-9._-]+$/.test(args.name)) {
    throw new Error("--name may contain only letters, digits, dot, underscore and hyphen");
  }

  const home = args.home ?? process.env.QORECHAIND_HOME ?? path.join(os.homedir(), ".qorechaind");
  const target = assertOutsideRepository(
    args.out ?? path.join(home, "pqc", `${args.name}.dilithium`),
  );

  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, "", { flag: "wx", mode: 0o600 }); // reserve exclusively
  // The reservation file is empty at this point; if keygen fails, remove it.
  let keypair;
  try {
    keypair = mldsa87.keygen();
    if (keypair.publicKey.length !== ML_DSA_87_PUBLIC_KEY_BYTES) {
      throw new Error(`unexpected public key length ${keypair.publicKey.length}`);
    }
    if (keypair.secretKey.length !== ML_DSA_87_SECRET_KEY_BYTES) {
      throw new Error(`unexpected secret key length ${keypair.secretKey.length}`);
    }
    const secretHex = Buffer.from(keypair.secretKey).toString("hex");
    if (!isHex(secretHex)) throw new Error("internal key encoding error");
    fs.writeFileSync(target, secretHex, { mode: 0o600 });
  } catch (error) {
    fs.rmSync(target, { force: true });
    throw error;
  }

  const stat = fs.statSync(target);
  if ((stat.mode & 0o777) !== 0o600) throw new Error("failed to set key file mode 0600");

  console.log(
    JSON.stringify(
      {
        algorithm: "ML-DSA-87 (FIPS 204)",
        keyFile: target,
        keyFileMode: "0600",
        publicKeyHex: Buffer.from(keypair.publicKey).toString("hex"),
        publicKeyLength: keypair.publicKey.length,
        publicKeySha256: publicKeyFingerprint(keypair.publicKey),
        secretKeyPrinted: false,
        networkUsed: false,
        note:
          "Keep this file and its backup offline. It is not a disposable test key and must not be committed.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(`keygen: ${error.message}`);
  process.exitCode = 1;
}
