// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IIssuerAuthorizer
/// @notice Gate for sensitive issuer actions. It decides whether `issuer` authorised `message` with
/// `signature`; the caller decides what the message means.
interface IIssuerAuthorizer {
    /// @notice The only account allowed to authorise actions.
    function pqcIssuer() external view returns (address);

    /// @notice True when `signature` is a valid authorisation by `issuer` over `message`.
    function isAuthorized(address issuer, bytes calldata message, bytes calldata signature)
        external
        view
        returns (bool);
}
