# PAR PQC signing check

Local, offline check that the bytes produced by PAR's authorization message encoding can be signed
and verified with QoreChain's official ML-DSA-87 implementation.

```bash
npm install
npm start
```

The script:

1. builds the same authorization message as
   [`contracts/lib/AuthorizationMessage.sol`](../../contracts/lib/AuthorizationMessage.sol) for a coupon
   finalization and a redemption declaration;
2. asserts the two message hashes against the values pinned in
   [`test/AuthorizationMessage.t.sol`](../../test/AuthorizationMessage.t.sol);
3. generates an ephemeral ML-DSA-87 key (or loads a 32-byte test seed from
   `PAR_PQC_TEST_SEED`), signs each message with `@qorechain/pqc`, verifies it, and checks that a
   one-bit change is rejected;
4. prints the public key, message bytes/hashes and signature lengths as JSON.

It does **not** print, write or commit the secret key, and it makes no network request. A key from
`PAR_PQC_TEST_SEED` is a test key; never use a key that controls a funded account.

The message encoding was verified against the chain implementation's ABI helpers
(`qorechain-core/x/vm/precompiles/abi_helpers.go`); see `docs/architecture.md` for the exact ABI and
the testnet preflight results.
