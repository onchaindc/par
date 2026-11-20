// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {AuthorizationMessage} from "../contracts/lib/AuthorizationMessage.sol";

/// @dev These hashes are also asserted by tools/pqc-sign/sign.mjs, so the Solidity encoding and the
/// official QoreChain PQC signing path are checked against the same bytes.
contract AuthorizationMessageTest is Test {
    address private constant SERVICING = 0x1111111111111111111111111111111111111111;
    address private constant BOND = 0x2222222222222222222222222222222222222222;
    uint64 private constant DEADLINE = 1_893_456_000; // 2030-01-01T00:00:00Z

    function testCouponFinalizationMessageMatchesSigningFixture() public pure {
        bytes memory params =
            abi.encode(uint256(0), uint64(100), uint128(2_500_000), uint256(3_750_000_000), DEADLINE);
        bytes memory message = AuthorizationMessage.build(
            9800, SERVICING, BOND, keccak256("PAR_ACTION_FINALIZE_COUPON_V1"), 7, DEADLINE, keccak256(params)
        );
        assertEq(keccak256(message), 0x266c8e516dacb848a2b62b8970803d4d32aeea66d0409f251fe9e8d8671dcbfe);
        assertEq(message.length, 256);
    }

    function testRedemptionDeclarationMessageMatchesSigningFixture() public pure {
        bytes memory params =
            abi.encode(uint64(100), uint128(100_000_000), uint256(150_000_000_000), DEADLINE);
        bytes memory message = AuthorizationMessage.build(
            9800,
            SERVICING,
            BOND,
            keccak256("PAR_ACTION_DECLARE_REDEMPTION_V1"),
            8,
            DEADLINE,
            keccak256(params)
        );
        assertEq(keccak256(message), 0xc71335b4e6766c5b4c61a0831c0f75c07caf0e1b8bbc7a46f3ede2a4335f78b4);
        assertEq(message.length, 256);
    }

    function testDeadlineIsBound() public pure {
        bytes32 paramsHash = keccak256(hex"1234");
        bytes32 action = keccak256("PAR_ACTION_FINALIZE_COUPON_V1");
        bytes32 first =
            keccak256(AuthorizationMessage.build(9800, SERVICING, BOND, action, 1, DEADLINE, paramsHash));
        bytes32 second =
            keccak256(AuthorizationMessage.build(9800, SERVICING, BOND, action, 1, DEADLINE + 1, paramsHash));
        assertTrue(first != second);
    }

    function testChainAndActionAreBound() public pure {
        bytes32 paramsHash = keccak256(hex"1234");
        bytes32 couponAction = keccak256("PAR_ACTION_FINALIZE_COUPON_V1");
        bytes32 redemptionAction = keccak256("PAR_ACTION_DECLARE_REDEMPTION_V1");

        bytes32 onTestnet = keccak256(
            AuthorizationMessage.build(9800, SERVICING, BOND, couponAction, 1, DEADLINE, paramsHash)
        );
        bytes32 onMainnet = keccak256(
            AuthorizationMessage.build(9801, SERVICING, BOND, couponAction, 1, DEADLINE, paramsHash)
        );
        bytes32 otherAction = keccak256(
            AuthorizationMessage.build(9800, SERVICING, BOND, redemptionAction, 1, DEADLINE, paramsHash)
        );

        assertTrue(onTestnet != onMainnet);
        assertTrue(onTestnet != otherAction);
    }
}
