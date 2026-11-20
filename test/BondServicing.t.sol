// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BondToken} from "../contracts/BondToken.sol";
import {BondServicing} from "../contracts/BondServicing.sol";
import {PqcIssuerAuthorizer} from "../contracts/access/PqcIssuerAuthorizer.sol";
import {MockPqcKeyStatus, MockPqcVerify, TestERC20, ReentrantERC20} from "./mocks/Mocks.sol";

contract BondServicingTest is Test {
    BondToken private bond;
    TestERC20 private payment;
    PqcIssuerAuthorizer private authorizer;
    BondServicing private servicing;
    MockPqcKeyStatus private keyStatus;
    MockPqcVerify private verifier;

    address private issuer = makeAddr("issuer");
    address private treasurer = makeAddr("treasurer");
    address private alice = makeAddr("alice");
    address private bob = makeAddr("bob");
    address private carol = makeAddr("carol");

    bytes private pubkey = new bytes(2592);
    bytes private signature = new bytes(4627);

    uint16 private constant COUPON_RATE_BPS = 500; // 5% annual
    uint8 private constant PAYMENTS_PER_YEAR = 2;
    uint128 private constant FACE_VALUE_PER_TOKEN = 100e6; // 100 TUSD per bond token
    uint128 private constant COUPON_PER_TOKEN = 2_500_000; // 2.5 TUSD per bond token per period
    uint256 private constant COUPON_REQUIRED = 3_750e6; // 1,500 tokens * 2.5
    uint256 private constant PRINCIPAL_REQUIRED = 150_000e6; // 1,500 tokens * 100

    uint64 private maturity;

    function setUp() public {
        vm.warp(1_800_000_000);

        bond = new BondToken("Par Bond 2030", "PAR30", issuer, 1_000_000e18);
        payment = new TestERC20();
        authorizer = new PqcIssuerAuthorizer(issuer);
        maturity = uint64(block.timestamp + 365 days);
        servicing = new BondServicing(
            bond,
            authorizer,
            issuer,
            address(payment),
            maturity,
            COUPON_RATE_BPS,
            PAYMENTS_PER_YEAR,
            FACE_VALUE_PER_TOKEN
        );

        keyStatus = new MockPqcKeyStatus();
        MockPqcVerify verifyImplementation = new MockPqcVerify();
        vm.etch(authorizer.PQC_KEY_STATUS(), address(keyStatus).code);
        vm.etch(authorizer.PQC_VERIFY(), address(verifyImplementation).code);
        keyStatus = MockPqcKeyStatus(authorizer.PQC_KEY_STATUS());
        verifier = MockPqcVerify(authorizer.PQC_VERIFY());
        keyStatus.setKey(true, 1, pubkey, true);
        verifier.setResult(true);

        vm.startPrank(issuer);
        bond.grantRole(bond.MINTER_ROLE(), issuer);
        servicing.grantRole(servicing.TREASURER_ROLE(), treasurer);
        bond.mint(alice, 1000e18);
        bond.mint(bob, 500e18);
        vm.stopPrank();

        payment.mint(treasurer, 10_000_000e6);
        vm.prank(treasurer);
        payment.approve(address(servicing), type(uint256).max);

        vm.roll(block.number + 1);
    }

    // ---------------------------------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------------------------------

    function _deadline() private view returns (uint64) {
        return uint64(block.timestamp + 1 days);
    }

    function _finalize(uint256 periodId) private {
        uint64 deadline = _deadline();
        bytes memory message = servicing.couponFinalizationMessage(periodId, deadline);
        verifier.expectMessage(message);
        vm.prank(issuer);
        servicing.finalizeCoupon(periodId, deadline, signature);
    }

    function _accurateCouponPeriod() private returns (uint256 periodId) {
        vm.prank(issuer);
        periodId = servicing.openCouponPeriod(uint64(block.number + 2));
        vm.roll(block.number + 3);
        _finalize(periodId);
        vm.prank(treasurer);
        servicing.fundCoupon(periodId, COUPON_REQUIRED);
    }

    // ---------------------------------------------------------------------------------------------
    // terms and schedule
    // ---------------------------------------------------------------------------------------------

    function testTermsRegistered() public view {
        BondServicing.BondTerms memory terms = servicing.terms();
        assertEq(terms.paymentToken, address(payment));
        assertEq(terms.maturity, maturity);
        assertEq(terms.couponRateBps, COUPON_RATE_BPS);
        assertEq(terms.paymentsPerYear, PAYMENTS_PER_YEAR);
        assertEq(terms.faceValuePerToken, FACE_VALUE_PER_TOKEN);
    }

    function testInvalidTermsRejected() public {
        vm.expectRevert(BondServicing.InvalidTerms.selector);
        new BondServicing(bond, authorizer, issuer, address(payment), maturity, 0, 2, FACE_VALUE_PER_TOKEN);

        vm.expectRevert(BondServicing.InvalidTerms.selector);
        new BondServicing(bond, authorizer, issuer, address(payment), maturity, 500, 5, FACE_VALUE_PER_TOKEN);
    }

    function testOnlyIssuerOpensPeriod() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, servicing.ISSUER_ROLE()
            )
        );
        vm.prank(alice);
        servicing.openCouponPeriod(uint64(block.number + 10));
    }

    function testRecordDateMustBeFutureAndUnique() public {
        uint64 recordDate = uint64(block.number + 10);
        vm.prank(issuer);
        servicing.openCouponPeriod(recordDate);

        vm.expectRevert(abi.encodeWithSelector(BondServicing.RecordDateAlreadyUsed.selector, recordDate));
        vm.prank(issuer);
        servicing.openCouponPeriod(recordDate);

        vm.expectRevert(abi.encodeWithSelector(BondServicing.RecordDateOrder.selector, recordDate - 1));
        vm.prank(issuer);
        servicing.openCouponPeriod(recordDate - 1);
    }

    function testRecordDateLockedAtItsBlockAndFinalizedAfterwards() public {
        uint64 recordDate = uint64(block.number + 5);
        vm.prank(issuer);
        uint256 periodId = servicing.openCouponPeriod(recordDate);

        uint64 moved = recordDate + 2;
        vm.prank(issuer);
        servicing.setCouponRecordDate(periodId, moved);
        assertEq(servicing.couponPeriod(periodId).recordDateBlock, moved);

        vm.roll(moved);
        vm.expectRevert(abi.encodeWithSelector(BondServicing.RecordDateLocked.selector, periodId));
        vm.prank(issuer);
        servicing.setCouponRecordDate(periodId, moved + 1);

        vm.roll(moved + 1);
        _finalize(periodId);

        vm.expectRevert(abi.encodeWithSelector(BondServicing.RecordDateFinalized.selector, periodId));
        vm.prank(issuer);
        servicing.setCouponRecordDate(periodId, moved + 10);
    }

    function testCannotFinalizeBeforeRecordDate() public {
        uint64 recordDate = uint64(block.number + 5);
        vm.prank(issuer);
        uint256 periodId = servicing.openCouponPeriod(recordDate);

        vm.expectRevert(abi.encodeWithSelector(BondServicing.RecordDateNotReached.selector, recordDate));
        vm.prank(issuer);
        servicing.finalizeCoupon(periodId, _deadline(), signature);
    }

    // ---------------------------------------------------------------------------------------------
    // entitlements and claims
    // ---------------------------------------------------------------------------------------------

    function testCouponEntitlementsUseRecordDateBalances() public {
        uint64 recordDate = uint64(block.number + 3);
        vm.prank(issuer);
        uint256 periodId = servicing.openCouponPeriod(recordDate);

        vm.roll(recordDate - 1);
        vm.prank(alice);
        bond.transfer(bob, 200e18);

        vm.roll(recordDate);
        vm.prank(bob);
        bond.transfer(carol, 100e18);

        vm.roll(recordDate + 1);
        _finalize(periodId);

        BondServicing.CouponPeriod memory period = servicing.couponPeriod(periodId);
        assertEq(period.couponPerToken, COUPON_PER_TOKEN);
        assertEq(period.requiredFunding, COUPON_REQUIRED);

        assertEq(servicing.couponEntitlement(periodId, alice), 2000e6);
        assertEq(servicing.couponEntitlement(periodId, bob), 1500e6);
        assertEq(servicing.couponEntitlement(periodId, carol), 250e6);

        // A transfer after the record date does not change anyone's entitlement.
        vm.prank(carol);
        bond.transfer(alice, 50e18);
        assertEq(servicing.couponEntitlement(periodId, carol), 250e6);
        assertEq(servicing.couponEntitlement(periodId, alice), 2000e6);
    }

    function testClaimsArePaidOnceAndTracked() public {
        uint256 periodId = _accurateCouponPeriod();

        vm.prank(alice);
        assertEq(servicing.claimCoupon(periodId), 2500e6);
        assertEq(payment.balanceOf(alice), 2500e6);

        vm.prank(bob);
        assertEq(servicing.claimCoupon(periodId), 1250e6);

        vm.expectRevert(abi.encodeWithSelector(BondServicing.AlreadyClaimed.selector, periodId, alice));
        vm.prank(alice);
        servicing.claimCoupon(periodId);

        // No holding at the record date, nothing to claim.
        vm.expectRevert(abi.encodeWithSelector(BondServicing.NothingToClaim.selector, periodId, carol));
        vm.prank(carol);
        servicing.claimCoupon(periodId);

        (uint256 required, uint256 funded, uint256 claimed, uint256 outstanding) =
            servicing.couponStatus(periodId);
        assertEq(required, COUPON_REQUIRED);
        assertEq(funded, COUPON_REQUIRED);
        assertEq(claimed, 3750e6);
        assertEq(outstanding, 0);
    }

    function testCouponClaimRequiresFullFunding() public {
        vm.prank(issuer);
        uint256 periodId = servicing.openCouponPeriod(uint64(block.number + 2));
        vm.roll(block.number + 3);
        _finalize(periodId);

        vm.prank(treasurer);
        servicing.fundCoupon(periodId, COUPON_REQUIRED - 1e6);

        vm.expectRevert(
            abi.encodeWithSelector(
                BondServicing.DistributionNotFullyFunded.selector, COUPON_REQUIRED, COUPON_REQUIRED - 1e6
            )
        );
        vm.prank(alice);
        servicing.claimCoupon(periodId);

        vm.prank(treasurer);
        servicing.fundCoupon(periodId, 1e6);

        vm.prank(alice);
        assertEq(servicing.claimCoupon(periodId), 2500e6);
    }

    function testFundingCannotExceedRequirement() public {
        vm.prank(issuer);
        uint256 periodId = servicing.openCouponPeriod(uint64(block.number + 2));
        vm.roll(block.number + 3);
        _finalize(periodId);

        vm.expectRevert(
            abi.encodeWithSelector(
                BondServicing.FundingExceedsRequirement.selector, COUPON_REQUIRED, 0, COUPON_REQUIRED + 1
            )
        );
        vm.prank(treasurer);
        servicing.fundCoupon(periodId, COUPON_REQUIRED + 1);
    }

    function testFundingBeforeFinalizationRejected() public {
        vm.prank(issuer);
        uint256 periodId = servicing.openCouponPeriod(uint64(block.number + 10));

        vm.expectRevert(abi.encodeWithSelector(BondServicing.CouponNotFinalized.selector, periodId));
        vm.prank(treasurer);
        servicing.fundCoupon(periodId, 1e6);
    }

    function testOnlyTreasurerCanFund() public {
        uint256 periodId = _accurateCouponPeriod();

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, servicing.TREASURER_ROLE()
            )
        );
        vm.prank(alice);
        servicing.fundCoupon(periodId, 1e6);
    }

    function testPeriodsAreIndependent() public {
        uint256 first = _accurateCouponPeriod();
        uint256 second = _accurateCouponPeriod();

        vm.prank(alice);
        servicing.claimCoupon(first);
        vm.prank(alice);
        servicing.claimCoupon(second);

        assertEq(payment.balanceOf(alice), 5000e6);
        assertEq(servicing.hasClaimedCoupon(first, alice), true);
        assertEq(servicing.hasClaimedCoupon(second, alice), true);
    }

    // ---------------------------------------------------------------------------------------------
    // PQC authorization
    // ---------------------------------------------------------------------------------------------

    function testOnlyIssuerRoleCanFinalize() public {
        vm.prank(issuer);
        uint256 periodId = servicing.openCouponPeriod(uint64(block.number + 2));
        vm.roll(block.number + 3);

        uint64 deadline = _deadline();
        bytes memory message = servicing.couponFinalizationMessage(periodId, deadline);
        verifier.expectMessage(message);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, servicing.ISSUER_ROLE()
            )
        );
        vm.prank(alice);
        servicing.finalizeCoupon(periodId, deadline, signature);
    }

    function testRejectedSignatureDoesNotConsumeNonce() public {
        vm.prank(issuer);
        uint256 periodId = servicing.openCouponPeriod(uint64(block.number + 2));
        vm.roll(block.number + 3);

        uint64 deadline = _deadline();
        bytes memory message = servicing.couponFinalizationMessage(periodId, deadline);
        verifier.expectMessage(message);
        verifier.setResult(false);

        vm.expectRevert(BondServicing.UnauthorizedIssuerAction.selector);
        vm.prank(issuer);
        servicing.finalizeCoupon(periodId, deadline, signature);
        assertEq(servicing.authorizationNonce(), 0);

        verifier.setResult(true);
        vm.prank(issuer);
        servicing.finalizeCoupon(periodId, deadline, signature);
        assertEq(servicing.authorizationNonce(), 1);
    }

    function testSignatureIsBoundToActionAndPeriod() public {
        vm.prank(issuer);
        uint256 first = servicing.openCouponPeriod(uint64(block.number + 2));
        vm.roll(block.number + 3);
        _finalize(first);

        vm.prank(issuer);
        uint256 second = servicing.openCouponPeriod(uint64(block.number + 2));
        vm.roll(block.number + 3);

        // The verifier still only accepts the message from the first period (and the nonce moved on).
        vm.expectRevert(BondServicing.UnauthorizedIssuerAction.selector);
        vm.prank(issuer);
        servicing.finalizeCoupon(second, _deadline(), signature);
    }

    // ---------------------------------------------------------------------------------------------
    // principal redemption
    // ---------------------------------------------------------------------------------------------

    function testPrincipalRedemptionAtMaturity() public {
        vm.warp(uint256(maturity) + 1);
        uint64 recordDate = uint64(block.number - 1);

        uint64 deadline = _deadline();
        bytes memory message = servicing.redemptionDeclarationMessage(recordDate, deadline);
        verifier.expectMessage(message);
        vm.prank(issuer);
        servicing.declareRedemption(recordDate, deadline, signature);

        BondServicing.Redemption memory redemption = servicing.redemption();
        assertTrue(redemption.declared);
        assertEq(redemption.requiredFunding, PRINCIPAL_REQUIRED);
        assertEq(servicing.redemptionEntitlement(alice), 100_000e6);
        assertEq(servicing.redemptionEntitlement(bob), 50_000e6);

        vm.prank(treasurer);
        servicing.fundRedemption(PRINCIPAL_REQUIRED);

        vm.prank(alice);
        assertEq(servicing.claimPrincipal(), 100_000e6);
        vm.prank(bob);
        assertEq(servicing.claimPrincipal(), 50_000e6);

        vm.expectRevert(abi.encodeWithSelector(BondServicing.PrincipalAlreadyClaimed.selector, alice));
        vm.prank(alice);
        servicing.claimPrincipal();

        (uint256 required, uint256 funded, uint256 claimed, uint256 outstanding) =
            servicing.redemptionStatus();
        assertEq(required, PRINCIPAL_REQUIRED);
        assertEq(funded, PRINCIPAL_REQUIRED);
        assertEq(claimed, PRINCIPAL_REQUIRED);
        assertEq(outstanding, 0);
    }

    function testOnlyIssuerRoleCanDeclareRedemption() public {
        vm.warp(uint256(maturity) + 1);
        uint64 recordDate = uint64(block.number - 1);
        uint64 deadline = _deadline();
        verifier.expectMessage(servicing.redemptionDeclarationMessage(recordDate, deadline));

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, servicing.ISSUER_ROLE()
            )
        );
        vm.prank(alice);
        servicing.declareRedemption(recordDate, deadline, signature);
    }

    function testExpiredDeadlineRejectedWithoutConsumingNonce() public {
        vm.prank(issuer);
        uint256 periodId = servicing.openCouponPeriod(uint64(block.number + 2));
        vm.roll(block.number + 3);

        uint64 deadline = uint64(block.timestamp - 1);
        vm.expectRevert(abi.encodeWithSelector(BondServicing.AuthorizationExpired.selector, deadline));
        vm.prank(issuer);
        servicing.finalizeCoupon(periodId, deadline, signature);
        assertEq(servicing.authorizationNonce(), 0);
    }

    function testRedemptionBeforeMaturityRejected() public {
        vm.expectRevert(abi.encodeWithSelector(BondServicing.BeforeMaturity.selector, maturity));
        vm.prank(issuer);
        servicing.declareRedemption(uint64(block.number - 1), _deadline(), signature);
    }

    function testRedemptionClaimRequiresFunding() public {
        vm.warp(uint256(maturity) + 1);
        uint64 recordDate = uint64(block.number - 1);
        uint64 deadline = _deadline();
        bytes memory message = servicing.redemptionDeclarationMessage(recordDate, deadline);
        verifier.expectMessage(message);
        vm.prank(issuer);
        servicing.declareRedemption(recordDate, deadline, signature);

        vm.expectRevert(
            abi.encodeWithSelector(BondServicing.DistributionNotFullyFunded.selector, PRINCIPAL_REQUIRED, 0)
        );
        vm.prank(alice);
        servicing.claimPrincipal();

        vm.expectRevert(BondServicing.RedemptionAlreadyDeclared.selector);
        vm.prank(issuer);
        servicing.declareRedemption(recordDate, deadline, signature);
    }

    function testRedemptionFundingCannotExceedRequirement() public {
        vm.warp(uint256(maturity) + 1);
        uint64 recordDate = uint64(block.number - 1);
        uint64 deadline = _deadline();
        bytes memory message = servicing.redemptionDeclarationMessage(recordDate, deadline);
        verifier.expectMessage(message);
        vm.prank(issuer);
        servicing.declareRedemption(recordDate, deadline, signature);

        vm.expectRevert(
            abi.encodeWithSelector(
                BondServicing.FundingExceedsRequirement.selector,
                PRINCIPAL_REQUIRED,
                0,
                PRINCIPAL_REQUIRED + 1
            )
        );
        vm.prank(treasurer);
        servicing.fundRedemption(PRINCIPAL_REQUIRED + 1);
    }
}

contract BondServicingReentrancyTest is Test {
    BondToken private bond;
    ReentrantERC20 private payment;
    PqcIssuerAuthorizer private authorizer;
    BondServicing private servicing;
    MockPqcKeyStatus private keyStatus;
    MockPqcVerify private verifier;

    address private issuer = makeAddr("issuer");
    address private treasurer = makeAddr("treasurer");
    address private alice = makeAddr("alice");

    bytes private pubkey = new bytes(2592);
    bytes private signature = new bytes(4627);

    function setUp() public {
        bond = new BondToken("Par Bond 2030", "PAR30", issuer, 1_000_000e18);
        payment = new ReentrantERC20();
        authorizer = new PqcIssuerAuthorizer(issuer);
        servicing = new BondServicing(
            bond, authorizer, issuer, address(payment), uint64(block.timestamp + 365 days), 500, 2, 100e6
        );

        keyStatus = new MockPqcKeyStatus();
        MockPqcVerify verifyImplementation = new MockPqcVerify();
        vm.etch(authorizer.PQC_KEY_STATUS(), address(keyStatus).code);
        vm.etch(authorizer.PQC_VERIFY(), address(verifyImplementation).code);
        keyStatus = MockPqcKeyStatus(authorizer.PQC_KEY_STATUS());
        verifier = MockPqcVerify(authorizer.PQC_VERIFY());
        keyStatus.setKey(true, 1, pubkey, true);
        verifier.setResult(true);

        vm.startPrank(issuer);
        bond.grantRole(bond.MINTER_ROLE(), issuer);
        servicing.grantRole(servicing.TREASURER_ROLE(), treasurer);
        bond.mint(alice, 1000e18);
        vm.stopPrank();
        vm.roll(block.number + 1);

        vm.prank(issuer);
        uint256 periodId = servicing.openCouponPeriod(uint64(block.number + 2));
        vm.roll(block.number + 3);
        uint64 deadline = uint64(block.timestamp + 1 days);
        bytes memory message = servicing.couponFinalizationMessage(periodId, deadline);
        verifier.expectMessage(message);
        vm.prank(issuer);
        servicing.finalizeCoupon(periodId, deadline, signature);

        payment.mint(treasurer, 1_000_000e6);
        vm.startPrank(treasurer);
        payment.approve(address(servicing), type(uint256).max);
        servicing.fundCoupon(periodId, 2500e6);
        vm.stopPrank();

        payment.arm(address(servicing), abi.encodeCall(BondServicing.claimCoupon, (periodId)));
    }

    function testClaimReentrancyIsBlocked() public {
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vm.prank(alice);
        servicing.claimCoupon(0);
    }
}
