// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {DemoPaymentToken} from "../script/DemoPaymentToken.sol";
import {BondToken} from "../contracts/BondToken.sol";
import {BondServicing} from "../contracts/BondServicing.sol";
import {PqcIssuerAuthorizer} from "../contracts/access/PqcIssuerAuthorizer.sol";

/// @dev Runs the deployment script on the local EVM (no broadcast) and checks the configured state.
/// The script contract is the caller, so it plays the broadcaster/operational issuer, exactly as
/// forge's broadcast impersonation does on a real run.
contract DeployScriptTest is Test {
    address private pqcIssuer = 0x06cFd3728F669c5d2B71474eEE63f90BBDBbafA0;
    address private treasurer = makeAddr("treasurer");
    address private demoHolder = makeAddr("demoHolder");

    function setUp() public {
        vm.warp(1_800_000_000);
    }

    function _config(address operationalIssuer) private view returns (Deploy.Config memory c) {
        c.pqcIssuer = pqcIssuer;
        c.operationalIssuer = operationalIssuer;
        c.treasurer = treasurer;
        c.paymentToken = address(0);
        c.paymentSupply = 10_000_000e6;
        c.name = "Par Bond 2030";
        c.symbol = "PAR30";
        c.cap = 1_500_000e18;
        c.maturity = 1_893_456_000;
        c.couponRateBps = 500;
        c.paymentsPerYear = 2;
        c.faceValuePerToken = 100e6;
        c.demoSupply = 1_500e18;
        c.demoHolder = demoHolder;
    }

    function testDeploysAndConfiguresDemoBond() public {
        Deploy deployer = new Deploy();
        // Broadcast impersonation, reproduced locally: the script contract acts as the sender.
        vm.prank(address(deployer));
        Deploy.Deployment memory d = deployer.deploy(_config(address(deployer)));

        assertTrue(d.bond != address(0) && d.authorizer != address(0) && d.servicing != address(0));
        assertTrue(d.paymentToken != address(0));
        assertEq(d.operationalIssuer, address(deployer));

        BondToken bond = BondToken(d.bond);
        PqcIssuerAuthorizer authorizer = PqcIssuerAuthorizer(d.authorizer);
        BondServicing servicing = BondServicing(d.servicing);

        // Two identities stay separate: the operational issuer holds every role, the PQC identity none.
        assertEq(authorizer.pqcIssuer(), pqcIssuer);
        assertTrue(bond.hasRole(bond.DEFAULT_ADMIN_ROLE(), address(deployer)));
        assertTrue(bond.hasRole(bond.MINTER_ROLE(), address(deployer)));
        assertTrue(servicing.hasRole(servicing.DEFAULT_ADMIN_ROLE(), address(deployer)));
        assertTrue(servicing.hasRole(servicing.ISSUER_ROLE(), address(deployer)));
        assertTrue(servicing.hasRole(servicing.TREASURER_ROLE(), treasurer));
        assertFalse(servicing.hasRole(servicing.ISSUER_ROLE(), pqcIssuer));
        assertFalse(servicing.hasRole(servicing.TREASURER_ROLE(), pqcIssuer));
        assertEq(servicing.authorizationNonce(), 0);

        // Fixture terms.
        BondServicing.BondTerms memory terms = servicing.terms();
        assertEq(terms.paymentToken, d.paymentToken);
        assertEq(terms.maturity, 1_893_456_000);
        assertEq(terms.couponRateBps, 500);
        assertEq(terms.paymentsPerYear, 2);
        assertEq(terms.faceValuePerToken, 100e6);
        assertEq(bond.cap(), 1_500_000e18);

        // Fixture supply: 1,500 bond tokens, coupon 2.5 pUSD and principal 100 pUSD per token.
        assertEq(bond.totalSupply(), 1_500e18);
        assertEq(bond.balanceOf(demoHolder), 1_500e18);
        assertEq(
            (uint256(terms.faceValuePerToken) * terms.couponRateBps) / (10_000 * terms.paymentsPerYear),
            2_500_000
        );

        // Demo settlement token: six decimals, entire supply held by the treasurer.
        assertEq(DemoPaymentToken(d.paymentToken).decimals(), 6);
        assertEq(DemoPaymentToken(d.paymentToken).balanceOf(treasurer), 10_000_000e6);
        assertEq(DemoPaymentToken(d.paymentToken).totalSupply(), 10_000_000e6);
    }

    function testRejectsPqcIdentityAsOperationalIssuer() public {
        Deploy deployer = new Deploy();
        // The broadcaster would be the PQC identity itself, which the servicing constructor rejects.
        vm.prank(pqcIssuer);
        vm.expectRevert(BondServicing.IssuerIsPqcIdentity.selector);
        deployer.deploy(_config(pqcIssuer));
    }

    function testRejectsOperationalIssuerThatIsNotTheSender() public {
        Deploy deployer = new Deploy();
        address someoneElse = makeAddr("someoneElse");
        vm.expectRevert(
            abi.encodeWithSelector(Deploy.OperationalIssuerIsNotSender.selector, address(this), someoneElse)
        );
        deployer.deploy(_config(someoneElse));
    }

    function testRejectsPastMaturity() public {
        Deploy deployer = new Deploy();
        Deploy.Config memory c = _config(address(deployer));
        c.maturity = uint64(block.timestamp);
        vm.prank(address(deployer));
        vm.expectRevert(abi.encodeWithSelector(Deploy.MaturityNotFuture.selector, c.maturity));
        deployer.deploy(c);
    }

    function testSkipsDemoMintWhenSupplyIsZero() public {
        Deploy deployer = new Deploy();
        Deploy.Config memory c = _config(address(deployer));
        c.demoSupply = 0;
        vm.prank(address(deployer));
        Deploy.Deployment memory d = deployer.deploy(c);
        assertEq(BondToken(d.bond).totalSupply(), 0);
    }

    function testReadsFixtureDefaultsFromEnvironment() public {
        Deploy.Config memory c = new Deploy().config();
        assertEq(c.pqcIssuer, pqcIssuer);
        assertEq(c.operationalIssuer, address(this));
        assertEq(c.maturity, 1_893_456_000);
        assertEq(c.couponRateBps, 500);
        assertEq(c.paymentsPerYear, 2);
        assertEq(c.faceValuePerToken, 100e6);
        assertEq(c.demoSupply, 1_500e18);
        assertEq(c.demoHolder, address(this));
        assertEq(c.paymentToken, address(0));
    }
}
