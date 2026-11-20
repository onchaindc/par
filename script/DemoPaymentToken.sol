// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title DemoPaymentToken
/// @notice Six-decimal settlement token used by the testnet demo deployment.
/// @dev This is not part of the bond architecture. It exists so the demo bond has a payment token
/// with the same 6-decimal shape as the fixture (face value 100e6 base units per bond token).
/// The whole supply is minted once in the constructor to the treasurer, who funds coupons and
/// principal; there is no mint function afterwards.
contract DemoPaymentToken is ERC20 {
    error ZeroAddress();
    error ZeroSupply();

    constructor(address recipient_, uint256 supply_) ERC20("Par Demo USD", "pUSD") {
        if (recipient_ == address(0)) revert ZeroAddress();
        if (supply_ == 0) revert ZeroSupply();
        _mint(recipient_, supply_);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
