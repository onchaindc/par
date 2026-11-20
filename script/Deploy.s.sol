// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {BondToken} from "../contracts/BondToken.sol";
import {BondServicing} from "../contracts/BondServicing.sol";
import {PqcIssuerAuthorizer} from "../contracts/access/PqcIssuerAuthorizer.sol";
import {DemoPaymentToken} from "./DemoPaymentToken.sol";

/// @title Deploy
/// @notice Reproducible QoreChain testnet deployment for the PAR demo bond.
/// @dev Deploys BondToken, PqcIssuerAuthorizer and BondServicing, grants the operational roles and
/// optionally mints the fixture-sized demo supply. The broadcaster is the operational EVM issuer:
/// it holds DEFAULT_ADMIN_ROLE, ISSUER_ROLE and MINTER_ROLE, while the registered PQC identity only
/// signs off chain and holds no role. No key, mnemonic or signed material is stored in this script;
/// forge supplies the sender with --private-key, --keystore, --ledger or --mnemonic.
///
/// Simulation (no broadcast):
///   forge script script/Deploy.s.sol --rpc-url https://evm-testnet.qore.host --sender <operational>
///
/// Broadcast (only with an explicit go-ahead and a funded, window-enabled deployer):
///   forge script script/Deploy.s.sol --rpc-url https://evm-testnet.qore.host \
///     --private-key $PAR_DEPLOYER_PRIVATE_KEY --broadcast
///
/// Every parameter can be overridden with the environment variables documented in
/// docs/deployment.md. The defaults are the fixture terms used by the Solidity tests.
contract Deploy is Script {
    /// @notice Registered ML-DSA-87 identity for the demo issuer. Holds no EVM role.
    address internal constant DEFAULT_PQC_ISSUER = 0x06cFd3728F669c5d2B71474eEE63f90BBDBbafA0;

    /// @dev Fixture terms (see test/BondServicing.t.sol): 5% annual, semi-annual, 100 pUSD face,
    /// 1,500 bond tokens outstanding and a 2030-01-01 maturity (the fixture signature deadline).
    uint256 internal constant DEFAULT_MATURITY = 1_893_456_000;
    uint16 internal constant DEFAULT_COUPON_RATE_BPS = 500;
    uint8 internal constant DEFAULT_PAYMENTS_PER_YEAR = 2;
    uint128 internal constant DEFAULT_FACE_VALUE_PER_TOKEN = 100e6;
    uint256 internal constant DEFAULT_TOKEN_CAP = 1_500_000e18;
    uint256 internal constant DEFAULT_DEMO_SUPPLY = 1_500e18;
    uint256 internal constant DEFAULT_PAYMENT_SUPPLY = 10_000_000e6;

    struct Config {
        address pqcIssuer;
        address operationalIssuer;
        address treasurer;
        address paymentToken;
        uint256 paymentSupply;
        string name;
        string symbol;
        uint256 cap;
        uint64 maturity;
        uint16 couponRateBps;
        uint8 paymentsPerYear;
        uint128 faceValuePerToken;
        uint256 demoSupply;
        address demoHolder;
    }

    struct Deployment {
        address bond;
        address authorizer;
        address servicing;
        address paymentToken;
        address operationalIssuer;
        address treasurer;
        address pqcIssuer;
    }

    error ZeroAddress();
    error OperationalIssuerIsNotSender(address sender, address operationalIssuer);
    error MaturityNotFuture(uint64 maturity);
    error CapTooSmall(uint256 cap, uint256 demoSupply);
    error InvalidPaymentsPerYear(uint8 paymentsPerYear);
    error RoleNotGranted(bytes32 role, address account);
    error TermsMismatch();
    error PqcIdentityMismatch();

    /// @notice Reads the deployment configuration from the environment.
    function config() public view returns (Config memory c) {
        c.pqcIssuer = vm.envOr("PAR_PQC_ISSUER", DEFAULT_PQC_ISSUER);
        c.operationalIssuer = vm.envOr("PAR_OPERATIONAL_ISSUER", msg.sender);
        c.treasurer = vm.envOr("PAR_TREASURER", c.operationalIssuer);
        c.paymentToken = vm.envOr("PAR_PAYMENT_TOKEN", address(0));
        c.paymentSupply = vm.envOr("PAR_PAYMENT_SUPPLY", DEFAULT_PAYMENT_SUPPLY);
        c.name = vm.envOr("PAR_TOKEN_NAME", string("Par Bond 2030"));
        c.symbol = vm.envOr("PAR_TOKEN_SYMBOL", string("PAR30"));
        c.cap = vm.envOr("PAR_TOKEN_CAP", DEFAULT_TOKEN_CAP);
        c.maturity = uint64(vm.envOr("PAR_MATURITY", DEFAULT_MATURITY));
        c.couponRateBps = uint16(vm.envOr("PAR_COUPON_RATE_BPS", uint256(DEFAULT_COUPON_RATE_BPS)));
        c.paymentsPerYear = uint8(vm.envOr("PAR_PAYMENTS_PER_YEAR", uint256(DEFAULT_PAYMENTS_PER_YEAR)));
        c.faceValuePerToken =
            uint128(vm.envOr("PAR_FACE_VALUE_PER_TOKEN", uint256(DEFAULT_FACE_VALUE_PER_TOKEN)));
        c.demoSupply = vm.envOr("PAR_DEMO_SUPPLY", DEFAULT_DEMO_SUPPLY);
        c.demoHolder = vm.envOr("PAR_DEMO_HOLDER", c.operationalIssuer);
    }

    function run() external returns (Deployment memory d) {
        Config memory c = config();
        vm.startBroadcast();
        d = deploy(c);
        vm.stopBroadcast();
        _log(d);
    }

    /// @notice Deploys and configures the demo bond. Separated from {run} so tests can execute it
    /// without a broadcast.
    function deploy(Config memory c) public returns (Deployment memory d) {
        if (c.pqcIssuer == address(0) || c.operationalIssuer == address(0) || c.treasurer == address(0)) {
            revert ZeroAddress();
        }
        if (c.demoSupply != 0 && c.demoHolder == address(0)) revert ZeroAddress();
        if (c.operationalIssuer != msg.sender) {
            revert OperationalIssuerIsNotSender(msg.sender, c.operationalIssuer);
        }
        if (c.maturity <= block.timestamp) revert MaturityNotFuture(c.maturity);
        if (c.demoSupply > c.cap) revert CapTooSmall(c.cap, c.demoSupply);
        if (c.paymentsPerYear == 0 || 12 % c.paymentsPerYear != 0) {
            revert InvalidPaymentsPerYear(c.paymentsPerYear);
        }

        d.operationalIssuer = c.operationalIssuer;
        d.treasurer = c.treasurer;
        d.pqcIssuer = c.pqcIssuer;

        if (c.paymentToken == address(0)) {
            d.paymentToken = address(new DemoPaymentToken(c.treasurer, c.paymentSupply));
        } else {
            d.paymentToken = c.paymentToken;
        }

        BondToken bond = new BondToken(c.name, c.symbol, c.operationalIssuer, c.cap);
        PqcIssuerAuthorizer authorizer = new PqcIssuerAuthorizer(c.pqcIssuer);
        BondServicing servicing = new BondServicing(
            bond,
            authorizer,
            c.operationalIssuer,
            d.paymentToken,
            c.maturity,
            c.couponRateBps,
            c.paymentsPerYear,
            c.faceValuePerToken
        );

        d.bond = address(bond);
        d.authorizer = address(authorizer);
        d.servicing = address(servicing);

        // The broadcaster is the operational issuer, so it can grant its own roles and mint.
        bond.grantRole(bond.MINTER_ROLE(), c.operationalIssuer);
        servicing.grantRole(servicing.TREASURER_ROLE(), c.treasurer);
        if (c.demoSupply != 0) {
            bond.mint(c.demoHolder, c.demoSupply);
        }

        _verify(bond, authorizer, servicing, c, d);
    }

    /// @dev Fails the deployment if any role, identity or term does not match the intended setup.
    function _verify(
        BondToken bond,
        PqcIssuerAuthorizer authorizer,
        BondServicing servicing,
        Config memory c,
        Deployment memory d
    ) private view {
        if (authorizer.pqcIssuer() != c.pqcIssuer) revert PqcIdentityMismatch();
        if (!bond.hasRole(bond.DEFAULT_ADMIN_ROLE(), c.operationalIssuer)) {
            revert RoleNotGranted(bond.DEFAULT_ADMIN_ROLE(), c.operationalIssuer);
        }
        if (!bond.hasRole(bond.MINTER_ROLE(), c.operationalIssuer)) {
            revert RoleNotGranted(bond.MINTER_ROLE(), c.operationalIssuer);
        }
        if (!servicing.hasRole(servicing.DEFAULT_ADMIN_ROLE(), c.operationalIssuer)) {
            revert RoleNotGranted(servicing.DEFAULT_ADMIN_ROLE(), c.operationalIssuer);
        }
        if (!servicing.hasRole(servicing.ISSUER_ROLE(), c.operationalIssuer)) {
            revert RoleNotGranted(servicing.ISSUER_ROLE(), c.operationalIssuer);
        }
        if (!servicing.hasRole(servicing.TREASURER_ROLE(), c.treasurer)) {
            revert RoleNotGranted(servicing.TREASURER_ROLE(), c.treasurer);
        }

        BondServicing.BondTerms memory terms = servicing.terms();
        if (
            terms.paymentToken != d.paymentToken || terms.maturity != c.maturity
                || terms.couponRateBps != c.couponRateBps || terms.paymentsPerYear != c.paymentsPerYear
                || terms.faceValuePerToken != c.faceValuePerToken
        ) revert TermsMismatch();
    }

    function _log(Deployment memory d) private pure {
        console2.log("PAR demo deployment");
        console2.log("  BondToken           ", d.bond);
        console2.log("  PqcIssuerAuthorizer ", d.authorizer);
        console2.log("  BondServicing       ", d.servicing);
        console2.log("  Payment token       ", d.paymentToken);
        console2.log("  Operational issuer  ", d.operationalIssuer);
        console2.log("  Treasurer           ", d.treasurer);
        console2.log("  Registered PQC      ", d.pqcIssuer);
    }
}
