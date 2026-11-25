# Runbook: finalize coupon period 1 and fund it

State verified on-chain 2026-11-25 (RPC `https://evm-testnet.qore.host`, chain ID 9800).

## Current state

| Item | Value |
| --- | --- |
| BondServicing | `0x5df199D05FB83D14eaFD2823D46982bEb13512F5` |
| Bond token | `0xC3d195C5A5e2c476888050205D55DfBe3C453840` |
| PQCAuthorizer | `0x8FC2F2B42C4e1bfe203FE3e4F0F126593990784F` |
| Payment token | `0xD6EE9c3918507eb7DDB77Bb6E6f74176d9140262` (6 decimals) |
| Terms | 500 bps annual, 2 payments/year, face value 100 per bond token, maturity 2030-01-01 |
| PQC issuer identity | `0x06cFd3728F669c5d2B71474eEE63f90BBDBbafA0` (registered, ML-DSA-87, possession proven) |
| `authorizationNonce` | `1` (the next message must use nonce 1; `eth_call` reads it automatically) |
| Period 0 | finalized, funded 3,750, fully claimed — done |
| **Period 1** | record block **10,470,000**, **reached** (current block ≈ 10,710,000), **not finalized** |
| Supply at record block | 1,500 bond tokens (1.5e18 × 1,000) |
| Preview coupon per token | `2,500,000` base units = 2.50 payment tokens |
| Preview required funding | `3,750,000,000` base units = **3,750 payment tokens** |
| BondServicing payment-token balance | `0` — funding must come in after finalize |

## Why finalize is blocked on you

`finalizeCoupon(uint256 periodId, uint64 deadline, bytes signature)` needs two distinct identities:

1. **PQC issuer** — signs the action message off chain with the ML-DSA-87 key file
   (never needs a transaction). The key lives outside the repo, e.g.
   `~/.qorechaind/pqc/par-issuer-mldsa.dilithium`.
2. **Operational issuer** — the EVM wallet holding `ISSUER_ROLE`; it broadcasts
   `finalizeCoupon` carrying that signature. By design it cannot be the same key as the
   PQC identity.

## Step 1 — sign the finalization message (PQC issuer, offline)

The app's issuer panel prints this command; run it where the key file is:

```bash
cd tools/pqc-sign
npm install   # once
DEADLINE=$(date -d '+1 hour' +%s)   # unix seconds; signature voids after this
npm run authorize -- \
  --issuer 0x06cFd3728F669c5d2B71474eEE63f90BBDBbafA0 \
  --key-file ~/.qorechaind/pqc/par-issuer-mldsa.dilithium \
  --servicing 0x5df199D05FB83D14eaFD2823D46982bEb13512F5 \
  --period-id 1 --deadline $DEADLINE
```

The tool reads `couponFinalizationMessage(1, deadline)` from the deployed contract
(that call bakes in the current nonce 1, chain ID, both contract addresses and the
period-1 record block), signs it with ML-DSA-87, live-verifies via the `0x0A01`
precompile `eth_call`s, and prints a ~4,627-byte hex signature. **Save the deadline
value you used** — the transaction must repeat it exactly.

## Step 2 — broadcast finalize (operational issuer)

Either:

- **App UI**: start the app, connect the `ISSUER_ROLE` wallet, open coupon period 1 —
  it shows "Ready to finalize". Paste the signature hex and the same deadline, submit.
- **Raw calldata** (any wallet): `finalizeCoupon(uint256,uint64,bytes)` with
  `periodId=1`, your deadline, the signature bytes.

Success emits `CouponFinalized(1, 10470000, 1.5e21, 2500000, 3750000000, 1, deadline)`
and bumps `authorizationNonce` to 2.

## Step 3 — fund period 1 (treasurer)

The contract must hold the full 3,750 payment tokens before holders can claim:

```bash
# with the TREASURER_ROLE wallet
approve(spending=BondServicing, amount=3750000000)          # payment token
fundCoupon(periodId=1, amount=3750000000)                   # BondServicing
```

Partial top-ups are allowed; over-funding reverts. Once `funded == requiredFunding`,
period-1 claims open for everyone holding bond tokens at block 10,470,000.

## Step 4 — open period 2

`openCouponPeriod(recordDateBlock)` with a block strictly greater than 10,470,000.
Pick it well in the future so holders have time to see the record date.
`setCouponRecordDate` can still move it until the block is reached.

## Redemption later

`declareRedemption` is PQC-gated the same way but reverts with `BeforeMaturity`
before 2030-01-01 — nothing to do yet.
