# QoreChain testnet deployment

Reproducible deployment of the PAR demo bond to `qorechain-diana`, plus the exact prerequisites for
broadcasting it. The demo deployment was broadcast on 21 November 2026; the deployed addresses and
transaction hashes are recorded in §7. Only QoreChain testnet is in scope; mainnet was not touched.

## 1. Verified network configuration

Checked against the official QoreChain documentation and read-only calls on 20 November 2026.

| Setting | Value | Source |
|---|---|---|
| Network | `qorechain-diana` testnet | Connecting to Testnet |
| EVM chain ID | `9800` (`0x2648`) | EVM Development, live `eth_chainId` |
| EVM JSON-RPC | `https://evm-testnet.qore.host` | Connecting to Testnet |
| Cosmos REST | `https://api-testnet.qore.host` | Connecting to Testnet |
| Consensus RPC | `rpc-testnet.qore.host:443` | EVM_DEPLOY.md |
| Native currency | QOR, 18 decimals on the EVM side, 6 on the Cosmos side | EVM_DEPLOY.md |
| Base fee | 100 gwei = 0.1 uqor per gas | EVM_DEPLOY.md, live estimate |
| `pqcKeyStatus` | `0x0000000000000000000000000000000000000A02`, selector `0x850dfe51` | architecture.md §4, live |
| `pqcVerify` | `0x0000000000000000000000000000000000000A01`, selector `0xf52bde0a` | architecture.md §4, live |

EVM transaction rules that apply to a deployment (QoreChain "EVM Development" and "EVM Authorisation
Window Reference", v3.2.8):

- The sender must hold a **registered ML-DSA-87 key** (`pqcKeyStatus` returns the key with proof of
  possession) **and** have an **open EVM authorization window** with room for every transaction.
  Without them the node refuses `eth_sendRawTransaction` with `pqc` codes 26, 27 or 28.
- Opening and closing a window are **native-lane** messages signed with the account's PQC key
  (`qorechaind tx pqc open-evm-window <blocks> <max-txs> <max-value>` or QoreX). They cannot be sent
  from Foundry. `max-value` must be positive and is charged per transaction: the node counts the
  transaction's cost against it, not just its native `value` field. A 1 uqor cap rejects even a
  zero-value contract creation; give the window at least 5 QOR for a full deployment.
- Reads, `eth_call`, `eth_estimateGas` and `forge script` simulation need neither a key nor a window.
- Unprotected (pre-EIP-155) transactions are refused; Foundry signs with chain ID 9800.
- Deployment gas is not free: the simulation estimates **6,094,753 gas**, about **1.22 QOR** at the
  200 gwei max fee (100 gwei base + 100 gwei tip). Budget at least 3 QOR.

## 2. Identities and roles

| Identity | Address | Holds | Signs |
|---|---|---|---|
| Operational EVM issuer/deployer | `PAR_OPERATIONAL_ISSUER`, must equal the broadcaster | `DEFAULT_ADMIN_ROLE`, `ISSUER_ROLE` on `BondServicing`; `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE` on `BondToken`; `TREASURER_ROLE` when it is also the treasurer | EVM transactions only |
| Registered PQC issuer | `0x06cFd3728F669c5d2B71474eEE63f90BBDBbafA0` | **no role** | off-chain ML-DSA-87 action messages |
| Treasurer | `PAR_TREASURER` (defaults to the operational issuer) | `TREASURER_ROLE` | EVM transactions to fund coupons |

The script refuses to run unless the broadcaster is the operational issuer, and `BondServicing`'s
constructor rejects an operational issuer equal to `authorizer.pqcIssuer()`. After deployment the
script re-checks every role and every term and reverts if any is missing.

The PQC identity does **not** deploy, pay gas or hold a role. It needs no EVM window for PAR.

## 3. Demo bond (fixture terms)

The defaults reproduce the numbers pinned in `test/BondServicing.t.sol` and the signing fixture:

| Parameter | Value |
|---|---|
| Name / symbol | Par Bond 2030 / PAR30 |
| Payment token | deployed `DemoPaymentToken` (6 decimals, pUSD), 10,000,000 pUSD minted to the treasurer |
| Maturity | `1_893_456_000` (2030-01-01, the fixture signature deadline) |
| Coupon rate | 500 bps (5% annual) |
| Payments per year | 2 (semi-annual) |
| Face value per token | 100 pUSD (`100e6`) |
| Coupon per token per period | 2.5 pUSD (`2_500_000`) |
| Supply cap | 1,500,000e18 |
| Demo supply | 1,500e18 minted to `PAR_DEMO_HOLDER` (defaults to the operational issuer) |

Setting `PAR_PAYMENT_TOKEN` to an existing ERC-20 skips the demo token; that token must already be
funded for the treasurer.

## 4. Environment

| Variable | Default | Purpose |
|---|---|---|
| `PAR_PQC_ISSUER` | `0x06cF…afA0` | registered ML-DSA-87 identity, no role |
| `PAR_OPERATIONAL_ISSUER` | `msg.sender` | operational issuer; **must equal the broadcaster** |
| `PAR_TREASURER` | operational issuer | receives `TREASURER_ROLE` and the demo pUSD supply |
| `PAR_PAYMENT_TOKEN` | zero = deploy demo | existing 6-decimal payment token |
| `PAR_PAYMENT_SUPPLY` | `10_000_000e6` | demo token supply |
| `PAR_TOKEN_NAME` / `PAR_TOKEN_SYMBOL` | Par Bond 2030 / PAR30 | bond token metadata |
| `PAR_TOKEN_CAP` | `1_500_000e18` | immutable supply cap |
| `PAR_MATURITY` | `1_893_456_000` | must be in the future |
| `PAR_COUPON_RATE_BPS` | `500` | 1–10,000 |
| `PAR_PAYMENTS_PER_YEAR` | `2` | must divide 12 |
| `PAR_FACE_VALUE_PER_TOKEN` | `100e6` | payment-token base units |
| `PAR_DEMO_SUPPLY` | `1_500e18` | minted to the demo holder; `0` disables minting |
| `PAR_DEMO_HOLDER` | operational issuer | demo bond holder |

Foundry takes the key from its own flags (`--private-key`, `--keystore`, `--ledger`, `--mnemonic`).
The script never reads, logs or stores a private key, mnemonic or signed authorization.

## 5. Commands

Simulate against testnet (read-only; no key, no window, no broadcast — this is what was run):

```bash
forge script script/Deploy.s.sol \
  --rpc-url https://evm-testnet.qore.host \
  --sender <operational-evm-address>
```

Broadcast, only after the operational account is registered, has an open window with at least eight
transactions and enough blocks, and is funded:

```bash
export PAR_OPERATIONAL_ISSUER=0x<operational-evm-address>
export PAR_TREASURER=0x<treasurer-address>          # optional
forge script script/Deploy.s.sol \
  --rpc-url https://evm-testnet.qore.host \
  --sender "$PAR_OPERATIONAL_ISSUER" \
  --keystore ~/.foundry/keystores/par-deployer --password "$PAR_KEYSTORE_PASSWORD" \
  --broadcast
```

Never put the key in the repository or in shell history: use a keystore or a hardware wallet. The
deployment script takes no key argument.

The transaction count is seven when the demo mint runs: demo payment token, `BondToken`,
`PqcIssuerAuthorizer`, `BondServicing`, `grantRole(MINTER_ROLE)`, `grantRole(TREASURER_ROLE)` and
`mint`. Each consumes one window transaction; the window's value cap must cover the gas cost of all
of them, so open it with at least 8 transactions and 5 QOR, not a zero or 1 uqor cap.

If a broadcast is interrupted, do not resume it blindly: the window messages share the account
nonce, so a native window transaction can consume the nonce reserved for the first EVM transaction
and every later transaction then executes with a gap in the deployment sequence. Check the
broadcast JSON and the deployed code before retrying; `--start-fresh` is the safe path.

## 6. Post-deployment verification

`forge script` saves the broadcast to `broadcast/Deploy.s.sol/9800/run-latest.json` (git-ignored).
Verify independently with read-only calls:

```bash
RPC=https://evm-testnet.qore.host
cast call $BOND   "hasRole(bytes32,address)(bool)" $(cast keccak "PAR_MINTER_ROLE") $OPERATIONAL --rpc-url $RPC
cast call $SERVICING "hasRole(bytes32,address)(bool)" $(cast keccak "PAR_ISSUER_ROLE") $OPERATIONAL --rpc-url $RPC
cast call $SERVICING "hasRole(bytes32,address)(bool)" $(cast keccak "PAR_TREASURER_ROLE") $TREASURER --rpc-url $RPC
cast call $SERVICING "terms()(address,uint64,uint16,uint8,uint128)" --rpc-url $RPC
cast call $AUTHORIZER "pqcIssuer()(address)" --rpc-url $RPC
cast call $BOND "cap()(uint256)" --rpc-url $RPC
cast call $BOND "totalSupply()(uint256)" --rpc-url $RPC
cast call $SERVICING "authorizationNonce()(uint256)" --rpc-url $RPC   # must be 0
node tools/preflight/preflight.mjs $OPERATIONAL                        # EVM lane readiness
```

Expected: the PQC identity has no role on either contract; `authorizationNonce` is 0; `terms`
matches §3; `totalSupply` is 1,500e18 when the demo mint ran. Do not generate or submit a coupon
authorization as part of deployment verification.

## 7. Deployment record

Broadcast on 21 November 2026 to `qorechain-diana` (chain 9800). All seven transactions are in block
**10,462,390** with status `1`, gas 100 gwei base fee. Deployer: `0x3270c190500BCA8e26da8279c88d2C54035CAFba`
(`qor1xfcvryzsp09gufk6sfuu3rfv2sp4eta6vdckwr`).

| Contract / call | Address | Transaction |
|---|---|---|
| `DemoPaymentToken` | `0xD6EE9c3918507eb7DDB77Bb6E6f74176d9140262` | `0x05168718d785a7ec83821381ace19358d40b5a6fb63c5cf0a45368a6ff6c3fcb` |
| `BondToken` | `0xC3d195C5A5e2c476888050205D55DfBe3C453840` | `0xbbb04d3685a0e190f7f0394aea7d5f906c1727c5537c6806f6dfc938fe9fb49c` |
| `PqcIssuerAuthorizer` | `0x8FC2F2B42C4e1bfe203FE3e4F0F126593990784F` | `0x727e4de71ad52af2cc047b2b997c520199729e97c6f9a3fec24c8b5d445134e2` |
| `BondServicing` | `0x5df199D05FB83D14eaFD2823D46982bEb13512F5` | `0x52ef1f0bcf7e01150ff133f36c00d036abe1a58d5e9695597935ced06b61a425` |
| `grantRole(PAR_MINTER_ROLE)` on `BondToken` | — | `0x42eec297ebeed0e0a333970b17517e4c696866282b612ed55ad07a35bbda518b` |
| `grantRole(PAR_TREASURER_ROLE)` on `BondServicing` | — | `0x5f3f60addf97af3d7a95f3967dda39b248c264474fbde8417912acd8ffd0bdca` |
| `mint(1,500e18)` | — | `0xa843709f5f305605bd3c06ff40fc8b844a212a9152ed07206c5a02620806b428` |

Prerequisite transactions for the deployer account:

| Step | Transaction | Block |
|---|---|---|
| `MsgRegisterPQCKeyV2` (ML-DSA-87, PoP proven, fingerprint `ee3f2c93…d0b384`) | `C60ADDD47E43193F8D9AF544708D59FDD46156B8358C27A3DC7A3BAC63ED1E08` | 10,462,215 |
| `MsgOpenEVMWindow` 100 blocks / 10 txs / 1 uqor | `03A67CC6F708A3E7D6BA00A4E138ADA0562F8F5979B028BF42237A4A623EBFCA` | 10,462,235 |
| `MsgOpenEVMWindow` 2,000 blocks / 20 txs / 1 uqor (too small a value cap) | `CB7E5419565EEB8092E4E17A80CF056FD34DBD2F3B1E4192D741811AB1F7ED53` | 10,462,303 |
| `MsgOpenEVMWindow` 2,000 blocks / 20 txs / 5 QOR (used) | `0DC3D96D6F5AF260EC5467ECD16CC40F719519DFCA18A5818F6DCBD55D009C21` | 10,462,340 |

Verified on chain: `DEFAULT_ADMIN_ROLE` on both `BondToken` and `BondServicing`, `PAR_MINTER_ROLE`
on `BondToken`, `PAR_ISSUER_ROLE` and `PAR_TREASURER_ROLE` on `BondServicing` all held by the
operational issuer; the registered PQC identity `0x06cF…afA0` holds no role; `authorizer.pqcIssuer()`
is `0x06cF…afA0`; `terms` = payment token `0xD6EE…0262`, maturity `1_893_456_000`, 500 bps, 2 payments
per year, face `100e6`; bond cap `1.5e24`, supply and deployer balance `1,500e18`; demo pUSD is
6-decimal, supply and balance `10,000,000e6`; `authorizationNonce()` is `0`.

**Abandoned first attempt.** An earlier broadcast was interrupted by the 1 uqor window cap. When the
window was reopened, the native window message took the nonce reserved for the first EVM transaction,
so the demo token transaction was dropped while the remaining six executed. Those contracts
(`BondToken 0xA5C84776…C643`, `PqcIssuerAuthorizer 0x3bC9fD91…0312`, `BondServicing 0x27Dfd54D…C2D4`,
demo token address `0x5E90f54d…b944`, which has no code) are **invalid and must not be used**; the
table above is the authoritative deployment.

Mainnet is out of scope.
