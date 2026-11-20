// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PqcIssuerAuthorizer} from "../contracts/access/PqcIssuerAuthorizer.sol";
import {IQorePqcKeyStatus} from "../contracts/interfaces/IQorePqcKeyStatus.sol";
import {IQorePqcVerify} from "../contracts/interfaces/IQorePqcVerify.sol";
import {
    MockPqcKeyStatus,
    MockPqcKeyStatusLegacy,
    MockPqcKeyStatusMalformed,
    MockPqcVerify,
    MockPqcVerifyMalformed,
    MockPqcVerifyNonBool,
    MockPqcVerifyReverting
} from "./mocks/Mocks.sol";

contract PqcIssuerAuthorizerTest is Test {
    PqcIssuerAuthorizer private authorizer;
    MockPqcKeyStatus private keyStatus;
    MockPqcVerify private verifier;

    address private issuer = makeAddr("issuer");
    bytes private pubkey = new bytes(2592);
    bytes private signature = new bytes(4627);
    bytes private message = hex"c0ffee";

    function setUp() public {
        authorizer = new PqcIssuerAuthorizer(issuer);
        keyStatus = new MockPqcKeyStatus();
        verifier = new MockPqcVerify();
        vm.etch(authorizer.PQC_KEY_STATUS(), address(keyStatus).code);
        vm.etch(authorizer.PQC_VERIFY(), address(verifier).code);
        MockPqcKeyStatus(authorizer.PQC_KEY_STATUS()).setKey(true, 1, pubkey, true);
        MockPqcVerify(authorizer.PQC_VERIFY()).setResult(true);
    }

    // ---------------------------------------------------------------------------------------------
    // ABI pinned against qorechain-core
    // ---------------------------------------------------------------------------------------------

    /// @dev x/vm/precompiles/abi_helpers.go computes both selectors from these exact signatures.
    function testSelectorsMatchOfficialDefinition() public pure {
        assertEq(IQorePqcVerify.pqcVerify.selector, bytes4(0xf52bde0a));
        assertEq(IQorePqcKeyStatus.pqcKeyStatus.selector, bytes4(0x850dfe51));
        assertEq(IQorePqcVerify.pqcVerify.selector, bytes4(keccak256("pqcVerify(bytes,bytes,bytes)")));
        assertEq(IQorePqcKeyStatus.pqcKeyStatus.selector, bytes4(keccak256("pqcKeyStatus(address)")));
    }

    // ---------------------------------------------------------------------------------------------
    // key status acceptance and rejection
    // ---------------------------------------------------------------------------------------------

    function testAcceptsRegisteredPossessionProvenMlDsaKey() public {
        assertTrue(authorizer.isAuthorized(issuer, message, signature));
    }

    function testRejectsOtherIssuer() public {
        assertFalse(authorizer.isAuthorized(makeAddr("mallory"), message, signature));
    }

    function testClosedWithoutPrecompiles() public {
        vm.etch(authorizer.PQC_KEY_STATUS(), "");
        vm.etch(authorizer.PQC_VERIFY(), "");
        assertFalse(authorizer.isAuthorized(issuer, message, signature));
    }

    function testClosedWithoutVerifyPrecompile() public {
        vm.etch(authorizer.PQC_VERIFY(), "");
        assertFalse(authorizer.isAuthorized(issuer, message, signature));
    }

    function testClosedWithoutKeyStatusPrecompile() public {
        vm.etch(authorizer.PQC_KEY_STATUS(), "");
        assertFalse(authorizer.isAuthorized(issuer, message, signature));
    }

    function testRejectsUnregisteredKey() public {
        MockPqcKeyStatus(authorizer.PQC_KEY_STATUS()).setKey(false, 1, pubkey, true);
        assertFalse(authorizer.isAuthorized(issuer, message, signature));
    }

    function testRejectsUnprovenPossession() public {
        MockPqcKeyStatus(authorizer.PQC_KEY_STATUS()).setKey(true, 1, pubkey, false);
        assertFalse(authorizer.isAuthorized(issuer, message, signature));
        (bool available,) = authorizer.registeredPublicKey(issuer);
        assertFalse(available);
    }

    function testRejectsNonMlDsaAlgorithm() public {
        MockPqcKeyStatus(authorizer.PQC_KEY_STATUS()).setKey(true, 2, pubkey, true);
        assertFalse(authorizer.isAuthorized(issuer, message, signature));
    }

    function testRejectsWrongKeyLength() public {
        MockPqcKeyStatus(authorizer.PQC_KEY_STATUS()).setKey(true, 1, new bytes(100), true);
        assertFalse(authorizer.isAuthorized(issuer, message, signature));
    }

    function testRejectsEmptyKey() public {
        MockPqcKeyStatus(authorizer.PQC_KEY_STATUS()).setKey(true, 1, new bytes(0), true);
        assertFalse(authorizer.isAuthorized(issuer, message, signature));
    }

    function testRejectsThreeFieldLayout() public {
        MockPqcKeyStatusLegacy legacy = new MockPqcKeyStatusLegacy();
        vm.etch(authorizer.PQC_KEY_STATUS(), address(legacy).code);
        assertFalse(authorizer.isAuthorized(issuer, message, signature));
    }

    function testClosedOnMalformedKeyAnswer() public {
        MockPqcKeyStatusMalformed malformed = new MockPqcKeyStatusMalformed();
        vm.etch(authorizer.PQC_KEY_STATUS(), address(malformed).code);
        assertFalse(authorizer.isAuthorized(issuer, message, signature));
    }

    // ---------------------------------------------------------------------------------------------
    // strict decoder
    // ---------------------------------------------------------------------------------------------

    function testDecodesExactFourFieldLayout() public view {
        (bool available, bytes memory decoded) =
            authorizer.decodeRegisteredKey(abi.encode(true, uint8(1), pubkey, true));
        assertTrue(available);
        assertEq(keccak256(decoded), keccak256(pubkey));
    }

    function testDecodesRegisteredPublicKey() public view {
        (bool available, bytes memory decoded) = authorizer.registeredPublicKey(issuer);
        assertTrue(available);
        assertEq(keccak256(decoded), keccak256(pubkey));
    }

    function testDecoderRejectsThreeFieldEncoding() public view {
        (bool available,) = authorizer.decodeRegisteredKey(abi.encode(true, uint8(1), pubkey));
        assertFalse(available);
    }

    function testDecoderRejectsUnprovenEncoding() public view {
        (bool available,) = authorizer.decodeRegisteredKey(abi.encode(true, uint8(1), pubkey, false));
        assertFalse(available);
    }

    function testDecoderRejectsWrongAlgorithm() public view {
        (bool available,) = authorizer.decodeRegisteredKey(abi.encode(true, uint8(2), pubkey, true));
        assertFalse(available);
    }

    function testDecoderRejectsUnregistered() public view {
        (bool available,) = authorizer.decodeRegisteredKey(abi.encode(false, uint8(1), pubkey, true));
        assertFalse(available);
    }

    function testDecoderRejectsWrongKeyOffset() public view {
        bytes memory encoded = abi.encode(true, uint8(1), pubkey, true);
        assembly {
            mstore(add(encoded, 0x60), 0x60)
        }
        (bool available,) = authorizer.decodeRegisteredKey(encoded);
        assertFalse(available);
    }

    function testDecoderRejectsNonBooleanRegisteredWord() public view {
        bytes memory encoded = abi.encode(true, uint8(1), pubkey, true);
        assembly {
            mstore(add(encoded, 0x20), 2)
        }
        (bool available,) = authorizer.decodeRegisteredKey(encoded);
        assertFalse(available);
    }

    function testDecoderRejectsNonBooleanPossessionWord() public view {
        bytes memory encoded = abi.encode(true, uint8(1), pubkey, true);
        assembly {
            mstore(add(encoded, 0x80), 2)
        }
        (bool available,) = authorizer.decodeRegisteredKey(encoded);
        assertFalse(available);
    }

    function testDecoderRejectsTrailingData() public view {
        bytes memory encoded = abi.encode(true, uint8(1), pubkey, true);
        (bool available,) = authorizer.decodeRegisteredKey(bytes.concat(encoded, hex"00"));
        assertFalse(available);
    }

    function testDecoderRejectsTruncatedData() public view {
        bytes memory encoded = abi.encode(true, uint8(1), pubkey, true);
        bytes memory truncated = new bytes(encoded.length - 1);
        for (uint256 i; i < truncated.length; ++i) {
            truncated[i] = encoded[i];
        }
        (bool available,) = authorizer.decodeRegisteredKey(truncated);
        assertFalse(available);
    }

    function testDecoderRejectsWrongKeyLengthWord() public view {
        bytes memory encoded = abi.encode(true, uint8(1), pubkey, true);
        assembly {
            mstore(add(encoded, 0xa0), 2591)
        }
        (bool available,) = authorizer.decodeRegisteredKey(encoded);
        assertFalse(available);
    }

    function testDecoderRejectsEmptyResponse() public view {
        (bool available,) = authorizer.decodeRegisteredKey("");
        assertFalse(available);
    }

    // ---------------------------------------------------------------------------------------------
    // signature checks
    // ---------------------------------------------------------------------------------------------

    function testRejectsWrongSignatureLength() public view {
        assertFalse(authorizer.isAuthorized(issuer, message, new bytes(4626)));
    }

    function testRejectsFailedVerification() public {
        MockPqcVerify(authorizer.PQC_VERIFY()).setResult(false);
        assertFalse(authorizer.isAuthorized(issuer, message, signature));
    }

    function testBindsSignatureToMessage() public {
        bytes memory otherMessage = hex"beef";
        MockPqcVerify(authorizer.PQC_VERIFY()).expectMessage(otherMessage);
        assertFalse(authorizer.isAuthorized(issuer, message, signature));
        assertTrue(authorizer.isAuthorized(issuer, otherMessage, signature));
    }

    function testClosedOnMalformedVerifyAnswer() public {
        MockPqcVerifyMalformed malformed = new MockPqcVerifyMalformed();
        vm.etch(authorizer.PQC_VERIFY(), address(malformed).code);
        assertFalse(authorizer.isAuthorized(issuer, message, signature));
    }

    function testClosedOnNonBooleanVerifyAnswer() public {
        MockPqcVerifyNonBool malformed = new MockPqcVerifyNonBool();
        vm.etch(authorizer.PQC_VERIFY(), address(malformed).code);
        assertFalse(authorizer.isAuthorized(issuer, message, signature));
    }

    function testClosedOnRevertingVerifyAnswer() public {
        MockPqcVerifyReverting reverting = new MockPqcVerifyReverting();
        vm.etch(authorizer.PQC_VERIFY(), address(reverting).code);
        assertFalse(authorizer.isAuthorized(issuer, message, signature));
    }
}
