// Read-only registered-issuer authorization integration for PAR.
//
// Requires a registered, possession-proven ML-DSA-87 key on qorechain-diana.
// --issuer is the PQC signing identity, which is not the operational EVM issuer
// that submits the transaction: any account holding ISSUER_ROLE can relay the
// signature. The authorization message binds that PQC identity explicitly.
// The tool reads the exact message from a deployed PAR servicing contract when
// one is given, otherwise it uses the Solidity-matched local fixture. It signs
// the raw bytes with the local PQC key, verifies locally, prepares the pqcVerify
// calldata and checks valid/wrong-key/tampered-message behaviour against the
// live precompile with eth_call. It NEVER builds or broadcasts a transaction,
// connects a wallet or prints the secret key.
//
// Usage:
//   npm run authorize -- \
//     --issuer 0xYourRegisteredIssuer \
//     --key-file ~/.qorechaind/pqc/par-issuer-mldsa.dilithium
//
//   npm run authorize -- --issuer 0x... --key-file ... \
//     --servicing 0xDeployedBondServicing --period-id 0 --deadline 1893456000
//
// Without --servicing the local coupon fixture is used. That fixture is for
// integration testing only; a signature over it is not valid for a deployed
// contract with different addresses or parameters.

import { Interface, getAddress, getBytes, hexlify, keccak256 } from "ethers";
import { mldsa87 } from "@qorechain/pqc";
import {
  PQC_KEY_STATUS,
  PQC_VERIFY,
  TESTNET,
  assertTestnet,
  decodeBool,
  decodeKeyStatus,
  encodeKeyStatusCalldata,
  encodeVerifyCalldata,
  ethCall,
  parseAccount,
  publicKeyFingerprint,
  readSecretKeyFile,
  rpc,
} from "./common.mjs";
import { COUPON_FIXTURE, buildMessage } from "./fixture.mjs";

const COUPON_MESSAGE_ABI = new Interface([
  "function couponFinalizationMessage(uint256 periodId, uint64 deadline) view returns (bytes)",
]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--skip-live") {
      args["skip-live"] = true;
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
  console.log(`Usage: node authorize.mjs --issuer <0x> --key-file <path> [options]

  --rpc <url>          EVM RPC (default ${TESTNET.rpc})
  --servicing <0x>     deployed BondServicing; reads couponFinalizationMessage
  --period-id <uint>   required with --servicing
  --deadline <uint64>  required with --servicing
  --skip-live          skip the read-only pqcVerify eth_calls

The tool refuses non-testnet chains and unregistered/unproven issuer keys.
It signs and verifies locally, then prepares pqcVerify calldata. No broadcast.`);
}

function uint64(value, name) {
  if (!/^[0-9]+$/.test(value ?? "")) throw new Error(`${name} must be an unsigned integer`);
  const parsed = BigInt(value);
  if (parsed > (1n << 64n) - 1n) throw new Error(`${name} does not fit in uint64`);
  return parsed;
}

async function readContractMessage(rpcUrl, servicing, periodId, deadline) {
  const data = COUPON_MESSAGE_ABI.encodeFunctionData("couponFinalizationMessage", [periodId, deadline]);
  const raw = await ethCall(rpcUrl, servicing, data);
  if (raw === "0x") throw new Error("couponFinalizationMessage returned no data");
  const [messageHex] = COUPON_MESSAGE_ABI.decodeFunctionResult("couponFinalizationMessage", raw);
  return getBytes(messageHex);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  if (!args.issuer) throw new Error("--issuer is required");
  if (!args["key-file"]) throw new Error("--key-file is required");

  const rpcUrl = args.rpc ?? TESTNET.rpc;
  const issuer = parseAccount(args.issuer);
  if (issuer.evmAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error("issuer must not be the zero address");
  }

  const chainId = await rpc(rpcUrl, "eth_chainId", []);
  assertTestnet(chainId);

  const keyStatusRaw = await ethCall(rpcUrl, PQC_KEY_STATUS, encodeKeyStatusCalldata(issuer.evmAddress));
  const keyStatus = decodeKeyStatus(keyStatusRaw);
  if (!keyStatus.valid) {
    throw new Error(`issuer is not ready: ${keyStatus.reasons.join("; ")}`);
  }

  let message;
  let messageSource;
  if (args.servicing) {
    if (args["period-id"] === undefined) throw new Error("--period-id is required with --servicing");
    if (args.deadline === undefined) throw new Error("--deadline is required with --servicing");
    const servicing = getAddress(args.servicing);
    const periodId = uint64(args["period-id"], "--period-id");
    const deadline = uint64(args.deadline, "--deadline");
    message = await readContractMessage(rpcUrl, servicing, periodId, deadline);
    messageSource = `deployed contract ${servicing} (couponFinalizationMessage)`;
  } else {
    message = getBytes(buildMessage(COUPON_FIXTURE).message);
    messageSource =
      "solidity-matched couponFinalization fixture (sample addresses; not valid for a deployed contract)";
  }
  if (message.length !== 288) throw new Error(`unexpected PAR message length ${message.length}, expected 288`);

  const secretKey = readSecretKeyFile(args["key-file"]);
  const signature = mldsa87.sign(secretKey, message);
  const locallyVerified = mldsa87.verify(keyStatus.pubkey, message, signature);

  // Negative control: a different key signing the same message must fail.
  const wrongKey = mldsa87.keygen();
  const wrongSignature = mldsa87.sign(wrongKey.secretKey, message);
  const wrongKeyAccepted = mldsa87.verify(keyStatus.pubkey, message, wrongSignature);

  // Negative control: one-bit change to the message must invalidate the signature.
  const tamperedMessage = Uint8Array.from(message);
  tamperedMessage[tamperedMessage.length - 1] ^= 0x01;
  const tamperedAccepted = mldsa87.verify(keyStatus.pubkey, tamperedMessage, signature);

  const calldata = encodeVerifyCalldata(keyStatus.pubkey, signature, message);
  let live = { checked: false, reason: "skipped with --skip-live" };
  if (!args["skip-live"]) {
    const [validRaw, wrongRaw, tamperedRaw] = await Promise.all([
      ethCall(rpcUrl, PQC_VERIFY, calldata),
      ethCall(rpcUrl, PQC_VERIFY, encodeVerifyCalldata(keyStatus.pubkey, wrongSignature, message)),
      ethCall(rpcUrl, PQC_VERIFY, encodeVerifyCalldata(keyStatus.pubkey, signature, tamperedMessage)),
    ]);
    live = {
      checked: true,
      validSignatureReturned: decodeBool(validRaw),
      wrongKeyReturned: decodeBool(wrongRaw),
      tamperedMessageReturned: decodeBool(tamperedRaw),
      validSignatureRaw: validRaw,
      wrongKeyRaw: wrongRaw,
      tamperedMessageRaw: tamperedRaw,
    };
  }

  const report = {
    network: {
      rpc: rpcUrl,
      chainId: "qorechain-diana",
      evmChainId: Number(BigInt(chainId)),
    },
    issuer: {
      evmAddress: issuer.evmAddress,
      qorAddress: issuer.qorAddress,
      keyStatus: {
        registered: keyStatus.registered,
        algorithmId: keyStatus.algorithmId,
        publicKeyLength: keyStatus.pubkeyLength,
        possessionProven: keyStatus.possessionProven,
        layout: keyStatus.layout,
        publicKeySha256: publicKeyFingerprint(keyStatus.pubkey),
      },
    },
    message: {
      source: messageSource,
      byteLength: message.length,
      keccak256: keccak256(message),
      hex: hexlify(message),
    },
    signature: {
      byteLength: signature.length,
      hex: hexlify(signature),
    },
    localChecks: {
      validSignature: locallyVerified,
      wrongKeyRejected: wrongKeyAccepted === false,
      tamperedMessageRejected: tamperedAccepted === false,
    },
    pqcVerifyCall: {
      to: PQC_VERIFY,
      calldata,
      ethCall: { to: PQC_VERIFY, data: calldata },
    },
    livePrecompile: live,
    safety: {
      secretKeyPrinted: false,
      transactionBuilt: false,
      transactionBroadcast: false,
      walletConnected: false,
      mainnetUsed: false,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  const localOk = locallyVerified && wrongKeyAccepted === false && tamperedAccepted === false;
  const liveOk =
    args["skip-live"] ||
    (live.validSignatureReturned === true &&
      live.wrongKeyReturned === false &&
      live.tamperedMessageReturned === false);
  if (!localOk || !liveOk) process.exitCode = 1;
} catch (error) {
  console.error(`authorize: ${error.message}`);
  process.exitCode = 1;
}
