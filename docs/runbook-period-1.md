# Runbook: coupon lifecycle on the redeployed PAR contracts

State verified on-chain 2026-11-26 (RPC `https://evm-testnet.qore.host`, chain ID 9800).
This replaces the previous runbook: the November-21 deployment's roles were held by a key
that no longer exists, so the contracts were redeployed with every role assigned to keys
the wallet owner controls.

## Current state

| Item | Value |
| --- | --- |
| Bond token | `0xD55923A5ecFd2C27A19fE4129fE1A3DB32aeffBe` (Par Bond 2030, PAR30, cap 1,500,000) |
| BondServicing | `0x01550DF995A372Ea14f66a5041e9D5840B0A2766` |
| PqcIssuerAuthorizer | `0xB3C0CD313703b92EbaA7B837e4d45a5aA4eBa4F9` |
| Payment token | `0x031530a8cB484bE835d42F35a73712d50E474691` (pUSD, 6 decimals) |
| Terms | 500 bps annual, 2 payments/year, face value 100 pUSD per bond token, maturity 2030-01-01 |
| Registered PQC issuer identity | `0x06cFd3728F669c5d2B71474eEE63f90BBDBbafA0` — **the owner's QoreX Account 1**, ML-DSA-87 registered with proof of possession (fingerprint `396aced0…5f1c59`) |
| Operational issuer / treasurer / minter / admin | `0x0075f079DD293d1b84c90B35E321b3D0A4899D3a` — **the owner's Ethereum (coin 60) account** |
| Supply minted | 1,500 PAR to the operational issuer |
| pUSD minted | 10,000,000 pUSD to the treasurer (same address) |
| Deployment | blocks 10,758,187–10,758,201 on 2026-11-26; deployer `0xA185dfF11f43430598b08E0116a6CEd9D6Ac70c5` renounced every role after hand-over (verified on-chain: no residual roles) |
| Periods | none opened yet — period 0 must be opened through the app before any signing |

## Division of keys (all held by the owner)

- **QoreX Account 1** (`qor1qm8axu50…5cvl` = `0x06cf…afa0`): signs the 288-byte coupon
  authorization message with its registered ML-DSA-87 key. Holds no EVM role, pays no gas.
- **QoreX Ethereum (coin 60) account** (`0x0075f079…`): broadcasts `openPeriod`,
  `finalizeCoupon`, `approve` + `fundCoupon`, `claimCoupon`. This account must hold test QOR
  for gas and an open EVM authorization window (QoreX → EVM access screen).

## Why finalize needs two identities

`finalizeCoupon(uint256 periodId, uint64 deadline, bytes signature)` needs two distinct
identities, by design a single compromised keypair can never hold both:

1. **PQC issuer** — signs the action message off chain with the ML-DSA-87 key (never needs
   a transaction). This is QoreX Account 1's registered key.
2. **Operational issuer** — the EVM wallet holding `ISSUER_ROLE`; it broadcasts
   `finalizeCoupon` carrying that signature.

## Sequence for the first coupon period

1. Fund the Ethereum (coin 60) account with test QOR (send from Account 1 or the faucet),
   then send one native transaction from it so its ML-DSA-87 key registers, then open its
   EVM access window in QoreX.
2. Connect to the app with that account (in QoreX's dApp browser or via WalletConnect).
3. **Open period** — the app computes the record date; submit `openPeriod`.
4. **Sign** — the UI shows the exact 288-byte `couponFinalizationMessage(periodId, deadline)`.
   Sign it with Account 1's ML-DSA-87 key (browser signer page `/pqc-signer.html` or the
   QoreX message-signing flow when available), paste the signature, submit `finalizeCoupon`
   (the authorization nonce starts at 0 on the new deployment).
5. **Fund** — approve BondServicing for pUSD, then `fundCoupon` for the exact required amount
   (face 100 × 1,500 supply × 2.5% semi-annual = 3,750 pUSD at full supply).
6. **Claim** — holders call `claimCoupon` after finalization.

### Signing paths for step 4

**A. In the browser (no terminal needed).** Open `/pqc-signer.html` on the deployed app:
paste or file-load the ML-DSA-87 secret key, set the period id and deadline, press
"Sign & verify". The page reads the message from BondServicing via `eth_call`, signs with
the local key, verifies against the registered public key and the `0x0A01` precompile, and
produces the signature to copy. The secret never leaves the page. Today the registered
identity's secret lives inside QoreX Account 1; if QoreX grows a message-signing export
or the key file is recovered, this page signs directly.

**B. On a signer host (terminal).** The app's issuer panel prints the equivalent
`tools/pqc-sign authorize` command for the key file, if that file is ever restored from
backup.

## On the old deployment

`BondServicing` `0x5df199…12F5`, `BondToken` `0xC3d195…3840`, the authorizer
`0x8FC2…784F` and payment token `0xD6EE…0262` remain on chain but are inert: their only
admin/issuer key was generated inside the acceptance test process and was not persisted.
No value is recoverable from them; the new deployment reuses the identical terms.
