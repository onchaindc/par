# Par

**Bond servicing, secured for the post-quantum era.**

Par is an open-source bond servicing application for tokenized assets. It handles investor entitlement snapshots, coupon distributions, maturity redemption, payment claims and reconciliation, with post-quantum authorization for sensitive issuer operations using QoreChain.

## Overview

Par provides infrastructure for servicing tokenized bonds. Core functions include:

- Bond configuration and payment schedules
- Historical ownership snapshots
- Coupon calculation and distribution
- Maturity redemption
- Investor payment claims
- Payment reconciliation
- ML-DSA authorization through QoreChain's PQC verification capabilities

This describes the planned product scope. Features listed below are not yet implemented unless explicitly stated otherwise.

## Architecture

Planned components:

- Smart contracts for bond configuration, entitlement snapshots, coupon distribution, redemption and claims (Solidity / Foundry)
- Off-chain services or scripts for schedule calculation, reconciliation and reporting (TypeScript)
- Authorization layer using QoreChain post-quantum verification for sensitive issuer operations

Details of contract design, data models and integration points will be added as the implementation progresses.

## Development

Repository structure (initial):

- `contracts/` — Solidity contracts
- `test/` — Foundry tests
- `script/` — Foundry deployment and utility scripts
- `app/` — TypeScript application code
- `docs/` — additional documentation

Setup and build instructions will be added once tooling is configured.

## Security

Sensitive issuer operations are intended to require post-quantum authorization via QoreChain's ML-DSA verification capabilities. Concrete authorization flows, key management and threat model will be documented as they are designed and implemented.

No contracts or authorization mechanisms are deployed or active in this repository yet.

## Status

| Component | Status |
|-----------|--------|
| Bond configuration and schedules | planned |
| Historical ownership snapshots | planned |
| Coupon calculation and distribution | planned |
| Maturity redemption | planned |
| Investor payment claims | planned |
| Payment reconciliation | planned |
| ML-DSA authorization (QoreChain) | planned |
| Foundry tests | planned |
| TypeScript services / app | planned |

## License

MIT
