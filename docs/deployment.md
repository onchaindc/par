# QoreChain testnet deployment

Reproducible deployment of the PAR demo bond to `qorechain-diana`, plus the exact prerequisites for
broadcasting it. Nothing in this document has been broadcast: the deployment script is implemented,
unit-tested and simulated against chain 9800, but no funded, window-enabled deployer exists yet.

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
  from Foundry.
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

Broadcast, only after the operational account is registered, has an open window with at least six
transactions and enough blocks, and is funded:

```bash
export PAR_OPERATIONAL_ISSUER=0x<operational-evm-address>
export PAR_TREASURER=0x<treasurer-address>          # optional
forge script script/Deploy.s.sol \
  --rpc-url https://evm-testnet.qore.host \
  --private-key "$PAR_DEPLOYER_PRIVATE_KEY" \
  --broadcast
```

Never put the key in the repository or in shell history: use a keystore
(`--keystore ~/.foundry/keystores/par-deployer --interactive`) or a hardware wallet. The deployment
script takes no key argument.

The transaction count is six: demo payment token, `BondToken`, `PqcIssuerAuthorizer`, `BondServicing`,
`grantRole(MINTER_ROLE)`, `grantRole(TREASURER_ROLE)`, plus `mint` when `PAR_DEMO_SUPPLY != 0`. Open
the window with at least 8 transactions and a value cap of 0 (no native value is sent).

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

## 7. Remaining blockers (as of this commit)

1. **No operational deployer credentials** are configured in the workspace environment
   (`freebuff-env list` is empty). No private key, keystore or mnemonic is available to Foundry.
2. **No funded operational account.** The deployer needs testnet QOR from the Dashboard Faucet
   (≥3 QOR recommended for the estimated 1.22 QOR fee plus headroom).
3. **No registered PQC key and no open EVM window** for the operational account. Registration is a
   native-lane transaction (classical-only bootstrap is allowed for the first one); the window is a
   hybrid-native message with at least 8 transactions. Neither can be done from Foundry.
4. The registered PQC identity `0x06cF…afA0` has a valid key but no open window, and it must not be
   used as the deployer: it holds no role and needs none.

Once 1–3 are true, the broadcast command in §5 completes the deployment; this document will then be
updated with the addresses and transaction hashes. Mainnet is out of scope.
