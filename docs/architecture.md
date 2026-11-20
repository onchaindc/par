# PAR — contract architecture and PQC integration

This document records the design decisions for the Solidity foundation: the review of the QoreChain
Asset Kit, the choice of historical-balance mechanism, the contract layout and the post-quantum
authorization flow.

## 1. QoreChain Asset Kit v0.1.0 review

Source: <https://github.com/qorechain/qorechain-asset-kit> (Apache-2.0, with two GPL-3.0 directories).

### What is in it

| Component | What it does | Relevance to PAR |
|---|---|---|
| `QoreChainHybridHolderGuard` | Reads the `pqcKeyStatus` precompile (`0x0A02`) and returns whether an address has a registered ML-DSA-87 key with proof of possession. Fails closed. Owner-managed exemptions for contracts. | Not reused as-is. It is a **holder eligibility policy**, not an issuer authorizer, and it does not call `pqcVerify`. |
| `QoreChainHybridHolderRule` / `QoreChainHybridHolderModule` | Map the guard into CMTAT v3 and ERC-3643. | Not used. PAR tokenizes the bond with a plain ERC-20; no CMTAT/ERC-3643 compliance suite is needed for this milestone. |
| `QoreChainRwaVault`, `QoreChainRwaAsyncVault` | ERC-4626 / ERC-7540 vaults with restricted shares. | Not used. ERC-7540 is asynchronous *vault share* servicing; it says nothing about bond coupons or record-date ownership. |
| `IERC7518` | Interface sketch for partitions. | Not used. One bond issue per serving contract in this milestone. |
| `IQorePqcKeyStatus` | Declares `pqcKeyStatus(address) returns (bool, uint8, bytes, bool)`. | **Interface reused** (Apache-2.0), with attribution, because PAR must read the registered key. |
| Proposed `x/asset`, `x/identity`, `x/compliance`, `x/settlement`, `x/attest` modules and clients | Protobuf proposal; every chain client throws `ChainUpgradeRequired` because the modules are not on chain. | Not usable. No chain upgrade is scheduled. |

### Licensing implications

- The Asset Kit's Solidity adapters are Apache-2.0, except `contracts/script/erc3643/` and
  `contracts/test/erc3643/`, which compile with the GPL-3.0 T-REX implementation and are
  GPL-3.0-or-later.
- PAR is MIT. Apache-2.0 code can be included in an MIT project provided the Apache-2.0 files keep
  their licence headers and notices. PAR copies only `IQorePqcKeyStatus.sol` (Apache-2.0) and records
  this in `NOTICE`. No GPL-3.0 or MPL-2.0 source is copied or linked.
- The `pqcVerify` interface is transcribed from the QoreChain documentation, which publishes it under
  MIT. It is in `contracts/interfaces/IQorePqcVerify.sol`.
- OpenZeppelin Contracts 5.1.0 (MIT) and forge-std (MIT OR Apache-2.0) are pinned git submodules, not
  copied code.

### Limitations found

- The guard answers "may this address **hold** a restricted asset", not "did the issuer
  **authorize** this payment declaration". Using it directly for issuer actions would check only key
  registration, never a signature over the action.
- The Asset Kit and `qorechain-core` (from v3.2.4, `pqc-possession-flag`) document `pqcKeyStatus`
  with four fields, including `possessionProven`. The QoreChain precompile documentation page is stale
  and still shows three. PAR requires the four-field layout and proof of possession; the legacy
  three-field answer is rejected (see §4 and the testnet preflight in §5).
- The Asset Kit states that the QoreChain PQC precompiles are testnet-only and that mainnet activation
  is an open governance decision; the QoreChain docs currently describe them as active on both. PAR is
  therefore fail-closed and makes no mainnet assumption.
- None of the kit's contracts provides coupon periods, record dates, claims, funding accounting or
  reconciliation. Those had to be built.

## 2. Historical balances: options considered

| Option | Verdict |
|---|---|
| ERC-7540 asynchronous vault | Irrelevant: it batches deposit/redemption requests for vault shares, not bond ownership, and has no historical balance query. |
| ERC-3643 (T-REX) | Provides identity, compliance, freeze and forced transfer, but **no historical balance or snapshot API**. Adopting it would add a GPL-3.0 dependency and a large compliance suite for no record-date capability. |
| ERC-20 `snapshot` / OZ `ERC20Snapshot` | Deprecated in OpenZeppelin 5 and copies balances per snapshot; unbounded gas and no arbitrary block queries. |
| ERC-5805 / `ERC20Votes` checkpoints | The right primitive, but `ERC20Votes` only checkpoints delegated voting power, and PAR does not need delegation. |
| **Custom per-account checkpoints (chosen)** | `BondToken` writes a `(blockNumber, balance)` checkpoint on every mint and transfer and binary-searches it. `balanceOfAt` and `totalSupplyAt` are O(log n), support any past block, and keep the token a plain transferable ERC-20. |

`balanceOfAt` requires a block strictly in the past; the current block is never treated as final.
Record dates are block numbers, which is what the EVM can answer reliably. QoreChain block times are
short, so a block is a precise operational cut-off.

## 3. Contracts

```
BondToken (ERC-20 + AccessControl + checkpoints)
   ▲ balanceOfAt / totalSupplyAt
   │
BondServicing (AccessControl + ReentrancyGuard + SafeERC20)
   │  terms, coupon periods, funding, claims, redemption
   ▼
IIssuerAuthorizer ── PqcIssuerAuthorizer ── 0x0A02 pqcKeyStatus (registered key)
                                          └─ 0x0A01 pqcVerify   (signature)
```

### BondToken

- ERC-20, 18 decimals, transferable.
- Immutable `cap`; `MINTER_ROLE` mints and the cap is enforced on every mint.
- Per-account and total-supply checkpoint arrays. Multiple movements in the same block collapse into
  one checkpoint holding the final balance.
- No burn function: principal is paid from a record-date snapshot. Retiring supply after maturity is
  a separate reconciliation step, not part of this milestone.

### BondServicing

Terms are registered once in the constructor: payment token, maturity timestamp, annual coupon rate
in basis points, payments per year (must divide 12) and face value per 1e18 token base units.

Coupon lifecycle:

1. `openCouponPeriod(recordDateBlock)` — `ISSUER_ROLE`; the record date must be in the future and
   strictly later than the previous period's record date.
2. `setCouponRecordDate(periodId, newBlock)` — allowed only while the period is unfinalised **and**
   its current record date has not been reached. Once the block is reached the date is locked, so it
   cannot be chosen retroactively after balances are known.
3. `finalizeCoupon(periodId, signature)` — `ISSUER_ROLE` plus a valid ML-DSA-87 issuer signature.
   Requires the record-date block to be in the past. Freezes the record date, the coupon per token
   (`faceValue * rateBps / (10000 * paymentsPerYear)`) and the funding requirement
   (`totalSupplyAt(recordDate) * couponPerToken / 1e18`).
4. `fundCoupon(periodId, amount)` — `TREASURER_ROLE`, pulls the payment token with `SafeERC20`.
   Partial top-ups are allowed; funding above the requirement is rejected.
5. `claimCoupon(periodId)` — pays `balanceOfAt(recordDate) * couponPerToken / 1e18` once, and only
   when the period is fully funded.

Principal lifecycle: after `maturity`, the issuer signs `declareRedemption(recordDateBlock, signature)`.
This freezes a historical record date, `principalPerToken = faceValuePerToken` and the requirement
`totalSupplyAt(recordDate) * principalPerToken / 1e18`. The treasurer funds it and each investor calls
`claimPrincipal()` once.

Per-period status is exposed as `required / funded / claimed / outstanding`, where `outstanding` is
`funded - claimed` (the amount still held for unclaimed entitlements).

### Access control

| Role | Holder | Powers |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | operational EVM issuer | Grants/revokes roles. |
| `ISSUER_ROLE` | operational EVM issuer | Opens periods, edits unfinalised future record dates, finalises coupons, declares redemption. |
| `TREASURER_ROLE` | treasurer (granted by admin) | Funds coupons and principal. |
| `MINTER_ROLE` (token) | operational EVM issuer | Mints within the cap. |

A treasurer cannot finalise a distribution; an issuer cannot fund one unless also granted the
treasurer role; neither can finalise or declare redemption without a valid PQ signature.

### Two issuer identities

`BondServicing` separates the account that **holds the role and submits the transaction** from the
account whose **post-quantum key authorises the action**:

| Identity | Address kind | What it does |
|---|---|---|
| Operational EVM issuer | ordinary EVM account | Holds `DEFAULT_ADMIN_ROLE` and `ISSUER_ROLE`, sends `finalizeCoupon` / `declareRedemption`, pays gas. |
| PQC issuer | account with a registered, possession-proven ML-DSA-87 key | Signs the action message off chain. Holds no role and needs no EVM transaction. |

The constructor rejects a zero operational issuer and rejects the case where the operational issuer
is the same address as `authorizer.pqcIssuer()`. `PqcIssuerAuthorizer` remains an independent,
immutable statement of which key may sign. Because the authorizer is asked about
`authorizer.pqcIssuer()` rather than `msg.sender`, any account holding `ISSUER_ROLE` can relay a valid
signature. The role still gates *whether* an action may be attempted; the PQC signature gates *what*
is authorised. Neither factor alone is sufficient, and a compromised operational key cannot forge a
coupon or redemption declaration.

## 4. PQC authorization design

`PqcIssuerAuthorizer` binds two QoreChain precompiles, which are deliberately kept separate:

1. **0x0A02 `pqcKeyStatus(address)`** establishes which ML-DSA-87 public key is registered to the
   issuer address. PAR requires **all four** fields: `registered == true`, `algorithmId == 1`,
   `pubkey.length == 2592` and `possessionProven == true`. The decoder accepts only the exact
   2,752-byte four-field response (four head words + key length + 81 key words). The legacy
   three-field response, any other offset, trailing data, anonymous keys and unproven keys are
   rejected. Requiring proof of possession is essential: anyone can register a copied public key on
   their own account, so without the flag one address could pass as another.
2. **0x0A01 `pqcVerify(pubkey, signature, message)`** verifies the 4,627-byte ML-DSA-87 signature over
   the exact action message.

### Verified precompile ABI

The selectors and encoding were checked against `qorechain-core/x/vm/precompiles/abi_helpers.go`,
which decodes calldata with `abi.Arguments` over `(bytes, bytes, bytes)` and encodes the answer as an
ABI bool. They are pinned by `test/PqcIssuerAuthorizer.t.sol`.

| | `pqcVerify` | `pqcKeyStatus` |
|---|---|---|
| Address | `0x0000000000000000000000000000000000000A01` | `0x0000000000000000000000000000000000000A02` |
| Solidity signature | `pqcVerify(bytes,bytes,bytes)` | `pqcKeyStatus(address)` |
| Selector | `0xf52bde0a` | `0x850dfe51` |
| Calldata | selector + standard ABI encoding of three dynamic `bytes` (heads `0x60/0x80/0xa0`) | selector + one 32-byte address word |
| Inputs | 2,592-byte key, 4,627-byte signature, raw message (no prehash, empty context string) | EVM address |
| Output | `abi.encode(bool)`, 32 bytes | four-field ABI; 160 bytes for an unregistered account, 2,752 bytes for a registered 2,592-byte key |
| Gas | 25,000 + 8 per calldata byte (~85,000 for a typical check) | 2,500 flat |
| Failure | invalid input returns `false`, does not revert; insufficient gas makes the call fail | inactive precompile returns empty data to a low-level call |

PAR forwards 250,000 gas to `pqcVerify` and 200,000 to `pqcKeyStatus`; unused gas is not charged.
Both are `staticcall`s, and any failure, empty/malformed return or non-canonical boolean is a refusal.
The servicing contract then reverts with `UnauthorizedIssuerAction`.

The signed message is ABI-encoded (288 bytes) and includes:

```
keccak256("PAR_BOND_AUTHORIZATION_V1")
chainId
address(servicing)
address(bond)
address(pqcIssuer)
action type (FINALIZE_COUPON or DECLARE_REDEMPTION)
authorizationNonce
deadline
keccak256(action parameters)
```

The nonce is consumed on every successful authorization and included before increment, so signatures
cannot be replayed across actions, periods, bonds or chains. The deadline bounds how long an unused
signature stays valid. `couponFinalizationMessage(periodId, deadline)` and
`redemptionDeclarationMessage(recordDateBlock, deadline)` return the exact bytes to sign, so the
off-chain signer does not duplicate the encoding. The PQC issuer signs with the ML-DSA-87 key
registered to `authorizer.pqcIssuer()`; the transaction may be sent by that address or by any other
account holding `ISSUER_ROLE`. `pqcIssuer` is part of the signed bytes, so a signature produced for a
different PQC identity — or for a different chain, servicing contract, bond, action, nonce, deadline
or parameter set — does not verify. Freshness is enforced by both the nonce and
`block.timestamp <= deadline`; an expired signature is rejected with `AuthorizationExpired` before any
cryptographic check and without consuming the nonce.

### Off-chain signing procedure

Use the official `@qorechain/pqc` package (v0.2.3 in `tools/pqc-sign`) and sign the exact bytes
returned by the message helper, with no additional hashing:

```js
import { mldsa87 } from "@qorechain/pqc";
import { getBytes } from "ethers";

const messageBytes = getBytes(await servicing.couponFinalizationMessage(periodId, deadline));
const signature = mldsa87.sign(secretKey, messageBytes); // FIPS-204, 4,627 bytes
mldsa87.verify(publicKey, messageBytes, signature); // true
```

The library's `hybridSignBytes` helpers are for native-lane QoreChain transactions and are not used
here. `tools/pqc-sign/sign.mjs` reproduces the message encoding, asserts the same hashes as
`test/AuthorizationMessage.t.sol`, signs both PAR action types locally, verifies them and rejects a
tampered message. That offline check never prints or persists its ephemeral secret key.

For a real issuer, `tools/pqc-sign/keygen.mjs` writes an ML-DSA-87 key in the official
`qorechaind` file format (hex secret, mode 0600, outside the repository), `register.mjs` prepares and
verifies the `MsgRegisterPQCKeyV2` proof of possession, and `authorize.mjs` reads the registered key
from `pqcKeyStatus`, signs the exact contract message or fixture, verifies locally and prepares the
`pqcVerify` calldata. None of these tools builds or broadcasts a transaction.

### Test doubles vs real verification

`test/mocks/Mocks.sol` contains `MockPqcKeyStatus` and `MockPqcVerify`, etched at the real precompile
addresses in Foundry tests. They let the unit tests exercise encoding, gating, nonce and fail-closed
behaviour. **They do not perform any cryptography.** Real ML-DSA-87 signing and verification is
exercised offline by `tools/pqc-sign` with the official library; `tools/pqc-sign/verify-live.mjs`
checks the same signature path against the live precompile with `eth_call`.

## 5. Testnet preflight (read-only)

`tools/preflight/preflight.mjs` was run against `https://evm-testnet.qore.host` on 20 November 2026
(block 10,442,536). It sends only `eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`,
`eth_getCode` and `eth_call`; it holds no key and sends no transaction. With an issuer address it
exits non-zero unless the key is a registered, possession-proven ML-DSA-87 key with the exact
2,752-byte response required by `PqcIssuerAuthorizer`.

| Check | Result |
|---|---|
| Chain ID | `9800` (`qorechain-diana`), as expected |
| `eth_getCode` at `0x0A01` / `0x0A02` | `0x` (precompiles are native, not bytecode) |
| `pqcKeyStatus(0x0…)` raw response | 160 bytes, returned data |
| Response layout | four fields; word 2 is `0x80`, fields are `registered=false, algorithmId=0, pubkeyLength=0, possessionProven=false` |
| `pqcVerify("","","")` raw response | 32 bytes, ABI `false` |
| Interpretation | both precompiles are active; the empty signature was **rejected**, not unavailable |
| `pqcVerify` with a locally generated key/signature (`tools/pqc-sign/verify-live.mjs`, read-only) | 32-byte `true`; the same signature over a tampered message returned 32-byte `false` |

No address was supplied for a real holder query, so the key-status probe used the zero address and
is labelled as a synthetic probe. It confirms the four-field layout but says nothing about any real
account's registration or possession status. Once an issuer is registered, running the same tool
with its `0x` address is the acceptance check for registration.

## 6. Known limitations and open technical questions

1. **`pqcKeyStatus` layout: resolved for testnet.** The chain returns the four-field layout (offset
   `0x80`). The QoreChain precompile docs page is stale (three fields) and should not be used to build
   decoders. A registered, possession-proven account has not been observed yet because no address was
   supplied.
2. **Precompile availability.** Both precompiles answered on testnet. The Asset Kit states
   `pqcKeyStatus` is not active on mainnet and that activation is undecided, while the docs page
   claims both networks. PAR fails closed; mainnet cannot be planned until this is resolved.
3. **Live raw-signature check passed; registered-issuer action not yet tested.** A read-only
   `eth_call` to testnet `pqcVerify` accepted a locally generated ML-DSA-87 signature over the raw
   message and rejected a tampered one. What remains is the full path: a registered, possession-proven
   issuer key signing a real `couponFinalizationMessage` and submitting `finalizeCoupon`.
4. **Key rotation and revocation.** The authorizer resolves the key through `pqcKeyStatus` on every
   call, so a native key rotation or removal is picked up automatically and old signatures stop
   working. The authorizer's PQC issuer address is immutable; changing *that* identity requires
   deploying a new authorizer and servicing contract. The operational EVM issuer is ordinary role
   administration: the admin can grant `ISSUER_ROLE` to a replacement account and revoke the old one.
5. **Deadline policy.** The contract enforces the signed deadline but does not impose a maximum. An
   issuer client should use a short window (minutes to hours) for operational actions.
6. **Token retirement.** Principal claims do not burn bond tokens. Post-maturity supply retirement and
   reconciliation of residual dust are part of a later milestone.
7. **Coupon rounding.** Entitlements round down per investor; the unclaimable dust remains in the
   contract. Funding is capped at the exact aggregate requirement, so it cannot be over-funded.
8. **Maturity record date.** The issuer chooses a historical block at/after maturity and signs it. There
   is no automatic on-chain mapping from the maturity timestamp to a block, and no trading freeze at
   maturity yet.
9. **No reconciliation tooling.** Subscriptions, transfers and payments outside the contract are not
   observed. Payment reconciliation is planned for a later milestone.
10. **Gas.** A real `pqcVerify` call costs about 85,000 gas at the precompile plus calldata and ABI
    overhead; a transaction should budget well above 300,000 gas.
11. **Registered issuer still not exercised.** The registration and authorization tooling is ready,
    but no funded testnet issuer account exists and no registration has been broadcast, so the
    registered-key path through `BondServicing` remains untested on chain.

## 7. Next steps for the first real on-chain signature verification

Preparation is complete; no deployment, registration or broadcast has been performed. The exact
account and registration procedure is in [issuer-setup.md](issuer-setup.md).

1. Create a fresh `eth_secp256k1` (coin 60) testnet account, fund it with test QOR, and generate a
   dedicated ML-DSA-87 key with `keygen.mjs` or `qorechaind tx pqc gen-key`.
2. Verify the proof of possession locally with `register.mjs`, build the unsigned
   `MsgRegisterPQCKeyV2` with `--generate-only`, and wait for explicit authorization before
   broadcasting the registration. It must be the account's first transaction.
3. Confirm `tools/preflight/preflight.mjs <0x>` exits `0` with `registered`, `algorithmId=1`,
   `pubkeyLength=2592` and `possessionProven=true`.
4. Open a bounded EVM authorization window from the native lane (broadcast; not authorized yet).
5. Deploy `BondToken`, `PqcIssuerAuthorizer` and `BondServicing` to testnet 9800 with
   `script/Deploy.s.sol` (simulate first; see [deployment.md](deployment.md)), passing the operational
   EVM issuer as broadcaster and constructor argument; that account receives `ISSUER_ROLE` and
   `DEFAULT_ADMIN_ROLE`, and the registered PQC identity receives no role.
6. Run `authorize.mjs` with the deployed contract and the registered PQC key to sign
   `couponFinalizationMessage`, submit `finalizeCoupon(periodId, deadline, signature)` from the
   operational issuer, and confirm the event/nonce. Repeat wrong signer, tampered message and
   expired deadline; each must revert without consuming the nonce.
7. Add a minimal reconciliation export and token retirement after redemption.
