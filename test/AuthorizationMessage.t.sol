// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {AuthorizationMessage} from "../contracts/lib/AuthorizationMessage.sol";

/// @dev These hashes are also asserted by tools/pqc-sign/sign.mjs, so the Solidity encoding and the
/// official QoreChain PQC signing path are checked against the same bytes.
contract AuthorizationMessageTest is Test {
    address private constant SERVICING = 0x1111111111111111111111111111111111111111;
    address private constant BOND = 0x2222222222222222222222222222222222222222;
    address private constant PQC_ISSUER = 0x3333333333333333333333333333333333333333;
    uint64 private constant DEADLINE = 1_893_456_000; // 2030-01-01T00:00:00Z

    function testCouponFinalizationMessageMatchesSigningFixture() public pure {
        bytes memory params =
            abi.encode(uint256(0), uint64(100), uint128(2_500_000), uint256(3_750_000_000), DEADLINE);
        bytes memory message = AuthorizationMessage.build(
            9800,
            SERVICING,
            BOND,
            PQC_ISSUER,
            keccak256("PAR_ACTION_FINALIZE_COUPON_V1"),
            7,
            DEADLINE,
            keccak256(params)
        );
        assertEq(keccak256(message), 0x8d6e46e9e47b137f08d8c9f87e4ad07bb4a36a2bf61c592bb523811157ae2ad4);
        assertEq(message.length, 288);
    }

    function testRedemptionDeclarationMessageMatchesSigningFixture() public pure {
        bytes memory params =
            abi.encode(uint64(100), uint128(100_000_000), uint256(150_000_000_000), DEADLINE);
        bytes memory message = AuthorizationMessage.build(
            9800,
            SERVICING,
            BOND,
            PQC_ISSUER,
            keccak256("PAR_ACTION_DECLARE_REDEMPTION_V1"),
            8,
            DEADLINE,
            keccak256(params)
        );
        assertEq(keccak256(message), 0x5372e6d0029d5b89b30fd81209f69d2ec9ac958c8380d0c093eb962237fdc1cd);
        assertEq(message.length, 288);
    }

    function testDeadlineIsBound() public pure {
        bytes32 paramsHash = keccak256(hex"1234");
        bytes32 action = keccak256("PAR_ACTION_FINALIZE_COUPON_V1");
        bytes32 first = keccak256(
            AuthorizationMessage.build(9800, SERVICING, BOND, PQC_ISSUER, action, 1, DEADLINE, paramsHash)
        );
        bytes32 second = keccak256(
            AuthorizationMessage.build(9800, SERVICING, BOND, PQC_ISSUER, action, 1, DEADLINE + 1, paramsHash)
        );
        assertTrue(first != second);
    }

    function testChainAndActionAreBound() public pure {
        bytes32 paramsHash = keccak256(hex"1234");
        bytes32 couponAction = keccak256("PAR_ACTION_FINALIZE_COUPON_V1");
        bytes32 redemptionAction = keccak256("PAR_ACTION_DECLARE_REDEMPTION_V1");

        bytes32 onTestnet = keccak256(
            AuthorizationMessage.build(
                9800, SERVICING, BOND, PQC_ISSUER, couponAction, 1, DEADLINE, paramsHash
            )
        );
        bytes32 onMainnet = keccak256(
            AuthorizationMessage.build(
                9801, SERVICING, BOND, PQC_ISSUER, couponAction, 1, DEADLINE, paramsHash
            )
        );
        bytes32 otherAction = keccak256(
            AuthorizationMessage.build(
                9800, SERVICING, BOND, PQC_ISSUER, redemptionAction, 1, DEADLINE, paramsHash
            )
        );

        assertTrue(onTestnet != onMainnet);
        assertTrue(onTestnet != otherAction);
    }

    /// @dev The operational sender is not in the message; the registered PQC identity is. A signature
    /// made for one PQC identity must not authorise another.
    function testPqcIssuerIdentityIsBound() public pure {
        bytes32 paramsHash = keccak256(hex"1234");
        bytes32 action = keccak256("PAR_ACTION_FINALIZE_COUPON_V1");
        bytes32 first = keccak256(
            AuthorizationMessage.build(9800, SERVICING, BOND, PQC_ISSUER, action, 1, DEADLINE, paramsHash)
        );
        bytes32 otherIdentity = keccak256(
            AuthorizationMessage.build(
                9800,
                SERVICING,
                BOND,
                address(0x4444444444444444444444444444444444444444),
                action,
                1,
                DEADLINE,
                paramsHash
            )
        );
        assertTrue(first != otherIdentity);
    }

    function testServicingContractAndBondAreBound() public pure {
        bytes32 paramsHash = keccak256(hex"1234");
        bytes32 action = keccak256("PAR_ACTION_FINALIZE_COUPON_V1");
        bytes32 base = keccak256(
            AuthorizationMessage.build(9800, SERVICING, BOND, PQC_ISSUER, action, 1, DEADLINE, paramsHash)
        );
        bytes32 otherServicing = keccak256(
            AuthorizationMessage.build(
                9800,
                address(0x5555555555555555555555555555555555555555),
                BOND,
                PQC_ISSUER,
                action,
                1,
                DEADLINE,
                paramsHash
            )
        );
        bytes32 otherBond = keccak256(
            AuthorizationMessage.build(
                9800,
                SERVICING,
                address(0x6666666666666666666666666666666666666666),
                PQC_ISSUER,
                action,
                1,
                DEADLINE,
                paramsHash
            )
        );
        assertTrue(base != otherServicing);
        assertTrue(base != otherBond);
    }
}
