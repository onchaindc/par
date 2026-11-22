# Acceptance record — 21 November 2026

Final integration test of the PAR frontend against the deployed QoreChain testnet issue (chain 9800).

## Environment

| Item | Value |
|---|---|
| BondToken | `0xC3d195C5A5e2c476888050205D55DfBe3C453840` |
| BondServicing | `0x5df199D05FB83D14eaFD2823D46982bEb13512F5` |
| PqcIssuerAuthorizer | `0x8FC2F2B42C4e1bfe203FE3e4F0F126593990784F` |
| Payment token | `0xD6EE9c3918507eb7DDB77Bb6E6f74176d9140262` (pUSD, 6 decimals) |
| Operational issuer | `0x3270c190500BCA8e26da8279c88d2C54035CAFba` |
| Registered PQC identity | `0x06cFd3728F669c5d2B71474eEE63f90BBDBbafA0` |
| Deployment block | 10,462,390 |

The maturity (2030-01-01) and the 1,500 PAR supply were not modified. No mainnet interaction. The PQC
identity never sent a transaction and was not used as the operational account.

## Coupon lifecycle — verified on chain

A dedicated test period was used. Period 0 was opened on chain at block 10,463,169
(`0x28ba4e9a7b4f32fd985fca6ec818ef9a59e2c5af4bd384838b3a85b36f38aa80`) with record-date block
10,464,148. A second future period (1, record block 10,470,000) was then opened through the frontend to
verify the UI transaction path (`0x010f08449d2c3408048c8a0f3b6951da4249a585827150ac4c56b4ad2fbb0ce7`).

After the record date:

1. **Record-date ownership** — 500 PAR were transferred to `0x1111…1111` after the record date
   (`0x9b3d3e29e9b588a035e301998b221ab583aa66667f7d469b45aeea4964b9429e`). The holder balance became
   500 PAR, but `couponEntitlement(0, 0x1111…)` is **0** and `claimCoupon(0)` from that address reverts
   `NothingToClaim`. The operational account, which held 1,500 PAR at the record date, keeps the full
   entitlement.
2. **PQC authorization** — a fresh ML-DSA-87 signature was produced with the registered PQC key over the
   exact 288-byte `couponFinalizationMessage(0, deadline)` read from the UI (nonce 0,
   deadline 2026-11-21 10:00 UTC). No fixture signature was used. A tampered copy was rejected by the
   on-chain verifier; the valid signature was accepted by `0x0A01` through the UI.
3. **Finalization** — `0xfaa81187a5db15293f569bf43659568997e469c74378a9859969560214912933`,
   status 1. Coupon per token **2.5 pUSD**, required funding **3,750 pUSD**, authorization nonce **0 → 1**.
4. **Funding** — exact-amount approval
   `0x1594df596141ed8580c065aefdc85c8fc9ab8be43eaadc1ef378b877cdb94bd4`, then
   `fundCoupon` `0xe6864956c1d54ac94d9952c3da272711e6f3955a3b2a417b5a5ca49d4c5367ce` for 3,750 pUSD.
5. **Claim** —
   `0x010bcae6a7409f50d47eff60825eaf87815c7d61a54c5b9c5f8745e2389823a9`; the operational holder
   received 3,750 pUSD, `hasClaimedCoupon(0, holder)` is true, and the servicing contract balance returned
   to **0**.
6. **Reconciliation** — `required = funded = claimed = 3,750 pUSD`, `outstanding = 0`, nonce 1, contract
   balance 0. The UI figures matched these reads.

All six transactions were submitted through the app's wallet layer (a signing EIP-1193 bridge backed by
the operational Foundry key, held only in the test process). The UI showed wallet-signing, pending,
confirmed and failed states; the confirmed toast hashes above are the real transaction hashes.

## Permissions and reverts

Read-only `eth_call` checks, all passing:

| Check | Result |
|---|---|
| Outsider opens a period / funds a coupon | `AccessControlUnauthorizedAccount` |
| Duplicate record date | `RecordDateAlreadyUsed` |
| Record date not increasing | `RecordDateOrder` |
| Claim or fund before finalization | `CouponNotFinalized` |
| Redemption before maturity | `BeforeMaturity` |
| Claim before declaration | `RedemptionNotDeclared` |
| Second claim | `AlreadyClaimed` |
| Refinalize | `CouponAlreadyFinalized` |
| Over-fund | `FundingExceedsRequirement` |
| Post-record buyer claims | `NothingToClaim` |
| Forged 4,627-byte ML-DSA-87 signature | `isAuthorized` returns false |

The UI also disables controls without the required role and reports "read-only for this wallet", and
surfaces a wallet rejection as `Transaction failed · The wallet rejected the request.` (fixed during
acceptance: viem previously reduced it to "An unknown RPC error occurred").

## Frontend checks

Automated browser checks with Playwright/Chromium at 1440, 768 and 390 px (61 checks, all passing):

- issue cover renders its 3D certificate, four-cell terms tape and entry CTA at every width; the seal does
  not overlap certificate text; header height and navigation placement are checked (static desktop pill bar,
  fixed mobile/tablet bottom bar);
- the holder register renders both current holders and no longer reports “No token holders” when supply exists;
- no horizontal page overflow (page delta 0 px at all widths), no card outside the viewport, no clipped
  buttons/tabs/pills, navigation present, no uncaught page errors;
- Fraunces display font, Inter body font and IBM Plex Mono numerics loaded; the mobile tab strip scrolls
  horizontally by design while the page itself does not overflow;
- wallet connection, role detection (issuer + treasurer), account change to a role-less address, disconnect,
  wrong-network banner and `Switch to 9800`, and the no-wallet notice and error;
- claims show `CLAIMED`, reconciliation shows 3,750 funded/claimed and 0 outstanding, and investor balance
  reflects the post-record transfer (1,000 PAR).

Screenshots were captured during the checks, but this sandbox's file reader would not attach images, so
pixel-level visual review was done through DOM geometry and computed styles rather than by eye. A human
should still review the rendered page at the preview URL for aesthetic judgement.

## Not verified

- **Redemption lifecycle** (`declareRedemption`, `fundRedemption`, `claimPrincipal`): maturity is
  2030-01-01. The contract rejects declaration with `BeforeMaturity` (verified) and the UI disables it; the
  funded/claimed redemption path remains untested on chain.
- **Redemption signing tooling**: `tools/pqc-sign/authorize.mjs` only builds coupon-finalization messages.
  The redemption panel can verify a pasted signature over the on-chain message, but producing that
  signature requires an ML-DSA-87 signer invoked directly over the displayed bytes.
- **Real wallet extension UI**: tests used an EIP-1193 signing bridge, not the MetaMask/Rabby extension
  popups. Account/chain event handling follows the standard interface but extension-specific behaviour was
  not exercised.
- **QoreChain EVM authorization-window expiry**: the window was open throughout; the node's window error is
  shown verbatim but no expiry scenario was triggered.
- **Loading skeleton timing** was not instrumented; loading, empty, confirmed and failed states were
  observed, pending state appears only briefly.

## Running the checks

```bash
bun run typecheck
bun run build
forge test
bun scripts/acceptance/ui.mjs                 # layout, wallet and network states
bun scripts/acceptance/negative.mjs           # permission and revert matrix (pre-finalization)
bun scripts/acceptance/open-period.mjs        # UI-driven period opening
bun scripts/acceptance/lifecycle.mjs          # finalize, fund and claim through the UI
bun scripts/acceptance/post-lifecycle.mjs     # post-claim reconciliation and rejection state
```

The live scripts require `PAR_DEPLOYER_PRIVATE_KEY`, `PAR_PQC_KEY_FILE` (defaults to the signer path used in
this run) and an open EVM authorization window. The private key is read only in the Node process and is
never printed or sent to the page.
