# Par

**Bond servicing, secured for the post-quantum era.**

Par is an open-source bond servicing application for tokenized assets. It handles investor entitlement snapshots, coupon distributions, maturity redemption, payment claims and reconciliation, with post-quantum authorization for sensitive issuer operations using QoreChain.

## Status

The contracts are deployed and verified on QoreChain testnet (chain 9800), with a registered operational issuer and its own ML-DSA-87 key. A full coupon lifecycle has been exercised on chain: period 0 was finalized with a PQC signature, funded, and claimed to completion, and record-date ownership was verified with a post-snapshot transfer that received nothing.

| Component | Status |
|-----------|--------|
| Bond configuration and schedules | implemented |
| Historical ownership snapshots | implemented |
| Coupon calculation and distribution | implemented |
| Maturity redemption | implemented |
| Investor payment claims | implemented |
| Funded / claimed / outstanding tracking | implemented |
| ML-DSA-87 authorization (QoreChain) | implemented; four-field key status with proof of possession; local signing and read-only live `pqcVerify` verified |
| Read-only testnet preflight | complete; strict issuer validation (chain 9800) |
| Registered issuer setup and PoP tooling | prepared; no registration broadcast |
| Payment reconciliation | implemented in the application and on chain |
| QoreChain testnet deployment | deployed and verified at block 10,462,390 on chain 9800 |
| Registered-issuer transaction | key registered with proof of possession; PQC-authorised coupon finalization executed on testnet |
| End-to-end coupon lifecycle | finalized, funded and fully claimed on testnet; reconciliation zero after claims |
| Bond servicing frontend | modern responsive shell: issue cover, plain-language issue view, holdings, management, payments and records |

## Architecture

```
BondToken (ERC-20 + AccessControl + balance checkpoints)
   ▲ balanceOfAt / totalSupplyAt
   │
BondServicing (AccessControl + ReentrancyGuard + SafeERC20)
   │  terms, coupon periods, funding, claims, redemption
   ▼
IIssuerAuthorizer ── PqcIssuerAuthorizer ── 0x0A02 pqcKeyStatus
                                          └─ 0x0A01 pqcVerify
```

See [docs/architecture.md](docs/architecture.md) for the QoreChain Asset Kit review, licensing analysis, the historical-balance design comparison and the PQC authorization flow.

### Bond token

`BondToken` is a transferable ERC-20 with an immutable supply cap and issuer-controlled minting (`MINTER_ROLE`). Every mint and transfer writes a per-account checkpoint, so `balanceOfAt(account, block)` and `totalSupplyAt(block)` answer historical ownership questions for any past block without snapshots or a holder list.

### Bond servicing

`BondServicing` registers one bond's terms: payment token, maturity, annual coupon rate in basis points, payments per year and face value per token. It then supports:

- Opening coupon periods and setting a future record-date block. The record date is locked once its block is reached, so it cannot be chosen retroactively.
- Finalising a period: freezes the record date, coupon per token and the exact funding requirement from historical supply. Requires `ISSUER_ROLE` and a valid ML-DSA-87 signature.
- Funding a period with `SafeERC20`; partial top-ups are allowed, over-funding is rejected.
- Investor claims computed from `balanceOfAt(recordDate)`, exactly once per period, only when fully funded.
- Principal redemption after maturity, with its own historical record date, funding and one-time claims.
- `required / funded / claimed / outstanding` views per coupon period and for redemption.

### Post-quantum authorization

Sensitive issuer actions (`finalizeCoupon`, `declareRedemption`) require two factors: the `ISSUER_ROLE` and a fresh ML-DSA-87 signature verified on chain.

The role and the signing key belong to different accounts. An operational EVM issuer holds `DEFAULT_ADMIN_ROLE` and `ISSUER_ROLE`, sends the transaction and pays gas; the registered PQC identity (`authorizer.pqcIssuer()`) signs the action message off chain and holds no role. `BondServicing` rejects a constructor issuer equal to the PQC identity, so a single keypair can never supply both factors. Because verification is against `authorizer.pqcIssuer()` rather than `msg.sender`, any account holding `ISSUER_ROLE` can relay a valid signature.

`PqcIssuerAuthorizer` reads the issuer's registered public key from **PQC Key Status at `0x0A02`** and requires the exact four-field response: `registered == true`, algorithm id 1 (ML-DSA-87), a 2,592-byte key and `possessionProven == true`. The three-field legacy layout, unproven keys, malformed data and missing precompiles are rejected. It then calls **PQC Verify at `0x0A01`** with the 4,627-byte signature over the action message. The two precompiles are never confused: `0x0A02` identifies the key, `0x0A01` verifies the signature.

The signed 288-byte message binds the chain, servicing contract, bond, registered PQC issuer identity, action type, a one-time authorization nonce, a deadline and the action parameters. Signatures cannot be replayed across actions or chains, and expire. `couponFinalizationMessage(periodId, deadline)` and `redemptionDeclarationMessage(recordDateBlock, deadline)` return the exact bytes an issuer must sign; `tools/pqc-sign` demonstrates signing them with the official `@qorechain/pqc` package and asserts the same hashes as a Solidity test.

The selectors and encoding are pinned against QoreChain's `qorechain-core` ABI helpers: `pqcVerify(bytes,bytes,bytes)` is `0xf52bde0a` and `pqcKeyStatus(address)` is `0x850dfe51`. A read-only testnet preflight (`tools/preflight/preflight.mjs`) confirmed chain ID 9800, the four-field key-status response and an active `pqcVerify`. A second read-only check (`tools/pqc-sign/verify-live.mjs`) had the live precompile accept a locally generated ML-DSA-87 signature and reject a tampered message.

**Foundry cannot execute QoreChain precompiles.** The test suite etches clearly labelled test doubles at the real addresses; they exercise authorization logic but perform no ML-DSA-87 cryptography. The offline signing check does real ML-DSA-87 signing and verification with the official library. A read-only check against the live precompile accepted a locally generated signature; a registered-issuer transaction is still pending.

## Development

Requirements: [Foundry](https://book.getfoundry.sh/) (tested with forge 1.10.0) and a Solidity 0.8.28 toolchain.

```bash
git clone --recurse-submodules https://github.com/onchaindc/par
cd par
forge build
forge test
```

If the repository was cloned without submodules:

```bash
git submodule update --init --recursive
```

Dependencies:

- OpenZeppelin Contracts 5.1.0 (MIT)
- forge-std 1.9.7 (MIT OR Apache-2.0)
- QoreChain interfaces: `IQorePqcKeyStatus` from the QoreChain Asset Kit v0.1.0 (Apache-2.0) and `IQorePqcVerify` from the QoreChain docs (MIT), attributed in [NOTICE](NOTICE).

Repository structure:

- `contracts/` — Solidity contracts and interfaces
- `test/` — Foundry tests and precompile test doubles
- `docs/` — architecture and design notes
- `script/` — `Deploy.s.sol` (testnet deployment), `DemoPaymentToken.sol`
- `src/` — Vite/React bond-servicing frontend
- `index.html`, `vite.config.ts`, `tsconfig.json` — frontend entry and build configuration

Read-only testnet preflight and PQC tooling:

```bash
node tools/preflight/preflight.mjs [issuer-address]
(cd tools/pqc-sign && npm install && npm start)
(cd tools/pqc-sign && node verify-live.mjs)
(cd tools/pqc-sign && npm run keygen -- --name par-issuer-mldsa)
(cd tools/pqc-sign && npm run register -- --help)
(cd tools/pqc-sign && npm run authorize -- --help)
```

See [docs/issuer-setup.md](docs/issuer-setup.md) for the exact testnet account creation,
`MsgRegisterPQCKeyV2` proof-of-possession, registration and verification procedure. All registration
commands there are listed without broadcasting; the tooling is read-only.

## Application

The bond-servicing frontend is a Vite + React + TypeScript application at the repository root. It reads the
deployed contracts directly over the QoreChain EVM RPC and writes only through the connected injected wallet
(MetaMask, Rabby or another EIP-1193 wallet on chain 9800). No private key, seed phrase or PQC key file is ever
requested, stored or transmitted by the frontend.

```bash
bun install
bun run dev        # http://localhost:5173
bun run build      # typecheck + production bundle in dist/
bun run typecheck
```

The app opens on an **issue cover** — a live, three-dimensional bond certificate with the key terms, interest
calendar, payout mechanics and the two-key model. Entering the app reveals a desktop sidebar navigation and a
fixed mobile bottom bar. The cover is session-scoped: the brand mark returns to it.

**Read access is open to everyone.** No wallet, account, API key or private key is needed to read the bond. A
wallet is only required to manage or collect, and the contracts decide who may do that. Private keys and the PQC
signing key are never part of the web bundle; sharing them publicly would hand the issuer role to every visitor.
For a public write demo, use a hosted, rate-limited signer service rather than embedding a key in the page.

Sections:

- **Overview** — the bond in plain language: terms, live supply, interest schedule, on-chain holders and the
  two-key approval model.
- **Your position** — the connected holder's balance, interest per payment, what is ready to collect and
  principal status.
- **Issuer** — opening a round, moving its snapshot, approving with an externally produced signature, adding
  funds and declaring principal. Role-gated and clearly labelled view-only when the wallet lacks access.
- **Claims** — interest collections per round and the one-time principal collection, enabled only when fully
  funded.
- **Funds** — promised, funded, collected and outstanding amounts, coverage and integrity checks.

Sensitive actions never sign in the browser: the panel shows the exact message read from the contract, the
registered PQC identity, the authorization nonce and a deadline, verifies a pasted 4,627-byte ML-DSA-87
signature on chain through `PqcIssuerAuthorizer`, and only then submits the transaction from the operational
issuer wallet. The signing workflow is documented in [docs/issuer-setup.md](docs/issuer-setup.md) and
[docs/frontend.md](docs/frontend.md); the end-to-end testnet results are in
[docs/acceptance.md](docs/acceptance.md).

The UI needs no environment variables; the chain, addresses and deployment block are fixed in
`src/config.ts`.

Testnet deployment ([docs/deployment.md](docs/deployment.md)):

```bash
forge script script/Deploy.s.sol --rpc-url https://evm-testnet.qore.host --sender <operational-evm-address>
forge test --match-contract DeployScriptTest
```

The simulation needs no key and no EVM window. Broadcasting requires an operational coin-60 account
that is funded, has its own registered ML-DSA-87 key and an open EVM authorization window; see the
prerequisite table and verification checklist in the deployment doc.

Demo deployment on QoreChain testnet (chain 9800, 21 November 2026, block 10,462,390):

- `BondToken` `0xC3d195C5A5e2c476888050205D55DfBe3C453840`
- `PqcIssuerAuthorizer` `0x8FC2F2B42C4e1bfe203FE3e4F0F126593990784F`
- `BondServicing` `0x5df199D05FB83D14eaFD2823D46982bEb13512F5`
- demo payment token `0xD6EE9c3918507eb7DDB77Bb6E6f74176d9140262`

Addresses, transaction hashes and verified state are recorded in [docs/deployment.md](docs/deployment.md).

Housekeeping:

```bash
forge fmt
```

## Security

Implemented protections:

- exactly-once coupon and principal claims;
- record dates locked at their block and frozen on finalization;
- distributions cannot be claimed unless fully funded, and funding cannot exceed the requirement;
- `ReentrancyGuard` and checks-effects-interactions around token transfers;
- Solidity 0.8 checked arithmetic and `Math.mulDiv` for entitlement math;
- `SafeERC20` for all payment-token movements;
- separated `ISSUER_ROLE` and `TREASURER_ROLE`, and separated operational EVM issuer from the registered PQC signing identity;
- fail-closed ML-DSA-87 authorization: four-field key status with proof of possession, nonce- and deadline-bound, domain-separated messages.

Known limitations are listed in [docs/architecture.md](docs/architecture.md), including the pending first registered-issuer transaction, testnet-only precompile status, per-investor rounding dust, and the absence of token retirement after principal claims.

The contracts are deployed to QoreChain testnet only (see [docs/deployment.md](docs/deployment.md));
they are unaudited and not deployed to mainnet.

## Licence

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
