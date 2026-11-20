// Prepare and verify the exact QoreChain MsgRegisterPQCKeyV2 payload.
//
// This tool does not build a transaction, connect a wallet or broadcast
// anything. It reads a local PQC key file, validates the account/classical-key
// binding, signs the official proof-of-possession string and prints the
// registration message in proto-JSON form (plus hex details for inspection).
//
// It refuses anything but the qorechain-diana testnet.
//
// Usage:
//   npm run register -- \
//     --account 0xYourIssuerAddress \
//     --public-key <2592-byte pubkey hex> \
//     --ecdsa-pubkey <33-byte compressed secp256k1 pubkey hex> \
//     --key-file ~/.qorechaind/pqc/par-issuer-mldsa.dilithium \
//     --out /secure/par-issuer-registration.json

import fs from "node:fs";
import path from "node:path";
import { mldsa87 } from "@qorechain/pqc";
import {
  ML_DSA_87,
  ML_DSA_87_PUBLIC_KEY_BYTES,
  ML_DSA_87_SIGNATURE_BYTES,
  TESTNET,
  assertOutsideRepository,
  isHex,
  parseAccount,
  proofOfPossessionMessage,
  publicKeyFingerprint,
  readSecretKeyFile,
  strip0x,
  validateClassicalPubkey,
} from "./common.mjs";

const TYPE_URL = "/qorechain.pqc.v1.MsgRegisterPQCKeyV2";

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
  console.log(`Usage: node register.mjs --account <0x|qor1> --public-key <hex> \\
  --ecdsa-pubkey <33-byte hex> --key-file <path> [--out <file>]

Validates a dedicated qorechain-diana issuer account, signs the official
qorechain-pqc-pop-v1 proof of possession, and prints the MsgRegisterPQCKeyV2
message. No transaction is built or broadcast.`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const chainId = args["chain-id"] ?? TESTNET.chainId;
  if (chainId !== TESTNET.chainId) {
    throw new Error(`refusing chain ${chainId}: only ${TESTNET.chainId} (EVM ${TESTNET.evmChainId}) is supported`);
  }
  if (!args.account) throw new Error("--account is required");
  if (!args["public-key"]) throw new Error("--public-key is required");
  if (!args["ecdsa-pubkey"]) throw new Error("--ecdsa-pubkey is required");
  if (!args["key-file"]) throw new Error("--key-file is required");

  const account = parseAccount(args.account);
  const publicKeyHex = strip0x(args["public-key"]).toLowerCase();
  if (!isHex(publicKeyHex) || publicKeyHex.length !== ML_DSA_87_PUBLIC_KEY_BYTES * 2) {
    throw new Error(`--public-key must be ${ML_DSA_87_PUBLIC_KEY_BYTES} bytes of hex`);
  }
  const publicKey = Uint8Array.from(Buffer.from(publicKeyHex, "hex"));

  // A public key whose t1 part is all zero is forgeable; the chain refuses it.
  if (publicKey.slice(32).every((byte) => byte === 0)) {
    throw new Error("public key has an all-zero t1 part and would be forgeable");
  }

  const ecdsaPubkeyHex = validateClassicalPubkey(args["ecdsa-pubkey"], account.evmAddress);
  const secretKey = readSecretKeyFile(args["key-file"]);

  const proofMessage = proofOfPossessionMessage({
    chainId,
    algorithmId: ML_DSA_87,
    account: account.qorAddress,
    publicKey,
  });
  const proof = mldsa87.sign(secretKey, proofMessage);
  if (proof.length !== ML_DSA_87_SIGNATURE_BYTES) {
    throw new Error(`unexpected proof length ${proof.length}`);
  }
  if (!mldsa87.verify(publicKey, proofMessage, proof)) {
    throw new Error("the local PQC key file does not match --public-key; refusing to prepare registration");
  }

  const protoMessage = {
    "@type": TYPE_URL,
    sender: account.qorAddress,
    public_key: Buffer.from(publicKey).toString("base64"),
    algorithm_id: ML_DSA_87,
    ecdsa_pubkey: Buffer.from(ecdsaPubkeyHex, "hex").toString("base64"),
    key_type: "hybrid",
    proof_of_possession: Buffer.from(proof).toString("base64"),
  };

  const report = {
    network: {
      chainId,
      evmChainId: String(TESTNET.evmChainId),
      evmRpc: TESTNET.rpc,
    },
    account: {
      evmAddress: account.evmAddress,
      qorAddress: account.qorAddress,
      sameTwentyByteIdentity: true,
    },
    registration: {
      typeUrl: TYPE_URL,
      message: protoMessage,
      hex: {
        sender: `0x${Buffer.from(account.bytes).toString("hex")}`,
        public_key: publicKeyHex,
        algorithm_id: ML_DSA_87,
        ecdsa_pubkey: ecdsaPubkeyHex,
        key_type: "hybrid",
        proof_of_possession: Buffer.from(proof).toString("hex"),
      },
      publicKeyLength: publicKey.length,
      publicKeySha256: publicKeyFingerprint(publicKey),
      proofMessage: proofMessage.toString("utf8"),
      proofLength: proof.length,
      proofVerifiedLocally: true,
    },
    safety: {
      secretKeyPrinted: false,
      transactionBuilt: false,
      walletConnected: false,
      broadcast: false,
      networkUsed: false,
    },
    next:
      "Review this payload. Registration itself is a native-lane MsgRegisterPQCKeyV2 transaction; execute it only with explicit authorization, then verify with tools/preflight/preflight.mjs <0x-address>.",
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    const output = assertOutsideRepository(args.out);
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
    fs.writeFileSync(output, json, { flag: "wx", mode: 0o644 });
    console.log(
      JSON.stringify(
        {
          written: output,
          account: report.account,
          registration: {
            typeUrl: TYPE_URL,
            publicKeyLength: report.registration.publicKeyLength,
            proofLength: report.registration.proofLength,
            proofVerifiedLocally: true,
          },
          safety: report.safety,
        },
        null,
        2,
      ),
    );
  } else {
    process.stdout.write(json);
  }
} catch (error) {
  console.error(`register: ${error.message}`);
  process.exitCode = 1;
}
