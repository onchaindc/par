# Registered issuer setup (QoreChain testnet)

This is the preparation procedure for PAR's first real registered-issuer
authorization test on `qorechain-diana` (EVM chain ID **9800**). It creates a
dedicated **PQC issuer** account and registers an ML-DSA-87 key **with a proof
of possession**, which PAR requires.

That account is only the signing identity. It holds no `ISSUER_ROLE` and never
sends the servicing transaction. The **operational EVM issuer** — a separate
account that submits `finalizeCoupon` / `declareRedemption`, holds
`DEFAULT_ADMIN_ROLE` and `ISSUER_ROLE`, and pays gas — must be a different
address. `BondServicing` rejects a constructor where the two are equal, and the
signed 288-byte message binds the PQC identity.

Nothing in this procedure has been executed by the repository tooling. Every
transaction below is listed for review only; wait for explicit authorization
before broadcasting anything. Do not use mainnet (`qorechain-vladi`) or any
mainnet key.

## Facts verified against QoreChain source and documentation

- Registration message: `/qorechain.pqc.v1.MsgRegisterPQCKeyV2`
  ([proto definition](https://github.com/qorechain/qorechain-core/blob/main/proto/qorechain/pqc/v1/tx.proto)).
- Fields: `sender` (1, `qor1` account), `public_key` (2, 2,592-byte ML-DSA-87
  key), `algorithm_id` (3, `1`), `ecdsa_pubkey` (4, 33-byte compressed
  secp256k1 key), `key_type` (5, `hybrid`), `proof_of_possession` (6, 4,627-byte
  ML-DSA-87 signature).
- Proof-of-possession bytes are exactly:

  ```text
  qorechain-pqc-pop-v1|<chain-id>|<algorithm-id>|<qor1-account>|<lowercase-hex-public-key>
  ```

  signed as a raw message with ML-DSA-87 (no prehash, empty context).
- The proof is optional on chain, but **PAR will reject a key without it**:
  `PqcIssuerAuthorizer` requires `possessionProven == true`.
- The key file written by `qorechaind tx pqc gen-key` (and by this repository's
  `keygen.mjs`) is hex(secretKey), mode `0600`, under
  `<home>/pqc/<name>.dilithium`. It is **not encrypted**. Back it up like a
  mnemonic.
- A first registration is the one native-lane message an account with no key
  may sign with its classical key alone. Since testnet v3.2.8, the first
  transaction of a fresh account must be this registration. Register before
  sending anything else from the new account.
- The EVM precompile `pqcKeyStatus` is keyed by the 20-byte EVM address. Use an
  `eth_secp256k1` (coin type 60) account so its `qor1…` and `0x…` forms are the
  same identity.

## 1. Create a dedicated testnet issuer account

Use the official release `qorechaind` from
[download.qore.host](https://download.qore.host/); a community build cannot
generate or use ML-DSA keys.

```bash
qorechaind keys add par-issuer-test \
  --key-type eth_secp256k1 \
  --coin-type 60 \
  --keyring-backend file
```

The command prints a new mnemonic. Capture it offline, never paste it into a
repository, chat, ticket or shell history, and never use a production phrase.
This account is dedicated to PAR's testnet issuer role.

Show its native and EVM forms:

```bash
qorechaind keys show par-issuer-test -a --keyring-backend file
# qor1...
qorechaind debug addr <the qor1 address>
# prints the same 20-byte identity as 0x...
```

Both forms spend the same balance. Fund the account from the
[testnet faucet](https://docs.qorechain.io/dashboard/faucet) with test QOR only.
Budget at least `90,000 uqor` for the registration fee (use `600,000` gas) plus
later contract-call fees; test QOR has no value. Do not send anything from this
account before registration.

## 2. Generate the issuer's ML-DSA-87 key

Use one of these two equivalent official-format generators. Do not reuse the
ephemeral keys from `sign.mjs`, `verify-live.mjs`, or `PAR_PQC_TEST_SEED`.

Official CLI:

```bash
qorechaind tx pqc gen-key par-issuer-mldsa
# prints public_key_hex, writes ~/.qorechaind/pqc/par-issuer-mldsa.dilithium (0600)
```

PAR tool (same file format, refuses to write in the repository or overwrite):

```bash
cd tools/pqc-sign
npm install
npm run keygen -- --name par-issuer-mldsa
```

The PAR command prints only the public key, its length and a SHA-256
fingerprint. It never prints the secret. It writes:

```text
~/.qorechaind/pqc/par-issuer-mldsa.dilithium
```

Back up this file and keep it offline. A randomly generated key file has no
mnemonic-derived recovery path; if recovery from the account mnemonic is a
requirement, use QoreChain's canonical `recover-key`/SDK derivation instead. A
key file that is lost or overwritten cannot be recovered from the chain.

## 3. Prepare and verify the proof of possession

Get the account's 33-byte compressed secp256k1 public key from the keyring. The
`pubkey.key` field is base64:

```bash
qorechaind keys show par-issuer-test --output json --keyring-backend file \
  > /tmp/par-issuer-public.json

node -e '
  const j = require("/tmp/par-issuer-public.json");
  const p = typeof j.pubkey === "string" ? JSON.parse(j.pubkey) : j.pubkey;
  process.stdout.write(Buffer.from(p.key, "base64").toString("hex") + "\n");
'
# 33 bytes of hex, starting 02 or 03
```

Then prepare the registration message without broadcasting:

```bash
cd tools/pqc-sign
npm run register -- \
  --account <0x EVM address or qor1 address> \
  --public-key <2592-byte public key hex> \
  --ecdsa-pubkey <33-byte compressed secp256k1 public key hex> \
  --key-file ~/.qorechaind/pqc/par-issuer-mldsa.dilithium \
  --out /tmp/par-issuer-registration.json
```

Checks performed before it writes anything:

- the account is a 20-byte `qor1`/`0x` identity and both forms match;
- the PQC public key is exactly 2,592 bytes and not degenerate;
- the secp256k1 public key is compressed and derives to the issuer address;
- the key file is a regular `0600` file containing a 4,896-byte ML-DSA-87
  secret key;
- the proof is 4,627 bytes and verifies against the supplied public key;
- the chain is `qorechain-diana`; mainnet is refused.

The output contains the exact proto-JSON message and hex mirrors, including the
proof-of-possession string. It contains no secret key and performs no network
request. The `--out` file is public data; keep it outside the repository.

## 4. Build the unsigned registration transaction

The official CLI attaches the same proof automatically when given `--pqc-key`.
Use `--generate-only` so this step does not broadcast:

```bash
qorechaind tx pqc register-key-v2 dilithium5 <public_key_hex> hybrid \
  --pqc-key par-issuer-mldsa \
  --from par-issuer-test \
  --keyring-backend file \
  --chain-id qorechain-diana \
  --node https://rpc-testnet.qore.host \
  --gas 600000 \
  --fees 90000uqor \
  --generate-only \
  > /tmp/par-issuer-registration-unsigned.json
```

Review the file. It should contain `/qorechain.pqc.v1.MsgRegisterPQCKeyV2`,
`algorithm_id: 1`, `key_type: "hybrid"` and a 4,627-byte
`proof_of_possession`. Registration with a proof has used about 299,233 gas in
QoreChain's published testnet test under a 600,000 limit.

If `--generate-only` is unavailable or your CLI version differs, stop rather
than inventing a transaction format; use the exact command above from the
official v3.2.8 release.

## 5. Broadcast only after explicit authorization

This is the only registration step that sends a transaction. **Do not run it in
this milestone.** After the user explicitly authorizes the registration, repeat
the same command without `--generate-only` and with `-y`:

```bash
qorechaind tx pqc register-key-v2 dilithium5 <public_key_hex> hybrid \
  --pqc-key par-issuer-mldsa \
  --from par-issuer-test \
  --keyring-backend file \
  --chain-id qorechain-diana \
  --node https://rpc-testnet.qore.host \
  --gas 600000 \
  --fees 90000uqor \
  -y
```

Do not send a transfer first. On testnet v3.2.8 a fresh account's first
transaction must be the registration.

## 6. Verify the registration before using the issuer

Native query:

```bash
qorechaind query pqc account <qor1 address> --output json \
  --node https://rpc-testnet.qore.host
```

REST cross-check:

```bash
curl -s https://api-testnet.qore.host/qorechain/pqc/v1/account/<qor1-address>
```

PAR's authoritative EVM check:

```bash
node tools/preflight/preflight.mjs <0x-address>
```

The preflight exits `0` only when all of these are true:

| Field | Required |
|---|---|
| `registered` | `true` |
| `algorithmId` | `1` (ML-DSA-87) |
| `pubkeyLength` | `2592` |
| `possessionProven` | `true` |
| response length / offset | exactly `2,752` bytes / `0x80` |
| `pqcVerify` | active |

Anything else exits `1` and prints the failed checks. A zero-address probe
without an issuer argument is labelled as synthetic and is not an issuer
validation.

## 7. EVM authorization window (later, not part of registration)

Registration alone does not admit EVM transactions. Before deploying PAR or
calling `finalizeCoupon` on testnet, the issuer must open a bounded EVM
authorization window from the native lane. That is a **broadcast** and is
outside this milestone:

```bash
qorechaind tx pqc open-evm-window 7200 20 1000qor \
  --from par-issuer-test \
  --keyring-backend file \
  --chain-id qorechain-diana \
  --node https://rpc-testnet.qore.host \
  --gas 400000 --fees 60000uqor \
  --generate-only > /tmp/par-evm-window.json

qorechaind tx pqc cosign /tmp/par-evm-window.json \
  --from par-issuer-test --pqc-key par-issuer-mldsa \
  --chain-id qorechain-diana
# cosign broadcasts; do not run until authorized
```

Check it with `qorechaind query pqc evm-window <qor1>` and open it before the
EVM transaction that needs it.

## 8. Authorize a PAR action (read-only until a transaction is authorized)

After registration is confirmed:

```bash
cd tools/pqc-sign
npm run authorize -- \
  --issuer <0x registered issuer> \
  --key-file ~/.qorechaind/pqc/par-issuer-mldsa.dilithium
```

Without `--servicing`, this uses the Solidity-matched coupon fixture and is a
local integration check only. With a deployed contract:

```bash
npm run authorize -- \
  --issuer <0x registered issuer> \
  --key-file ~/.qorechaind/pqc/par-issuer-mldsa.dilithium \
  --servicing <0x BondServicing> \
  --period-id 0 \
  --deadline 1893456000
```

The script reads `couponFinalizationMessage(periodId, deadline)` by `eth_call`,
signs the exact 288-byte raw bytes, verifies locally, prepares the `pqcVerify`
calldata, and checks valid / wrong-key / tampered-message results against the
live precompile. It prints no secret and never builds or broadcasts a
transaction.

If the issuer key is held on a separate signer host, produce the signature
there and hand off only the 4,627-byte signature file:

```bash
# on the isolated signer (key file at mode 0600, outside any checkout)
node authorize.mjs --issuer <0x registered issuer> \
  --key-file /secure/par-signer/pqc/par-issuer.dilithium \
  --servicing <0x BondServicing> --period-id 0 --deadline 1893456000 \
  > authorization.json

# on the relaying host: no key material, signature is re-verified locally
node authorize.mjs --issuer <0x registered issuer> \
  --signature-file /secure/par-signer/coupon.sig \
  --servicing <0x BondServicing> --period-id 0 --deadline 1893456000
```

`--key-file` and `--signature-file` are mutually exclusive; the external form
reports `signingSource: "external"`, sets `privateKeyRead: false`, requires
exactly 4,627 signature bytes, and fails unless the signature verifies against
the public key in `pqcKeyStatus`. See
[`tools/pqc-sign/README.md`](../tools/pqc-sign/README.md) for the full workflow.

The resulting signature is submitted from the operational EVM issuer, not from
the registered PQC identity. The PQC identity needs its registered key and, for
the signing account itself, an EVM authorization window only if it also sends
transactions; the operational account needs its own coin-60 registration and
window for the EVM lane.

## Remaining blockers

1. No funded `par-issuer-test` account exists and no registration transaction
   has been broadcast; explicit authorization is required.
2. No `BondServicing` contract is deployed, so the exact on-chain message helper
   is not yet available. `authorize.mjs` uses the pinned fixture until then.
3. The issuer's EVM authorization window must still be opened (native-lane
   hybrid transaction) before any deployment or `finalizeCoupon` call.
4. Registration needs the official full `qorechaind` release; the community
   build's `gen-key`/`cosign` are stubs.
5. Mainnet remains out of scope and unresolved for `pqcKeyStatus` availability.
6. The PQC key file is unencrypted by design of the CLI flow. `authorize.mjs`
   now accepts an isolated signer's signature (`--signature-file`), but no HSM
   or remote-signing integration exists; custody is host-level and procedural.
