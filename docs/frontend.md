# PAR bond-servicing frontend

A single-page Vite + React + TypeScript application that reads the deployed PAR contracts on QoreChain
testnet (chain 9800) and submits transactions through the user's injected EVM wallet.

## Issue cover

The first load shows an issue cover rather than a dashboard: an oversized issue title, a four-cell terms tape
(interest, frequency, maturity, face value), a dark three-dimensional live certificate with the on-chain
supply, holders, interest per bond and the next interest date, and a projected interest calendar. Below it,
three plain-language mechanics, the two-key model, a live payout ledger and a closing call to action explain
the product before entry. The certificate tilts with the pointer on desktop, floats gently, and becomes flat
with a static seal on mobile. The cover uses the same live reads as the app — nothing is static marketing
data. Entering the desk stores a session flag; the brand mark returns to the cover.

## Shell and navigation

A compact sticky header carries the monogram, wordmark, a glass pill navigation and the wallet chip. At
≤980 px the pill navigation becomes a fixed bottom bar with icons and short labels, and the shell reserves
space for it. The footer is a dark, rounded panel with product links, live block/refresh state, contract
address and a plain testnet disclaimer. Alerts and transaction toasts share rounded, icon-led surfaces with
plain-language titles; motion respects `prefers-reduced-motion`.

## Data sources

Everything displayed is a live contract read; there are no fixtures, cached server responses or fabricated
metrics. Reads use `https://evm-testnet.qore.host` and refresh every 15 seconds, plus a manual refresh.

| Source | Used for |
|---|---|
| `BondToken` | name, symbol, decimals, cap, total supply, balances, `Transfer` events for the holder register |
| `BondServicing` | terms, coupon periods, per-period status, entitlements, claims, redemption, authorization nonce, roles |
| demo `pUSD` | symbol, decimals, supply, servicing balance, holder balance, allowance |
| `PqcIssuerAuthorizer` | `pqcIssuer()`, `isAuthorized(issuer, message, signature)` |
| `0x0A02` precompile | `pqcKeyStatus(issuer)` raw call, decoded as the four-field (registered, algorithm, pubkey, possession) layout |

Holder discovery scans `Transfer` logs from the deployment block (10,462,390) in 9,000-block chunks, caches
successful ranges in memory and resumes from the last scanned block. It then reads each current balance. The
register therefore reflects token movements, not a stored list; the contract has no holder enumeration. If a
chunk cannot be read, the UI says the holder list is unavailable instead of claiming there are no holders.

## Wallet and network

- EIP-1193 injected wallet only (MetaMask, Rabby, other injected wallets). No WalletConnect project ID and no
  server-side signer.
- The app expects chain **9800** (`QoreChain Diana`) and offers `wallet_switchEthereumChain`, adding the chain
  with `https://evm-testnet.qore.host` if the wallet does not know it.
- Reads work without a wallet for everyone. Writes require a connected wallet on chain 9800 and the relevant
  on-chain role. Private keys and the PQC signing key are never shipped in the frontend bundle.
- The app never asks for, stores or transmits a private key, recovery phrase or PQC key file. It only asks the
  wallet to sign normal EVM transactions the user reviews.

QoreChain also requires the sending account to have its own registered ML-DSA-87 key and an open EVM
authorization window. Those are native-lane prerequisites and are not opened by the frontend; if they are
missing, the node rejects the transaction and the UI shows the returned error verbatim.

## Issuer operations and PQC authorization

`finalizeCoupon` and `declareRedemption` require both `ISSUER_ROLE` and a fresh ML-DSA-87 signature from the
registered PQC identity. The frontend keeps the two identities separate:

1. The connected operational wallet supplies the role and the transaction. It must never be the PQC identity.
2. The PQC identity signs offline. The UI displays the exact `couponFinalizationMessage(periodId, deadline)` or
   `redemptionDeclarationMessage(recordDateBlock, deadline)` bytes read from the contract, the current
   `authorizationNonce`, and the deadline the caller chooses.
3. The signature is produced on the signer host and pasted into the panel. The UI validates its length
   (4,627 bytes) and verifies it on chain with `PqcIssuerAuthorizer.isAuthorized` before enabling submission.
4. The operational wallet submits the transaction. The nonce is consumed on success, so a signature cannot be
   replayed or reused for a different deadline.

Coupon finalization signing uses the repository tool:

```bash
cd tools/pqc-sign
npm run authorize -- \
  --issuer 0x06cFd3728F669c5d2B71474eEE63f90BBDBbafA0 \
  --key-file <registered-signer-key>.dilithium \
  --servicing 0x5df199D05FB83D14eaFD2823D46982bEb13512F5 \
  --period-id 0 --deadline <unix-deadline>
```

Paste the `signature.hex` value from the JSON report. `authorize.mjs` currently covers coupon finalization
only; redemption declaration uses the same message and signing scheme but needs an ML-DSA-87 signer invoked
over the `redemptionDeclarationMessage` bytes shown in the panel. The redemption UI is disabled until the
maturity date (2030-01-01) regardless.

Funding (`fundCoupon`, `fundRedemption`) requires `TREASURER_ROLE` and a pUSD allowance for the servicing
contract. The UI exposes an `approve` step when the allowance is insufficient and sends exact-amount
approvals rather than unlimited ones.

## Application states

- Loading: skeletons while the first read runs.
- Error: the last successful data set is retained and labelled if a refresh fails; a full read failure shows
  an error with retry.
- Empty: no opened rounds, no holders, incomplete holder scans, unapproved periods, undeclared principal and
  no ready payments each have explicit empty states.
- Transaction: signing, pending, confirmed and failed states surface in a dismissible toast with the hash and a
  decoded wallet/revert message. Reads refresh after confirmation.
- Access: role checks are shown per wallet; controls are disabled with the reason (no wallet, wrong chain,
  missing role, unfunded distribution).

## Verification

- `bun run build` — TypeScript and Vite production build.
- ABI and decode validation against the live deployment: `terms()`, `couponPeriodCount()`, `redemption()`,
  `authorizationNonce()`, `ISSUER_ROLE`/`hasRole`, bond metadata, payment token reads, the 2,752-byte
  `pqcKeyStatus` response and `Transfer` log scanning were all exercised against chain 9800.
- A full coupon lifecycle was run through the UI on chain 9800: period opening, a fresh ML-DSA-87 signature
  over the contract message, on-chain signature verification, finalization, exact-amount approval, funding
  and a holder claim, with record-date checkpointing checked by a post-record transfer.
- Playwright checks desktop/tablet/mobile geometry for the issue cover and app, the 3D certificate and seal
  overlap, header height, floating bottom navigation, page overflow, holder register rendering, wallet
  connection, account changes, disconnect, wrong-network switching, role gating, transaction confirmation and
  wallet-rejection states (61 checks).

The transaction hashes, reconciliation figures and remaining gaps are recorded in
[acceptance.md](acceptance.md). Redemption remains untested because maturity is in 2030.

Custom Solidity errors are included in the ABIs so viem decodes reverts such as `AlreadyClaimed` and
`FundingExceedsRequirement` into readable text (`Contract reverted: …`).

## Limitations

- The holder register is reconstructed from cached 9,000-block log scans. A failed chunk leaves the list
  explicitly marked unavailable rather than silently empty; an RPC that refuses every chunk still cannot
  enumerate holders.
- The projected coupon calendar is derived from maturity and frequency. It is not an on-chain schedule; actual
  periods are created by the issuer with block-number record dates.
- No historical price, yield or off-chain data is shown.
- No mainnet support. Addresses and chain ID are fixed for the testnet deployment.
- Write access is role-gated by the contracts; it is not “everyone” access. The demo operating and approval
  keys are intentionally absent from the repository and the web bundle. A public write demo requires a
  separately hosted, rate-limited signer service; shipping the key to the browser would give every visitor the
  issuer role and would be flagged by wallet providers.
- Wallet writes were exercised with an EIP-1193 signing bridge, not a real browser extension.
- Redemption is disabled and untested before maturity; producing its signature is not covered by
  `tools/pqc-sign/authorize.mjs`, which currently builds coupon-finalization messages only.
