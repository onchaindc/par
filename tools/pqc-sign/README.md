# PAR PQC signing and issuer tooling

Local tooling for PAR's ML-DSA-87 authorization. All network access here is
read-only (`eth_call`/JSON-RPC queries); nothing in this directory builds,
signs or broadcasts a transaction, connects a wallet, or prints a secret key.

```bash
npm install
```

## Offline message/signature check

```bash
npm start
```

Builds the coupon-finalization and redemption messages used by
[`contracts/lib/AuthorizationMessage.sol`](../../contracts/lib/AuthorizationMessage.sol),
checks their hashes against
[`test/AuthorizationMessage.t.sol`](../../test/AuthorizationMessage.t.sol), signs
them with `@qorechain/pqc`, verifies locally, and rejects a one-bit change. It
generates an ephemeral key unless `PAR_PQC_TEST_SEED` (32 bytes of hex) is set.
That seed is a **test** key only.

## Generate a dedicated issuer key

```bash
npm run keygen -- --name par-issuer-mldsa
```

Writes `~/.qorechaind/pqc/par-issuer-mldsa.dilithium` in the official
`qorechaind` format: hex(secretKey), mode `0600`, never inside the repository.
It prints only the public key, length and SHA-256 fingerprint. It never prints
the secret and refuses to overwrite an existing key. Use `--home` or `--out` to
choose a different location outside the repository.

Do not use the ephemeral keys from `start`/`verify-live` as issuer keys.

## Prepare a registration proof

```bash
npm run register -- \
  --account <0x or qor1> \
  --public-key <2592-byte hex> \
  --ecdsa-pubkey <33-byte compressed secp256k1 hex> \
  --key-file ~/.qorechaind/pqc/par-issuer-mldsa.dilithium \
  --out /tmp/par-issuer-registration.json
```

Validates the unified `qor1`/`0x` account, the classical key binding, the
2,592-byte key and the `0600` key file; signs the exact official proof:

```text
qorechain-pqc-pop-v1|qorechain-diana|1|<qor1>|<lowercase pubkey hex>
```

and prints the `MsgRegisterPQCKeyV2` proto-JSON plus hex details. It refuses
mainnet, refuses to write generated data in the repository, and performs no
network request. Registration itself remains a native-lane transaction; see
[`docs/issuer-setup.md`](../../docs/issuer-setup.md).

## Authorize a registered issuer action

Sign locally with the key file:

```bash
npm run authorize -- \
  --issuer <0x registered PQC identity> \
  --key-file ~/.qorechaind/pqc/par-issuer-mldsa.dilithium
```

Or verify a signature produced elsewhere (no key material is read):

```bash
npm run authorize -- \
  --issuer <0x registered PQC identity> \
  --signature-file /secure/par-signer/coupon.sig
```

`--issuer` is the registered PQC identity that signs, not the operational EVM
account that submits the transaction. The two are separate: the operational
account holds `ISSUER_ROLE` and relays the signature, while the PQC identity
holds no role. The signed 288-byte message names the PQC identity explicitly.

`--key-file` and `--signature-file` are mutually exclusive. A signature file
must hold exactly 4,627 bytes of ML-DSA-87 signature as hex (an optional `0x`
prefix and whitespace are accepted). It is always verified against the public
key returned by `pqcKeyStatus`; a mismatch fails the local checks and exits
non-zero. The report sets `signingSource` to `external` and
`privateKeyRead` to `false`; the tool never reads, requests or prints a
mnemonic or private key in this mode.

Queries the EVM chain ID (must be `9800`), reads `pqcKeyStatus` and fails unless
the account has a registered, possession-proven ML-DSA-87 key with a 2,592-byte
key. Without `--servicing` it signs the Solidity-matched coupon fixture; with a
deployed contract it reads the exact message:

```bash
npm run authorize -- --issuer 0x... --key-file ... \
  --servicing 0x... --period-id 0 --deadline 1893456000
```

It prints the message, signature, prepared `pqcVerify` calldata and local
valid/wrong-key/tampered results. By default it also performs three read-only
`eth_call`s against the live `pqcVerify`; `--skip-live` omits them. It does not
build or broadcast a transaction.

## Isolated-signer workflow

The funded issuer key should not live on the machine that submits transactions.
Run the signing half inside the isolated signer, then move only the signature
(public data, bound to chain, contract, bond, PQC identity, action, nonce,
deadline and parameters):

On the isolated signer host, with the key file at mode `0600` outside the
repository:

```bash
node authorize.mjs \
  --issuer <0x registered PQC identity> \
  --key-file /secure/par-signer/pqc/par-issuer.dilithium \
  --servicing <0x BondServicing> --period-id 0 --deadline 1893456000 \
  > /secure/par-signer/authorization.json
node -e 'const r=require("/secure/par-signer/authorization.json"); require("node:fs").writeFileSync("/secure/par-signer/coupon.sig", r.signature.hex, {mode:0o644})'
```

Only `coupon.sig` leaves the signer. The operational issuer (holding
`ISSUER_ROLE`) then re-verifies it before submitting:

```bash
node authorize.mjs \
  --issuer <0x registered PQC identity> \
  --signature-file /secure/par-signer/coupon.sig \
  --servicing <0x BondServicing> --period-id 0 --deadline 1893456000
```

This second run must report `signingSource: "external"`,
`localChecks.validSignature: true` and, unless `--skip-live` is used, an
accepted `livePrecompile.validSignatureReturned`. Any edit to the message,
period, deadline or deployment changes the 288-byte message and invalidates the
signature. Never transfer the key file, the mnemonic or the secret key between
hosts.

## Live precompile check

```bash
npm run verify-live
```

Generates an ephemeral key, has the live testnet `pqcVerify` accept its
signature and reject a tampered message. Read-only; no registration needed.

See [`docs/issuer-setup.md`](../../docs/issuer-setup.md) for the exact account
creation, registration transaction and post-registration verification steps.
