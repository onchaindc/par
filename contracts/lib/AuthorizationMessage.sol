// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title AuthorizationMessage
/// @notice Builds the exact bytes an issuer signs with ML-DSA-87 for a Par servicing action.
/// @dev Domain separation: the message names the scheme, chain, servicing contract and bond, the
/// action type, a one-time nonce and a deadline. The action parameters are committed as a hash.
/// The JS integration script in `tools/pqc-sign` reproduces this encoding and a test pins the hash.
library AuthorizationMessage {
    bytes32 internal constant DOMAIN = keccak256("PAR_BOND_AUTHORIZATION_V1");

    function build(
        uint256 chainId,
        address servicing,
        address bond,
        bytes32 action,
        uint256 nonce,
        uint64 deadline,
        bytes32 paramsHash
    ) internal pure returns (bytes memory) {
        return abi.encode(DOMAIN, chainId, servicing, bond, action, nonce, deadline, paramsHash);
    }
}
