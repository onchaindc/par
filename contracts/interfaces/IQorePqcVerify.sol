// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IQorePqcVerify
/// @notice The QoreChain `pqcVerify` precompile at address 0x0A01.
/// @dev Interface transcribed from the QoreChain EVM precompile documentation (MIT):
/// https://docs.qorechain.io/developer-guide/evm-precompiles/
/// `pubkey` is a 2,592-byte ML-DSA-87 public key, `signature` is a 4,627-byte ML-DSA-87 signature and
/// `message` is the original, unhashed message. Gas: 25,000 + 8 per input byte.
interface IQorePqcVerify {
    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool valid);
}
