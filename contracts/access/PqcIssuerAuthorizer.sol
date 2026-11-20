// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IIssuerAuthorizer} from "../interfaces/IIssuerAuthorizer.sol";
import {IQorePqcKeyStatus} from "../interfaces/IQorePqcKeyStatus.sol";
import {IQorePqcVerify} from "../interfaces/IQorePqcVerify.sol";

/// @title PqcIssuerAuthorizer
/// @notice Verifies that a sensitive issuer action was signed by the ML-DSA-87 key registered to the
/// issuer's account on QoreChain, with proof of possession.
/// @dev Two precompiles are involved, and they are not interchangeable:
/// - 0x0A02 `pqcKeyStatus(address)` returns the public key registered to the address (registration).
/// - 0x0A01 `pqcVerify(pubkey, signature, message)` verifies an ML-DSA-87 signature (cryptography).
///
/// The flow is: read the registered key from 0x0A02, require the four-field response introduced by
/// `pqc-possession-flag` (registered, algorithm id 1, 2,592-byte key, possessionProven), then require
/// 0x0A01 to accept the signature over `message` with that key. Requiring `possessionProven` is
/// essential: a registered key without a proof may belong to a different account.
///
/// Both calls fail closed: if a precompile is not active on the network, returns malformed data or
/// reverts, authorisation is refused. This contract performs no verification in Solidity itself and
/// must not be used on a chain where the precompiles are absent.
contract PqcIssuerAuthorizer is IIssuerAuthorizer {
    /// @notice QoreChain PQC Verify precompile.
    address public constant PQC_VERIFY = address(0x0A01);

    /// @notice QoreChain PQC Key Status precompile.
    address public constant PQC_KEY_STATUS = address(0x0A02);

    /// @notice Algorithm id of ML-DSA-87 (Dilithium-5).
    uint8 public constant ML_DSA_87 = 1;

    /// @notice Size of an ML-DSA-87 public key.
    uint256 public constant ML_DSA_87_PUBLIC_KEY_BYTES = 2592;

    /// @notice Size of an ML-DSA-87 signature.
    uint256 public constant ML_DSA_87_SIGNATURE_BYTES = 4627;

    /// @dev A four-field `pqcKeyStatus` answer for a 2,592-byte key:
    /// 4 head words + the pubkey length word + 81 key words = 2,752 bytes.
    uint256 private constant KEY_STATUS_RESPONSE_BYTES = 2752;

    /// @dev 0x0A02 charges a flat 2,500 gas. The larger cap also accommodates a 2,592-byte key
    /// returned by a local test double; unused gas is not charged.
    uint256 private constant KEY_STATUS_GAS = 200_000;

    /// @dev 0x0A01 charges 25,000 + 8 per input byte; an ML-DSA-87 check is roughly 85,000 gas.
    uint256 private constant VERIFY_GAS = 250_000;

    /// @notice The address whose registered key may authorise Par actions.
    address public immutable pqcIssuer;

    error ZeroAddress();

    constructor(address issuer_) {
        if (issuer_ == address(0)) revert ZeroAddress();
        pqcIssuer = issuer_;
    }

    /// @inheritdoc IIssuerAuthorizer
    function isAuthorized(address issuer, bytes calldata message, bytes calldata signature)
        external
        view
        returns (bool)
    {
        if (issuer != pqcIssuer) return false;
        if (signature.length != ML_DSA_87_SIGNATURE_BYTES) return false;

        (bool keyAvailable, bytes memory pubkey) = registeredPublicKey(issuer);
        if (!keyAvailable) return false;

        return _verify(pubkey, signature, message);
    }

    /// @notice The possession-proven ML-DSA-87 public key registered to `account`.
    /// @return available False when the precompile is absent, the answer is not the exact four-field
    /// layout, the account has no ML-DSA-87 key, or possession was not proven.
    /// @return pubkey The registered key when `available` is true.
    function registeredPublicKey(address account) public view returns (bool available, bytes memory pubkey) {
        (bool ok, bytes memory ret) = PQC_KEY_STATUS.staticcall{gas: KEY_STATUS_GAS}(
            abi.encodeCall(IQorePqcKeyStatus.pqcKeyStatus, (account))
        );
        if (!ok) return (false, "");
        return decodeRegisteredKey(ret);
    }

    /// @notice Strict decoder for the four-field `pqcKeyStatus` answer.
    /// @dev The only accepted layout is the one implemented by the chain's
    /// `EncodePQCKeyStatusOutputWithPossession`: `(bool registered, uint8 algorithmId, bytes pubkey,
    /// bool possessionProven)` with a 2,592-byte key, which is exactly 2,752 bytes. The three-field
    /// layout, any other offset, a non-ML-DSA-87 algorithm, an unregistered account, a key of the
    /// wrong length, `possessionProven == false` and trailing data are all rejected. This deliberately
    /// does not preserve backward compatibility with pre-`pqc-possession-flag` responses.
    function decodeRegisteredKey(bytes memory ret) public pure returns (bool available, bytes memory pubkey) {
        if (ret.length != KEY_STATUS_RESPONSE_BYTES) return (false, "");

        uint256 registeredWord;
        uint256 algorithmWord;
        uint256 keyOffset;
        uint256 possessionWord;
        uint256 keyLength;
        assembly {
            registeredWord := mload(add(ret, 0x20))
            algorithmWord := mload(add(ret, 0x40))
            keyOffset := mload(add(ret, 0x60))
            possessionWord := mload(add(ret, 0x80))
            keyLength := mload(add(ret, 0xa0))
        }

        if (registeredWord != 1) return (false, "");
        if (algorithmWord != ML_DSA_87) return (false, "");
        if (keyOffset != 0x80) return (false, "");
        if (possessionWord != 1) return (false, "");
        if (keyLength != ML_DSA_87_PUBLIC_KEY_BYTES) return (false, "");

        pubkey = new bytes(ML_DSA_87_PUBLIC_KEY_BYTES);
        uint256 source;
        uint256 destination;
        assembly {
            // key bytes begin after the four head words and the length word:
            // ret + length word + 4 heads + key length word
            source := add(ret, 0xc0)
            destination := add(pubkey, 0x20)
        }
        for (uint256 i; i < ML_DSA_87_PUBLIC_KEY_BYTES; i += 32) {
            assembly {
                mstore(add(destination, i), mload(add(source, i)))
            }
        }
        return (true, pubkey);
    }

    /// @dev Calls 0x0A01. Any failure, malformed return or a value other than the ABI word `1` is a
    /// refusal. The precompile returns `false` rather than reverting for an invalid signature.
    function _verify(bytes memory pubkey, bytes calldata signature, bytes calldata message)
        private
        view
        returns (bool)
    {
        (bool ok, bytes memory ret) = PQC_VERIFY.staticcall{gas: VERIFY_GAS}(
            abi.encodeCall(IQorePqcVerify.pqcVerify, (pubkey, signature, message))
        );
        if (!ok || ret.length != 32) return false;
        uint256 resultWord;
        assembly {
            resultWord := mload(add(ret, 0x20))
        }
        return resultWord == 1;
    }
}
