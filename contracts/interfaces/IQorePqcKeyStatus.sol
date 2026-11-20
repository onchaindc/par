// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/// @title IQorePqcKeyStatus
/// @notice The QoreChain `pqcKeyStatus` precompile at address 0x0A02.
/// @dev Copied from QoreChain Asset Kit v0.1.0 (`contracts/src/interfaces/IQorePqcKeyStatus.sol`,
/// Copyright 2026 QoreChain Association, Apache-2.0). Kept under its original licence; see NOTICE.
///
/// The chain returns four fields from v3.2.4 (`pqc-possession-flag`): the boolean is appended after
/// the dynamic `pubkey`. PAR requires this exact four-field layout and `possessionProven == true`;
/// the older three-field answer is rejected (see `PqcIssuerAuthorizer.decodeRegisteredKey`).
interface IQorePqcKeyStatus {
    function pqcKeyStatus(address account)
        external
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey, bool possessionProven);
}
