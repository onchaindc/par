// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {BondToken} from "../contracts/BondToken.sol";

contract BondTokenTest is Test {
    BondToken private token;

    address private admin = address(0xA11CE);
    address private issuer = address(0x1550);
    address private alice = address(0xA1);
    address private bob = address(0xB0);
    address private carol = address(0xCA);

    uint256 private constant CAP = 1_000_000e18;

    function setUp() public {
        token = new BondToken("Par Bond 2030", "PAR30", admin, CAP);
        bytes32 minterRole = token.MINTER_ROLE();
        vm.prank(admin);
        token.grantRole(minterRole, issuer);
    }

    function testMintAndCap() public {
        vm.prank(issuer);
        token.mint(alice, 600_000e18);
        vm.prank(issuer);
        token.mint(bob, 400_000e18);
        assertEq(token.totalSupply(), CAP);

        vm.expectRevert(abi.encodeWithSelector(BondToken.CapExceeded.selector, CAP, CAP + 1));
        vm.prank(issuer);
        token.mint(alice, 1);
    }

    function testOnlyMinterCanMint() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")),
                alice,
                token.MINTER_ROLE()
            )
        );
        vm.prank(alice);
        token.mint(alice, 1);
    }

    function testHistoricalBalancesAcrossBlocks() public {
        vm.prank(issuer);
        token.mint(alice, 1000e18);
        uint256 mintBlock = block.number;

        vm.roll(block.number + 1);
        assertEq(token.balanceOfAt(alice, mintBlock), 1000e18);

        vm.prank(alice);
        token.transfer(bob, 400e18);
        uint256 transferBlock = block.number;

        vm.roll(block.number + 1);
        assertEq(token.balanceOfAt(bob, mintBlock), 0);
        assertEq(token.balanceOfAt(bob, transferBlock), 400e18);
        assertEq(token.balanceOfAt(alice, transferBlock), 600e18);
        assertEq(token.balanceOfAt(alice, transferBlock - 1), 1000e18);
        assertEq(token.totalSupplyAt(transferBlock), 1000e18);
    }

    function testMultipleMovementsInOneBlockCollapse() public {
        vm.prank(issuer);
        token.mint(alice, 1000e18);
        vm.roll(block.number + 1);
        uint256 countBefore = token.checkpointCount(alice);

        vm.startPrank(alice);
        token.transfer(bob, 100e18);
        token.transfer(carol, 100e18);
        token.transfer(bob, 100e18);
        vm.stopPrank();

        assertEq(token.checkpointCount(alice), countBefore + 1);
        vm.roll(block.number + 1);
        assertEq(token.balanceOfAt(alice, block.number - 1), 700e18);
    }

    function testCurrentBlockIsNotQueryable() public {
        vm.prank(issuer);
        token.mint(alice, 1e18);
        vm.expectRevert(
            abi.encodeWithSelector(BondToken.FutureBlockLookup.selector, block.number, block.number)
        );
        token.balanceOfAt(alice, block.number);
        vm.expectRevert(
            abi.encodeWithSelector(BondToken.FutureBlockLookup.selector, block.number, block.number)
        );
        token.totalSupplyAt(block.number);
    }

    function testUnknownAccountHistoryIsZero() public {
        vm.roll(block.number + 10);
        assertEq(token.balanceOfAt(carol, block.number - 1), 0);
    }
}
